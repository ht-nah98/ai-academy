[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# Cài đặt AI Academy trên Windows (PowerShell). Chạy lại nhiều lần vẫn an toàn.
# Nếu bị chặn chạy script:  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Test-Py([string[]]$cmd) {
    # $cmd = tên lệnh + tham số đầu; trả về $true nếu Python >= 3.10
    try {
        $exe = $cmd[0]
        $rest = @()
        if ($cmd.Length -gt 1) { $rest = $cmd[1..($cmd.Length - 1)] }
        & $exe @rest -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

$py = $null
foreach ($c in @(@("py", "-3"), @("python"), @("python3"))) {
    if (Get-Command $c[0] -ErrorAction SilentlyContinue) {
        if (Test-Py $c) { $py = $c; break }
    }
}
if (-not $py) {
    Write-Host "LỖI: không tìm thấy Python 3.10 trở lên (khuyến nghị 3.12)." -ForegroundColor Red
    Write-Host "Tải tại https://www.python.org/downloads/ — khi cài nhớ tick 'Add python.exe to PATH'."
    Write-Host "Sau đó mở PowerShell mới và chạy lại: .\setup.ps1"
    exit 1
}
$pyExe = $py[0]
$pyArgs = @()
if ($py.Length -gt 1) { $pyArgs = $py[1..($py.Length - 1)] }
Write-Host "==> Dùng: $(& $pyExe @pyArgs --version)"

$venvPy = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Write-Host "==> Tạo môi trường ảo .venv ..."
    if (Test-Path ".venv") { Remove-Item -Recurse -Force ".venv" }
    & $pyExe @pyArgs -m venv .venv
    if ($LASTEXITCODE -ne 0) { Write-Host "LỖI: không tạo được venv." -ForegroundColor Red; exit 1 }
} else {
    Write-Host "==> .venv đã có, bỏ qua bước tạo."
}

Write-Host "==> Cài thư viện (có thể mất 1-3 phút) ..."
& $venvPy -m pip install --upgrade pip -q
& $venvPy -m pip install -r academy\requirements.txt
if ($LASTEXITCODE -ne 0) { Write-Host "LỖI: cài thư viện thất bại (kiểm tra mạng)." -ForegroundColor Red; exit 1 }

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "==> Đã tạo file .env từ .env.example."
} else {
    Write-Host "==> .env đã có, giữ nguyên."
}

Write-Host @"

Xong! Các bước tiếp theo:
  1. Mở file .env, thay nvapi-... bằng API key của bạn (lấy miễn phí tại https://build.nvidia.com).
     Có thể làm sau — chưa có key vẫn học được các bài chạy test.
  2. Chạy app:   .\start.ps1
  3. Mở trình duyệt:  http://127.0.0.1:8100
"@
