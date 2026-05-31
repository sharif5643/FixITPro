#Requires -Version 5.1
# ============================================================
# FixITPro -- Stop PRODUCTION servers (ports 3000 and 3001)
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host ''
Write-Host '  Stopping FixITPro PROD servers...' -ForegroundColor Yellow
Write-Host ''

function Stop-Port {
    param([int]$Port, [string]$Label)
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if (-not $conns) {
            Write-Host "  $Label (port $Port): not running" -ForegroundColor DarkGray
            return
        }
        foreach ($c in $conns) {
            $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "  Stopping $Label (port $Port, PID $($proc.Id): $($proc.ProcessName))..." -ForegroundColor Yellow
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                Write-Host "  $Label stopped." -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "  Could not stop port ${Port}: $_" -ForegroundColor Red
    }
}

Stop-Port -Port 3000 -Label 'Backend'
Stop-Port -Port 3001 -Label 'Frontend'

Write-Host ''
Write-Host '  PROD servers stopped.' -ForegroundColor Green
Write-Host ''
