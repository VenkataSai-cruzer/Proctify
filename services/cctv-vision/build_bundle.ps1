# ============================================================
# Build the CCTV Vision PyInstaller bundle — Windows PowerShell
# Run from monorepo root: .\services\cctv-vision\build_bundle.ps1
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "==> Installing Python dependencies..." -ForegroundColor Cyan
Set-Location services/cctv-vision
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

Write-Host "==> Running PyInstaller..." -ForegroundColor Cyan
pyinstaller cctv_vision.spec --clean --noconfirm

Write-Host "==> Done. Bundle at: ../../dist-pyinstaller/cctv-vision/" -ForegroundColor Green
Set-Location ../..
