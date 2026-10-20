# Chạy AI Academy trên Windows — một server phục vụ mọi khóa học (cổng 8100).
#   .\start.ps1
#   .\start.ps1 -Port 8300
param([string]$Course = "", [int]$Port = 8100)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
$venvPy = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Write-Host "Chưa có .venv — hãy chạy .\setup.ps1 trước." -ForegroundColor Red
    exit 1
}
if ($Course) {
    Write-Host "Lưu ý: không cần tham số khóa nữa (`"$Course`" bị bỏ qua) — mọi khóa chạy chung một server, chọn ở trang Thư viện khóa học." -ForegroundColor Yellow
}
$env:PYTHONUTF8 = "1"
# Khóa Node (academy\courses\<id>\package.json) chưa có node_modules → npm install
$coursesDir = Join-Path $PSScriptRoot "academy\courses"
if (Test-Path $coursesDir) {
    foreach ($dir in Get-ChildItem -LiteralPath $coursesDir -Directory) {
        $c = $dir.FullName
        if (-not (Test-Path (Join-Path $c "package.json")) -or (Test-Path (Join-Path $c "node_modules"))) { continue }
        if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
            Write-Host "Khóa $($dir.Name) cần Node.js 22 trở lên (https://nodejs.org) — các khóa khác vẫn dùng được." -ForegroundColor Yellow
            continue
        }
        Write-Host "Cài thư viện cho khóa $($dir.Name) (npm install)…"
        Push-Location -LiteralPath $c
        try {
            npm install --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { Write-Host "npm install lỗi ở $c — chấm bài khóa này sẽ báo thiếu thư viện." -ForegroundColor Yellow }
        } finally { Pop-Location }
    }
}
Write-Host "AI Academy chạy tại http://127.0.0.1:$Port  (Ctrl+C để dừng)"
Set-Location -LiteralPath (Join-Path $PSScriptRoot "academy")
& $venvPy -m uvicorn app.main:app --host 127.0.0.1 --port $Port
