# ============================================================
# SecureAssess CCTV Vision Service — PyInstaller Spec
# Produces a single-folder bundle at dist-pyinstaller/cctv-vision/
# that electron-builder copies into the teacher-desktop extraResources.
# ============================================================
# Build:
#   cd services/cctv-vision
#   pyinstaller cctv_vision.spec --clean --noconfirm
# ============================================================

import sys
import os
from pathlib import Path

block_cipher = None

# SPEC is the absolute path of this .spec file (PyInstaller 6+)
SPEC_DIR = os.path.dirname(os.path.abspath(SPEC))
DIST_DIR = str(Path(SPEC_DIR).parent.parent / "dist-pyinstaller")

# MediaPipe model — include if present, skip gracefully if not
MODEL_PATH = os.path.join(SPEC_DIR, "models", "face_landmarker.task")
datas_list = []
if os.path.exists(MODEL_PATH):
    datas_list.append((MODEL_PATH, "models"))

# Hidden imports — mediapipe is conditional on Python <=3.12
hidden = [
    "cv2",
    "numpy",
    "socketio",
    "socketio.asyncio_client",
    "aiohttp",
    "aiohttp.connector",
    "PIL",
    "PIL.Image",
    "dotenv",
    "asyncio",
    "asyncio.events",
]

try:
    import mediapipe  # noqa: F401
    hidden += [
        "mediapipe",
        "mediapipe.tasks",
        "mediapipe.tasks.python",
        "mediapipe.tasks.python.vision",
        "mediapipe.python",
    ]
except ImportError:
    pass  # Haar-cascade fallback active

a = Analysis(
    ["src/main.py"],
    pathex=[SPEC_DIR],
    binaries=[],
    datas=datas_list,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "scipy", "PyQt5", "PyQt6"],
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
    distpath=DIST_DIR,
)
