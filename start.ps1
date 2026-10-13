[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# Chạy AI Academy trên Windows. Đổi cổng:  .\start.ps1 -Port 8200
param([int]$Port = 8100)
$ErrorActionPreference = "Stop"
$venvPy = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Write-Host "Chưa có .venv — hãy chạy .\setup.ps1 trước." -ForegroundColor Red
    exit 1
}
$env:PYTHONUTF8 = "1"
Write-Host "AI Academy chạy tại http://127.0.0.1:$Port  (Ctrl+C để dừng)"
Set-Location -LiteralPath (Join-Path $PSScriptRoot "academy")
& $venvPy -m uvicorn app.main:app --host 127.0.0.1 --port $Port
