'use strict'

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Run PowerShell using Base64-encoded command (no escaping issues)
function runPS(script, opts = {}) {
  // Suppress progress/verbose streams so CLIXML noise doesn't print to console
  const full = `$ProgressPreference='SilentlyContinue';$VerbosePreference='SilentlyContinue'\n${script}`
  const encoded = Buffer.from(full, 'utf16le').toString('base64')
  return execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'], // discard stderr (where CLIXML goes)
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

function installCertElevated(certFile) {
  const innerScript = `Import-Certificate -FilePath '${certFile.replace(/'/g, "''")}' -CertStoreLocation 'Cert:\\LocalMachine\\Root' | Out-Null`
  const innerEncoded = Buffer.from(innerScript, 'utf16le').toString('base64')
  // -Verb RunAs = UAC popup, -Wait = wait for it to finish before continuing
  runPS(`Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -EncodedCommand ${innerEncoded}'`, {
    timeout: 60000,
  })
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

module.exports = { isCertInstalled, installCertElevated, addToStartup }
