# FixITPro — Daily PostgreSQL Backup Script
# Runs pg_dump, saves compressed .sql to BACKUP_DIR, prunes files older than RETENTION_DAYS.
#
# Usage (manual):
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\backup.ps1"
#
# Environment vars (set in this script or in system environment):
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, BACKUP_DIR, RETENTION_DAYS

# ── Configuration ──────────────────────────────────────────────────────────────
$PGHOST       = $env:PGHOST       ?? "localhost"
$PGPORT       = $env:PGPORT       ?? "5432"
$PGUSER       = $env:PGUSER       ?? "postgres"
$PGPASSWORD   = $env:PGPASSWORD   ?? ""
$PGDATABASE   = $env:PGDATABASE   ?? "fixitpro_db"
$BACKUP_DIR   = $env:BACKUP_DIR   ?? "D:\FixITPro_Backups"
$RETENTION_DAYS = [int]($env:RETENTION_DAYS ?? "30")
$MIN_KEEP     = 7   # always keep at least this many backups regardless of age

# ── Locate pg_dump ─────────────────────────────────────────────────────────────
$PG_VERSIONS = @(17, 16, 15, 14)
$PG_DUMP = $null
foreach ($ver in $PG_VERSIONS) {
    $candidate = "C:\Program Files\PostgreSQL\$ver\bin\pg_dump.exe"
    if (Test-Path $candidate) { $PG_DUMP = $candidate; break }
}
if (-not $PG_DUMP) {
    # Try PATH
    try { $PG_DUMP = (Get-Command pg_dump -ErrorAction Stop).Source } catch {}
}
if (-not $PG_DUMP) {
    Write-Error "[Backup] pg_dump not found. Install PostgreSQL client tools."
    exit 1
}

# ── Create backup dir ─────────────────────────────────────────────────────────
if (-not (Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
}

# ── Run backup ────────────────────────────────────────────────────────────────
$timestamp = (Get-Date -Format "yyyy-MM-dd_HH-mm-ss")
$filename  = "${PGDATABASE}_${timestamp}.sql"
$filepath  = Join-Path $BACKUP_DIR $filename

$env:PGPASSWORD = $PGPASSWORD

Write-Host "[Backup] Starting backup → $filepath"

& $PG_DUMP -h $PGHOST -p $PGPORT -U $PGUSER -F p -f $filepath $PGDATABASE

if ($LASTEXITCODE -ne 0) {
    Write-Error "[Backup] pg_dump exited with code $LASTEXITCODE. Removing partial file."
    if (Test-Path $filepath) { Remove-Item $filepath -Force }
    exit $LASTEXITCODE
}

$sizeKB = [math]::Round((Get-Item $filepath).Length / 1KB, 1)
Write-Host "[Backup] Success: $filename ($sizeKB KB)"

# ── Retention: delete old backups ─────────────────────────────────────────────
$cutoff = (Get-Date).AddDays(-$RETENTION_DAYS)
$allFiles = Get-ChildItem -Path $BACKUP_DIR -Filter "*.sql" |
            Sort-Object LastWriteTime -Descending

$deleted = 0
for ($i = $MIN_KEEP; $i -lt $allFiles.Count; $i++) {
    if ($allFiles[$i].LastWriteTime -lt $cutoff) {
        Remove-Item $allFiles[$i].FullName -Force
        Write-Host "[Retention] Deleted: $($allFiles[$i].Name)"
        $deleted++
    }
}

Write-Host "[Backup] Done. Kept $($allFiles.Count - $deleted) backup(s). Deleted $deleted old file(s)."
