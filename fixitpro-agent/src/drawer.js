'use strict'

const net = require('net')
const { execSync } = require('child_process')

// Encode PS script as Base64 UTF-16LE so heredocs, quotes, newlines all survive
function psEncode(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function runPS(script, opts = {}) {
  const full = `$ProgressPreference='SilentlyContinue';$VerbosePreference='SilentlyContinue'\n${script}`
  const encoded = psEncode(full)
  return execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
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
    const escapedPrinter = printerName.replace(/'/g, "''")

    // Write ESC/POS bytes to \\.\USB001 via .NET FileStream — bypasses GDI-only driver
    const script = `
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
$printerName = '${escapedPrinter}'
$portName = (Get-Printer -Name $printerName -ErrorAction Stop).PortName
if (-not $portName) { throw "Cannot find port for printer: $printerName" }
$devicePath = '\\\\.' + [char]92 + $portName
$data = [byte[]](0x1B, 0x70, 0x00, 0x32, 0xFA, 0x1B, 0x70, 0x01, 0x32, 0xFA)
$stream = New-Object System.IO.FileStream($devicePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
try {
  $stream.Write($data, 0, $data.Length)
  $stream.Flush()
  Write-Output "OK:$portName"
} finally {
  $stream.Dispose()
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
