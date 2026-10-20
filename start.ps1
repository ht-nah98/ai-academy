# Chạy AI Academy trên Windows.
#   .\start.ps1              → khóa AI & Data (cổng 8100)
#   .\start.ps1 node         → khóa Node.js & WebSocket (cổng 8200)
#   .\start.ps1 node -Port 8300
param([ValidateSet("ai", "node")][string]$Course = "ai", [int]$Port = 0)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
$venvPy = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Write-Host "Chưa có .venv — hãy chạy .\setup.ps1 trước." -ForegroundColor Red
    exit 1
}
$env:PYTHONUTF8 = "1"
$name = "AI Academy"
if ($Course -eq "node") {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "Chưa có Node.js — hãy cài Node.js 22 trở lên (https://nodejs.org) rồi mở lại PowerShell." -ForegroundColor Red
        exit 1
    }
    $c = Join-Path $PSScriptRoot "academy\courses\node-realtime"
    if ((Test-Path (Join-Path $c "package.json")) -and -not (Test-Path (Join-Path $c "node_modules"))) {
        Write-Host "Cài thư viện cho khóa Node (npm install)…"
        Push-Location -LiteralPath $c
        try { npm install --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { exit 1 } } finally { Pop-Location }
    }
    $env:ACADEMY_CURRICULUM = Join-Path $c "curriculum"
    $env:ACADEMY_WORKSPACE = Join-Path $c "workspace"
    $env:ACADEMY_DATA = Join-Path $c "data"
    $env:ACADEMY_CACHE = Join-Path $c "cache"
    $name = "Khóa Node.js & WebSocket"
    if ($Port -eq 0) { $Port = 8200 }
} else {
    if ($Port -eq 0) { $Port = 8100 }
}
Write-Host "$name chạy tại http://127.0.0.1:$Port  (Ctrl+C để dừng)"
Set-Location -LiteralPath (Join-Path $PSScriptRoot "academy")
& $venvPy -m uvicorn app.main:app --host 127.0.0.1 --port $Port
