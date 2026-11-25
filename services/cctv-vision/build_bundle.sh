#!/usr/bin/env bash
# ============================================================
# Build the CCTV Vision PyInstaller bundle
# Run from the monorepo root: bash services/cctv-vision/build_bundle.sh
# ============================================================
set -e

echo "==> Installing Python dependencies..."
cd services/cctv-vision
pip install -r requirements.txt pyinstaller

echo "==> Downloading MediaPipe face_landmarker model..."
mkdir -p models
MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
if [ ! -f "models/face_landmarker.task" ]; then
  curl -L "$MODEL_URL" -o models/face_landmarker.task
  echo "    Downloaded face_landmarker.task"
else
  echo "    Model already present, skipping download"
fi

echo "==> Running PyInstaller..."
pyinstaller cctv_vision.spec --clean --noconfirm

echo "==> Done. Bundle at: ../../dist-pyinstaller/cctv-vision/"
