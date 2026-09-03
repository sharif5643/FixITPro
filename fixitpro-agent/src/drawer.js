'use strict'

const net = require('net')
const { execSync } = require('child_process')
const os = require('os')
const fs = require('fs')
const path = require('path')

// ESC/POS: ESC p pin t1 t2 — open drawer on pin 2 (standard RJ11)
const DRAWER_PULSE = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA])

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

    // PowerShell script using Win32 API to send raw bytes to printer
    const ps = `
$ErrorActionPreference = 'Stop'
$printerName = '${printerName.replace(/'/g, "''")}'
$data = [System.IO.File]::ReadAllBytes('${tmpFile.replace(/\\/g, '\\\\')}')
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinPrint {
  [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int Level, ref DOCINFO pDocInfo);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBuf, int cbBuf, out int pcWritten);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DOCINFO {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
}
'@
$h = [IntPtr]::Zero
if (-not [WinPrint]::OpenPrinter($printerName, [ref]$h, [IntPtr]::Zero)) { throw "OpenPrinter failed for: $printerName" }
try {
  $doc = New-Object WinPrint+DOCINFO
  $doc.pDocName = "FixITPro-Drawer"
  $doc.pDataType = "RAW"
  [WinPrint]::StartDocPrinter($h, 1, [ref]$doc) | Out-Null
  [WinPrint]::StartPagePrinter($h) | Out-Null
  $written = 0
  [WinPrint]::WritePrinter($h, $data, $data.Length, [ref]$written) | Out-Null
  [WinPrint]::EndPagePrinter($h) | Out-Null
  [WinPrint]::EndDocPrinter($h) | Out-Null
} finally {
  [WinPrint]::ClosePrinter($h) | Out-Null
}
Write-Output "OK"
`.trim()

    try {
      const out = execSync(
        `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"')}"`,
        { timeout: 8000, encoding: 'utf8' }
      )
      resolve({ method: 'windows', printer: printerName, output: out.trim() })
    } catch (err) {
      reject(new Error(`PowerShell error: ${err.stderr || err.message}`))
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
    const ps = `
$port = New-Object System.IO.Ports.SerialPort('${comPort}', ${baudRate})
$port.Open()
$data = [byte[]](0x1B, 0x70, 0x00, 0x19, 0xFA)
$port.Write($data, 0, $data.Length)
$port.Close()
Write-Output "OK"
`.trim()
    try {
      const out = execSync(
        `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"')}"`,
        { timeout: 5000, encoding: 'utf8' }
      )
      resolve({ method: 'serial', port: comPort, output: out.trim() })
    } catch (err) {
      reject(new Error(`Serial error on ${comPort}: ${err.stderr || err.message}`))
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
