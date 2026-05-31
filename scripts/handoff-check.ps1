# Called by Claude Stop hook — checks handoff doc freshness
$handoffPath = "D:\FixITPro\docs\ai-handoff\latest.md"

if (-not (Test-Path $handoffPath)) {
    Write-Host "HANDOFF WARNING: latest.md is missing! Create $handoffPath before stopping."
    exit 2
}

$ageMinutes = ((Get-Date) - (Get-Item $handoffPath).LastWriteTime).TotalMinutes
$ageFmt = [math]::Round($ageMinutes)

if ($ageMinutes -gt 120) {
    Write-Host "HANDOFF REMINDER: latest.md is $ageFmt min old. Overwrite $handoffPath with the phase summary before stopping."
    exit 2
} else {
    Write-Host "Handoff OK: latest.md updated $ageFmt min ago."
    exit 0
}
