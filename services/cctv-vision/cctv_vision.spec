# ============================================================
# SecureAssess CCTV Vision Service — PyInstaller Spec
# Produces a single-folder bundle at dist-pyinstaller/cctv-vision/
# that electron-builder copies into the teacher-desktop extraResources
# ============================================================
# Build with:
#   pip install pyinstaller
#   cd services/cctv-vision
#   pyinstaller cctv_vision.spec
# ============================================================

import sys
import os
from pathlib import Path

block_cipher = None

SPEC_DIR = os.path.dirname(os.path.abspath(SPEC))
DIST_DIR  = str(Path(SPEC_DIR).parent.parent / "dist-pyinstaller")

# Collect hidden imports for mediapipe and opencv
hidden = [
    # mediapipe requires Python <=3.12; omit it here and rely on the
    # graceful fallback in detector.py (Haar cascade only)
    "cv2",
    "numpy",
    "socketio",
    "aiohttp",
    "PIL",
    "dotenv",
    "asyncio",
]

a = Analysis(
    ["src/main.py"],
    pathex=[SPEC_DIR],
    binaries=[],
    datas=[
        # MediaPipe task model — include only if present
    ],
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "scipy"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="cctv-vision",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="cctv-vision",
    # Output into monorepo dist-pyinstaller/ so electron-builder picks it up
    distpath=DIST_DIR,
)
