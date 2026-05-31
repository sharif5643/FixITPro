#Requires -Version 5.1
# ============================================================
# FixITPro -- Immediate PROD Backup
# Run this manually before major changes or first real use.
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BackupScript = 'D:\FixITPro\scripts\backup-local.ps1'
$ProdEnvFile  = 'D:\FixITPro\backend\.env.production'
$ProdUploads  = 'D:\FixITPro_Prod_Uploads'

Write-Host ''
Write-Host '  +==========================================+' -ForegroundColor Green
Write-Host '  |   FixITPro  --  PROD Immediate Backup    |' -ForegroundColor Green
Write-Host '  +==========================================+' -ForegroundColor Green
Write-Host ''
Write-Host "  Backing up: fixitpro_prod database + $ProdUploads"
Write-Host ''

if (-not (Test-Path $BackupScript)) {
    Write-Host "  ERROR: backup-local.ps1 not found at $BackupScript" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ProdEnvFile)) {
    Write-Host "  ERROR: .env.production not found at $ProdEnvFile" -ForegroundColor Red
    exit 1
}

& $BackupScript -ConfigEnvFile $ProdEnvFile -UploadsOverride $ProdUploads

if ($LASTEXITCODE -eq 0) {
    Write-Host ''
    Write-Host '  PROD backup complete.' -ForegroundColor Green
    Write-Host "  Location: D:\FixITPro_Backup\$(Get-Date -Format 'yyyy-MM-dd')"
} else {
    Write-Host ''
    Write-Host '  Backup encountered errors. Check output above.' -ForegroundColor Red
    exit 1
}
