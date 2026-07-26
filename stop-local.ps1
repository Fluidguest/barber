# ============================================================
#  Barber SaaS — parar tudo (Backend + Frontend + Postgres)
#  Uso:  powershell -ExecutionPolicy Bypass -File .\stop-local.ps1
# ============================================================

$root = $PSScriptRoot
$pgBin = Join-Path $root ".pg\pgsql\bin"
$pgData = Join-Path $root ".pg\data"

foreach ($port in 3333, 3100) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $c) {
    $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if ($p) { Write-Host "Parando porta $port (PID $($p.Id))"; Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  }
}

# Postgres via pg_ctl (encerramento limpo)
$pgUp = Get-NetTCPConnection -LocalPort 15432 -State Listen -ErrorAction SilentlyContinue
if ($pgUp) {
  & "$pgBin\pg_ctl.exe" -D $pgData -m fast stop
  Write-Host "Postgres parado."
} else {
  Write-Host "Postgres já estava parado."
}
