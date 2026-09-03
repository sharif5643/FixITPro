'use strict'

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const HELPER_PRINTER = 'FixITPro Cash Drawer'

// Run PowerShell using Base64-encoded command (no escaping issues)
function runPS(script, opts = {}) {
  const full = `$ProgressPreference='SilentlyContinue';$VerbosePreference='SilentlyContinue'\n${script}`
  const encoded = Buffer.from(full, 'utf16le').toString('base64')
  return execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
    ...opts,
  }).trim()
}

function isCertInstalled() {
  try {
    const count = runPS(
      `$c = Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Subject -like '*FixITPro*' }; if ($c) { ($c | Measure-Object).Count } else { 0 }`
    )
    return parseInt(count, 10) > 0
  } catch {
    return false
  }
}

function isHelperPrinterInstalled() {
  try {
    const out = runPS(
      `if (Get-Printer -Name '${HELPER_PRINTER}' -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }`
    )
    return out.trim() === 'yes'
  } catch {
    return false
  }
}

// Run elevated PowerShell script (shows UAC popup).
// script must NOT include <?php or any shell-specific markup — pure PS.
function runElevated(script, timeout = 60000) {
  const innerEncoded = Buffer.from(script, 'utf16le').toString('base64')
  runPS(`Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -NonInteractive -EncodedCommand ${innerEncoded}'`, {
    timeout,
  })
}

// Install cert to LocalMachine\Root AND create the Generic/Text-Only helper
// printer for RAW cash-drawer access — both in ONE UAC popup.
function installCertElevated(certFile) {
  const escaped = certFile.replace(/'/g, "''")
  runElevated(`
Import-Certificate -FilePath '${escaped}' -CertStoreLocation 'Cert:\\LocalMachine\\Root' | Out-Null

# Install cash drawer helper printer (best-effort; skipped if printer already exists)
if (-not (Get-Printer -Name '${HELPER_PRINTER}' -ErrorAction SilentlyContinue)) {
    $usbPort = (Get-Printer | Where-Object { $_.PortName -like 'USB*' } | Select-Object -First 1).PortName
    if ($usbPort) {
        Add-Printer -Name '${HELPER_PRINTER}' -DriverName 'Generic / Text Only' -PortName $usbPort -ErrorAction SilentlyContinue
    }
}
`)
}

// Install helper printer via a separate UAC popup (used when cert is already
// installed but the helper printer is missing — e.g. printer connected later).
function installHelperPrinterElevated() {
  runElevated(`
if (-not (Get-Printer -Name '${HELPER_PRINTER}' -ErrorAction SilentlyContinue)) {
    $usbPort = (Get-Printer | Where-Object { $_.PortName -like 'USB*' } | Select-Object -First 1).PortName
    if ($usbPort) {
        Add-Printer -Name '${HELPER_PRINTER}' -DriverName 'Generic / Text Only' -PortName $usbPort -ErrorAction SilentlyContinue
    }
}
`)
}

function addToStartup() {
  try {
    const startupDir = path.join(
      os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
    )
    const shortcutPath = path.join(startupDir, 'FixITPro-Agent.lnk')
    if (fs.existsSync(shortcutPath)) return

    const exePath = process.execPath
    const exeDir  = path.dirname(exePath)

    runPS(`
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
$s.TargetPath = '${exePath.replace(/'/g, "''")}'
$s.WorkingDirectory = '${exeDir.replace(/'/g, "''")}'
$s.WindowStyle = 7
$s.Description = 'FixITPro Cash Drawer Agent'
$s.Save()
`)
    console.log('[Setup] เพิ่มเข้า Windows Startup แล้ว')
  } catch (err) {
    console.warn('[Setup] ไม่สามารถเพิ่มเข้า Startup:', err.message)
  }
}

module.exports = {
  isCertInstalled,
  isHelperPrinterInstalled,
  installCertElevated,
  installHelperPrinterElevated,
  addToStartup,
  HELPER_PRINTER,
}
