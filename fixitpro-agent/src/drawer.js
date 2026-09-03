'use strict'

const net = require('net')
const { execSync } = require('child_process')
const os = require('os')
const fs = require('fs')
const path = require('path')

// Encode PS script as Base64 UTF-16LE so heredocs, quotes, newlines all survive
function psEncode(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function runPS(script, opts = {}) {
  const encoded = psEncode(script)
  return execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
    encoding: 'utf8',
    ...opts,
  })
}

// ESC/POS: ESC p pin t1 t2 — send both pin 2 and pin 5 to cover all drawer wiring
const DRAWER_PULSE = Buffer.from([
  0x1B, 0x70, 0x00, 0x32, 0xFA,  // pin 2 (most common)
  0x1B, 0x70, 0x01, 0x32, 0xFA,  // pin 5 (some models)
])

/**
 * Open drawer via Network printer (raw TCP port 9100)
 * Works for: WiFi/LAN printers with a fixed IP
 */
function openDrawerNetwork(ip, port) {
  port = port || 9100
  return new Promise((resolve, reject) => {
    const client = net.createConnection(port, ip, () => {
      client.write(DRAWER_PULSE)
      client.end()
      resolve({ method: 'network', ip, port })
    })
    client.setTimeout(3000, () => {
      client.destroy()
      reject(new Error(`Timeout connecting to ${ip}:${port}`))
    })
    client.on('error', reject)
  })
}

/**
 * Open drawer via Windows printer name (USB or shared printer)
 * Uses PowerShell + Win32 winspool.drv to send raw bytes
 * Works for: USB printers, Windows shared printers
 */
function openDrawerWindows(printerName) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `fixitpro_drawer_${Date.now()}.bin`)
    try {
      fs.writeFileSync(tmpFile, DRAWER_PULSE)
    } catch (err) {
      return reject(new Error(`Cannot write temp file: ${err.message}`))
    }

    // PowerShell forward-slash paths work fine and avoid double-backslash bugs
    const psPath = tmpFile.replace(/\\/g, '/')
    const escapedPrinter = printerName.replace(/'/g, "''")

    // Get the USB port name from Windows (e.g. USB001) then write raw bytes
    // directly to \\.\USB001 — bypasses the printer driver entirely
    // Write ESC/POS bytes directly to the USB device port (bypasses driver)
    const script = `
$ErrorActionPreference = 'Stop'
$printerName = '${escapedPrinter}'
$portName = (Get-Printer -Name $printerName -ErrorAction Stop).PortName
if (-not $portName) { throw "Cannot find port for printer: $printerName" }
$data = [byte[]](0x1B, 0x70, 0x00, 0x32, 0xFA, 0x1B, 0x70, 0x01, 0x32, 0xFA)
$tmp = [System.IO.Path]::GetTempFileName() + '.bin'
[System.IO.File]::WriteAllBytes($tmp, $data)
$devicePath = '\\\\.' + '\\' + $portName
try {
  $out = & cmd /c "copy /b ""$tmp"" ""$devicePath""" 2>&1
  if ($LASTEXITCODE -ne 0) { throw "copy to $devicePath failed: $out" }
  Write-Output "OK:$portName"
} finally {
  Remove-Item $tmp -ErrorAction SilentlyContinue
}
`.trim()

    try {
      const out = runPS(script, { timeout: 15000 })
      console.log(`[Drawer] Windows print result: ${out.trim()}`)
      resolve({ method: 'windows', printer: printerName, output: out.trim() })
    } catch (err) {
      const msg = (err.stderr || err.stdout || err.message || '').toString().trim()
      console.error(`[Drawer] Windows print error: ${msg}`)
      reject(new Error(`PowerShell error: ${msg}`))
    } finally {
      try { fs.unlinkSync(tmpFile) } catch {}
    }
  })
}

/**
 * Open drawer via COM port (Bluetooth virtual serial, USB virtual COM)
 * Works for: Bluetooth printers, some USB printers with virtual COM port
 */
function openDrawerSerial(comPort, baudRate) {
  baudRate = baudRate || 9600
  return new Promise((resolve, reject) => {
    const script = `
$ErrorActionPreference = 'Stop'
$port = New-Object System.IO.Ports.SerialPort('${comPort}', ${baudRate})
$port.ReadTimeout = 500
$port.WriteTimeout = 2000
$port.Open()
Start-Sleep -Milliseconds 300
$data = [byte[]](0x1B, 0x70, 0x00, 0x32, 0xFA, 0x1B, 0x70, 0x01, 0x32, 0xFA)
$port.Write($data, 0, $data.Length)
Start-Sleep -Milliseconds 100
$port.Close()
Write-Output "OK"
`.trim()
    try {
      const out = runPS(script, { timeout: 8000 })
      console.log(`[Drawer] Serial ${comPort}@${baudRate}: ${out.trim()}`)
      resolve({ method: 'serial', port: comPort, output: out.trim() })
    } catch (err) {
      const msg = (err.stderr || err.stdout || err.message || '').toString().trim()
      console.error(`[Drawer] Serial error ${comPort}: ${msg}`)
      reject(new Error(`Serial error on ${comPort}: ${msg}`))
    }
  })
}

/** List Windows printer names installed on this machine */
function listPrinters() {
  try {
    const out = execSync(
      'powershell -NoProfile -NonInteractive -Command "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json"',
      { timeout: 5000, encoding: 'utf8' }
    )
    const parsed = JSON.parse(out.trim())
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

/** List COM ports available on this machine */
function listComPorts() {
  try {
    const out = execSync(
      'powershell -NoProfile -NonInteractive -Command "[System.IO.Ports.SerialPort]::GetPortNames() | ConvertTo-Json"',
      { timeout: 3000, encoding: 'utf8' }
    )
    const parsed = JSON.parse(out.trim())
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

module.exports = { openDrawerNetwork, openDrawerWindows, openDrawerSerial, listPrinters, listComPorts }
