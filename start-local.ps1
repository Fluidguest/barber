# ============================================================
#  Barber SaaS — subir tudo localmente (Postgres + Backend + Frontend)
#  Uso:  powershell -ExecutionPolicy Bypass -File .\start-local.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$pgBin = Join-Path $root ".pg\pgsql\bin"
$pgData = Join-Path $root ".pg\data"
$pgLog = Join-Path $root ".pg\server.log"

Write-Host "== 1/3  Postgres (porta 15432) ==" -ForegroundColor Yellow
$up = Get-NetTCPConnection -LocalPort 15432 -State Listen -ErrorAction SilentlyContinue
if ($up) {
  Write-Host "   já rodando." -ForegroundColor Green
} else {
  & "$pgBin\pg_ctl.exe" -D $pgData -l $pgLog -o "-p 15432" -w start
  Write-Host "   iniciado." -ForegroundColor Green
}

Write-Host "== 2/3  Backend (http://localhost:3333/api) ==" -ForegroundColor Yellow
$beUp = Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue
if ($beUp) {
  Write-Host "   já rodando." -ForegroundColor Green
} else {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; npm run start:dev"
  Write-Host "   subindo em nova janela..." -ForegroundColor Green
}

Write-Host "== 3/3  Frontend (http://localhost:3100) ==" -ForegroundColor Yellow
$feUp = Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue
if ($feUp) {
  Write-Host "   já rodando." -ForegroundColor Green
} else {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\web'; npm run dev -- -p 3100"
  Write-Host "   subindo em nova janela..." -ForegroundColor Green
}

Write-Host ""
Write-Host "Pronto. Abra:  http://localhost:3100" -ForegroundColor Cyan
Write-Host "Login: demo / admin@demo.com / demo1234" -ForegroundColor Cyan
Write-Host "(o backend/front levam ~10-20s para compilar na primeira vez)"
