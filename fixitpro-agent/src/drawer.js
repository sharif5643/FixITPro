'use strict'

const net = require('net')
const { execSync } = require('child_process')
const { HELPER_PRINTER } = require('./setup')

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
    // capture stderr so actual PowerShell errors appear in err.stderr
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  })
}

// ESC/POS: ESC p pin t1 t2 — send both pin 2 and pin 5 to cover all drawer wiring
const DRAWER_PULSE = Buffer.from([
  0x1B, 0x70, 0x00, 0x32, 0xFA,  // pin 2 (most common)
  0x1B, 0x70, 0x01, 0x32, 0xFA,  // pin 5 (some models)
])

// C# P/Invoke code for WritePrinter — compiled at runtime by Add-Type.
// Generic/Text Only driver accepts RAW data type so the spooler passes bytes
// straight through to the USB port without any GDI rasterisation.
const WINPRINT_CS = `
using System;
using System.Runtime.InteropServices;
public class WinPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct DOC_INFO_1 {
        [MarshalAs(UnmanagedType.LPTStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPTStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPTStr)] public string pDatatype;
    }
    [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError=true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError=true)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOC_INFO_1 di);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    public static string LastError() {
        return new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()).Message;
    }
}
`.trim()

/**
 * Open drawer via Network printer (raw TCP port 9100)
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
 * Open drawer via Windows printer name.
 * Sends ESC/POS bytes using WritePrinter RAW through the "FixITPro Cash Drawer"
 * helper printer (Generic/Text Only driver — installed during agent setup).
 * Falls back to direct FileStream on the USB device port (requires admin).
 */
function openDrawerWindows(printerName) {
  return new Promise((resolve, reject) => {
    const escapedHelper  = HELPER_PRINTER.replace(/'/g, "''")
    const escapedPrinter = printerName.replace(/'/g, "''")

    // WritePrinter via Generic/Text Only helper printer (no admin needed).
    // If helper not installed, falls back to FileStream on the USB port.
    const script = `
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

$helperName = '${escapedHelper}'
$targetName = '${escapedPrinter}'
$data = [byte[]](0x1B, 0x70, 0x00, 0x32, 0xFA, 0x1B, 0x70, 0x01, 0x32, 0xFA)

# ── Method 1: WritePrinter via Generic/Text Only helper printer ─────────────
$helperPrinter = Get-Printer -Name $helperName -ErrorAction SilentlyContinue
if ($helperPrinter) {
    Add-Type -Language CSharp -TypeDefinition @'
${WINPRINT_CS}
'@
    $hPrinter = [IntPtr]::Zero
    if (-not [WinPrint]::OpenPrinter($helperName, [ref]$hPrinter, [IntPtr]::Zero)) {
        throw "OpenPrinter('$helperName') failed: $([WinPrint]::LastError())"
    }
    try {
        $di = New-Object WinPrint+DOC_INFO_1
        $di.pDocName  = 'CashDrawer'
        $di.pDatatype = 'RAW'
        $jobId = [WinPrint]::StartDocPrinter($hPrinter, 1, [ref]$di)
        if ($jobId -le 0) {
            throw "StartDocPrinter failed: $([WinPrint]::LastError())"
        }
        [WinPrint]::StartPagePrinter($hPrinter) | Out-Null
        $written = 0
        [WinPrint]::WritePrinter($hPrinter, $data, $data.Length, [ref]$written) | Out-Null
        [WinPrint]::EndPagePrinter($hPrinter) | Out-Null
        [WinPrint]::EndDocPrinter($hPrinter) | Out-Null
        Write-Output "OK:WritePrinter:$helperName"
    } finally {
        [WinPrint]::ClosePrinter($hPrinter) | Out-Null
    }
    exit 0
}

# ── Method 2: FileStream on raw USB device port (may need admin) ────────────
$portName = (Get-Printer -Name $targetName -ErrorAction Stop).PortName
if (-not $portName) { throw "Cannot find port for printer: $targetName" }
$devicePath = '\\\\.' + [char]92 + $portName
$stream = New-Object System.IO.FileStream($devicePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
try {
    $stream.Write($data, 0, $data.Length)
    $stream.Flush()
    Write-Output "OK:FileStream:$portName"
} finally {
    $stream.Dispose()
}
`.trim()

    try {
      const out = runPS(script, { timeout: 15000 })
      console.log(`[Drawer] Windows result: ${out.trim()}`)
      resolve({ method: 'windows', printer: printerName, output: out.trim() })
    } catch (err) {
      const stderr = (err.stderr || '').toString().trim()
      const stdout = (err.stdout || '').toString().trim()
      // Show real PowerShell error (not just "Command failed")
      const msg = stderr || stdout || err.message || 'unknown error'

      // Helpful hint when helper printer is missing
      const hint = msg.includes('OpenPrinter') || stdout === ''
        ? ' — กรุณาปิดและเปิด FixITPro-Agent.exe ใหม่เพื่อติดตั้ง cash drawer printer'
        : ''

      console.error(`[Drawer] Windows error: ${msg}`)
      reject(new Error(`${msg}${hint}`))
    }
  })
}

/**
 * Open drawer via COM port (Bluetooth virtual serial, USB virtual COM)
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
