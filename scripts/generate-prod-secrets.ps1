#!/usr/bin/env pwsh
# FixITPro — Generate PROD secrets
# Usage: .\scripts\generate-prod-secrets.ps1
#
# Outputs: .env.production.generated.local  (root of repo — gitignored)
# Copy the values from that file into backend/.env.production.
#
# SAFETY: This script never writes to .env.production directly.
#         Never commit .env.production.generated.local to git.
#         Run this script once per environment, store secrets securely.
#
# ห้ามแชร์ไฟล์ .env.production.generated.local ผ่านอีเมล/LINE/Slack
# ห้าม commit ไฟล์ secrets ใดๆ ขึ้น git

param(
    [switch]$Force
)

$outFile = Join-Path $PSScriptRoot ".." ".env.production.generated.local"
$outFile = [System.IO.Path]::GetFullPath($outFile)

if ((Test-Path $outFile) -and -not $Force) {
    Write-Host ""
    Write-Host "WARNING: $outFile already exists." -ForegroundColor Yellow
    Write-Host "Run with -Force to regenerate (this will overwrite existing secrets)." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FixITPro PROD Secret Generator" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Generate secrets via Node.js crypto
$jwt     = node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"
$backup  = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
$session = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
$dbPass  = node -e "process.stdout.write(require('crypto').randomBytes(16).toString('base64url'))"

if (-not $jwt -or $jwt.Length -lt 64) {
    Write-Host "ERROR: Failed to generate JWT_SECRET. Is Node.js installed?" -ForegroundColor Red
    exit 1
}

Write-Host "  JWT_SECRET       : $($jwt.Substring(0,16))... ($($jwt.Length) chars)" -ForegroundColor Green
Write-Host "  BACKUP_KEY       : $($backup.Substring(0,16))... ($($backup.Length) chars)" -ForegroundColor Green
Write-Host "  SESSION_SECRET   : $($session.Substring(0,16))... ($($session.Length) chars)" -ForegroundColor Green
Write-Host "  DB_PASSWORD_HINT : $($dbPass.Substring(0,8))... (for new postgres user)" -ForegroundColor Green
Write-Host ""

$content = @"
# FixITPro PROD Secrets — GENERATED $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# GITIGNORED — never commit this file.
# Copy these values into backend/.env.production.
#
# After copying:
# 1. Change PostgreSQL password:
#    psql -U postgres -c "ALTER USER postgres WITH PASSWORD '${dbPass}';"
#    -- or create a dedicated user:
#    psql -U postgres -c "CREATE USER fixitpro WITH PASSWORD '${dbPass}';"
#    psql -U postgres -c "GRANT ALL ON DATABASE fixitpro_prod TO fixitpro;"
# 2. Ensure fixitpro_prod DB exists:
#    psql -U postgres -c "CREATE DATABASE fixitpro_prod;"
# 3. Run migrations against PROD:
#    cd backend
#    set DATABASE_URL=postgresql://postgres:YOURPASS@localhost:5432/fixitpro_prod
#    npx prisma migrate deploy
# 4. Delete this file once values are in backend/.env.production.

JWT_SECRET=${jwt}
BACKUP_ENCRYPTION_KEY=${backup}
SESSION_SECRET=${session}
DB_PASSWORD_HINT=${dbPass}
"@

$content | Out-File -FilePath $outFile -Encoding utf8 -NoNewline

Write-Host "  Secrets written to: $outFile" -ForegroundColor Green
Write-Host ""
Write-Host "  NEXT STEPS:" -ForegroundColor Yellow
Write-Host "  1. Copy JWT_SECRET into backend/.env.production" -ForegroundColor Yellow
Write-Host "  2. Follow the psql instructions in the generated file" -ForegroundColor Yellow
Write-Host "  3. Delete $outFile after copying" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
