# ============================================================
# Build the CCTV Vision PyInstaller bundle — Windows PowerShell
# Run from monorepo root: .\services\cctv-vision\build_bundle.ps1
#
# Output is always <repo-root>\dist-pyinstaller\cctv-vision, which is what
# apps/teacher-desktop/electron-builder.yml copies via extraResources.
# PyInstaller ignores coll(distpath=...) in the spec, so the destination is
# passed on the command line here.
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$DistDir  = Join-Path $RepoRoot "dist-pyinstaller"

Write-Host "==> Installing Python dependencies..." -ForegroundColor Cyan
Set-Location $PSScriptRoot
pip install -r requirements.txt pyinstaller

Write-Host "==> Downloading MediaPipe face_landmarker model..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path models | Out-Null
$modelUrl  = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
$modelPath = "models/face_landmarker.task"
if (-not (Test-Path $modelPath)) {
    Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath
    Write-Host "    Downloaded face_landmarker.task" -ForegroundColor Green
} else {
    Write-Host "    Model already present, skipping" -ForegroundColor Yellow
}

Write-Host "==> Running PyInstaller (distpath: $DistDir)..." -ForegroundColor Cyan
pyinstaller cctv_vision.spec --clean --noconfirm --distpath "$DistDir"

$bundleExe = Join-Path $DistDir "cctv-vision\cctv-vision.exe"
if (-not (Test-Path $bundleExe)) {
    Write-Host "ERROR: expected bundle executable at $bundleExe" -ForegroundColor Red
    if (Test-Path (Join-Path $DistDir "cctv-vision")) {
        Get-ChildItem (Join-Path $DistDir "cctv-vision") | Select-Object -First 10 | Format-Table
    }
    throw "CCTV bundle was not produced in dist-pyinstaller"
}

Write-Host "==> Done. Bundle at: $bundleExe" -ForegroundColor Green
Set-Location $RepoRoot
