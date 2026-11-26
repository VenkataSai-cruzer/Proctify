#!/usr/bin/env bash
# ============================================================
# Build the CCTV Vision PyInstaller bundle
# Run from the monorepo root: bash services/cctv-vision/build_bundle.sh
#
# Output is always <repo-root>/dist-pyinstaller/cctv-vision, which is what
# apps/teacher-desktop/electron-builder.yml copies via extraResources.
# PyInstaller ignores coll(distpath=...) in the spec, so the destination is
# passed on the command line here.
# ============================================================
set -euo pipefail

echo "==> Installing Python dependencies..."
cd services/cctv-vision
pip install -r requirements.txt pyinstaller

ROOT_DIR="$(cd ../.. && pwd)"
DIST_DIR="$ROOT_DIR/dist-pyinstaller"

echo "==> Downloading MediaPipe face_landmarker model..."
mkdir -p models
MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
if [ ! -f "models/face_landmarker.task" ]; then
  curl -L "$MODEL_URL" -o models/face_landmarker.task
  echo "    Downloaded face_landmarker.task"
else
  echo "    Model already present, skipping download"
fi

echo "==> Running PyInstaller (distpath: $DIST_DIR)..."
pyinstaller cctv_vision.spec --clean --noconfirm --distpath "$DIST_DIR"

BUNDLE_BIN="$DIST_DIR/cctv-vision/cctv-vision"
if [ ! -x "$BUNDLE_BIN" ]; then
  echo "ERROR: expected executable bundle at $BUNDLE_BIN" >&2
  ls -la "$DIST_DIR/cctv-vision" 2>/dev/null >&2 || true
  exit 1
fi

echo "==> Done. Bundle at: $BUNDLE_BIN"
