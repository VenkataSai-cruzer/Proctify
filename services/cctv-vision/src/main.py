#!/usr/bin/env python3
"""
SecureAssess CCTV Vision Service
Connects to the Node.js server via Socket.IO (/cctv namespace),
captures USB/RTSP camera frames, runs MediaPipe face landmark
detection + head-pose estimation, and emits violations + live frames.
"""

import asyncio
import os
import time
import base64
import logging
from pathlib import Path

import cv2
import numpy as np
import socketio
from dotenv import load_dotenv

from calibration import ZoneCalibration
from detector import HeadPoseDetector, FaceDetector

# ── Config ────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent.parent / ".env")

SERVER_URL       = os.getenv("SERVER_URL", "http://localhost:3000")
CCTV_SECRET      = os.getenv("CCTV_SERVICE_SECRET", "")
CAMERA_SOURCE    = os.getenv("CAMERA_SOURCE", "0")
YAW_THRESHOLD    = float(os.getenv("YAW_THRESHOLD", "30"))
PITCH_THRESHOLD  = float(os.getenv("PITCH_THRESHOLD", "20"))
VIOLATION_MS     = int(os.getenv("VIOLATION_DURATION_MS", "4000"))
FRAME_WIDTH      = int(os.getenv("FRAME_WIDTH", "1280"))
FRAME_HEIGHT     = int(os.getenv("FRAME_HEIGHT", "720"))
LIVE_FPS         = int(os.getenv("LIVE_FPS", "5"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("cctv-vision")

# ── Socket.IO client ──────────────────────────────────────────

sio = socketio.AsyncClient(reconnection=True, reconnection_attempts=0, logger=False)

# ── Global state ──────────────────────────────────────────────

calibration: ZoneCalibration | None = None
violation_timers: dict[str, float] = {}   # systemNo → first_seen_ms
active_sessions: set[str] = set()

# ── Socket events ─────────────────────────────────────────────

@sio.event
async def connect():
    log.info("Connected to SecureAssess server (/cctv)")
    await sio.emit("cctv:serviceConnected", {
        "version": "1.0.0",
        "cameraSource": CAMERA_SOURCE,
        "frameWidth": FRAME_WIDTH,
        "frameHeight": FRAME_HEIGHT,
    })

@sio.event
async def disconnect():
    log.warning("Disconnected from server — will retry")

@sio.on("cctv:loadCalibration")
async def on_load_calibration(data):
    global calibration
    calibration = ZoneCalibration.from_dict(data)
    log.info(f"Calibration loaded: {len(calibration.zones)} zones")

# ── Camera capture loop ───────────────────────────────────────

async def capture_loop():
    global calibration

    # Open camera
    source = int(CAMERA_SOURCE) if CAMERA_SOURCE.isdigit() else CAMERA_SOURCE
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        log.error(f"Cannot open camera source: {CAMERA_SOURCE}")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)

    head_detector  = HeadPoseDetector()
    face_detector  = FaceDetector()

    frame_interval  = 1.0 / 30.0        # capture at 30 fps
    live_interval   = 1.0 / LIVE_FPS    # broadcast at LIVE_FPS

    last_live_send  = 0.0
    last_heartbeat  = 0.0
    detection_times = []

    log.info(f"Camera capture started (source={CAMERA_SOURCE})")

    while True:
        loop_start = time.monotonic()
        ret, frame = cap.read()
        if not ret:
            log.warning("Frame capture failed — retrying")
            await asyncio.sleep(0.5)
            continue

        frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))

        if calibration:
            t0 = time.monotonic()
            annotated, violations = process_frame(frame, head_detector, face_detector)
            det_ms = (time.monotonic() - t0) * 1000
            detection_times.append(det_ms)

            # Emit violations
            for v in violations:
                await sio.emit("cctv:violation", v)

        else:
            annotated = frame

        now = time.monotonic()

        # Live frame broadcast
        if now - last_live_send >= live_interval:
            last_live_send = now
            _, jpg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 60])
            b64 = base64.b64encode(jpg.tobytes()).decode("ascii")
            await sio.emit("cctv:frame", {
                "frameBase64": b64,
                "timestamp": _now_iso(),
                "fps": LIVE_FPS,
            })

        # Heartbeat every 10s
        if now - last_heartbeat >= 10:
            last_heartbeat = now
            avg_det = sum(detection_times[-30:]) / max(len(detection_times[-30:]), 1)
            await sio.emit("cctv:heartbeat", {
                "timestamp": _now_iso(),
                "activeSessions": len(active_sessions),
                "detectionLatencyMs": round(avg_det, 1),
            })

        # Throttle to frame_interval
        elapsed = time.monotonic() - loop_start
        await asyncio.sleep(max(0.0, frame_interval - elapsed))

    cap.release()

def process_frame(frame, head_detector: "HeadPoseDetector", face_detector: "FaceDetector"):
    """
    Run detection on a frame, check each calibrated zone,
    emit violations where applicable.
    Returns (annotated_frame, list_of_violation_dicts).
    """
    from calibration import ZoneCalibration
    import json

    violations = []
    annotated  = frame.copy()

    for zone in (calibration.zones if calibration else []):
        # Crop perspective zone
        pts = np.array([[p["x"], p["y"]] for p in zone["polygon"]], dtype=np.float32)
        rect = cv2.boundingRect(pts.astype(np.int32))
        x, y, w, h = rect
        x, y = max(0, x), max(0, y)
        w = min(w, frame.shape[1] - x)
        h = min(h, frame.shape[0] - y)
        crop = frame[y:y+h, x:x+w]
        if crop.size == 0:
            continue

        system_no = zone["systemNo"]
        faces = face_detector.detect(crop)
        now_ms = time.monotonic() * 1000

        # Zone overlay
        color = (0, 200, 0)   # green

        # ── Multiple faces ───────────────────────────────────
        if len(faces) > 1:
            color = (0, 0, 220)  # red
            snapshot = _crop_b64(annotated, x, y, w, h)
            violations.append({
                "systemNo": system_no,
                "violationType": "MULTIPLE_FACES",
                "confidence": 0.95,
                "snapshotBase64": snapshot,
                "boundingBox": {"x": x, "y": y, "w": w, "h": h},
                "timestamp": _now_iso(),
            })

        # ── Empty seat ───────────────────────────────────────
        elif len(faces) == 0:
            color = (0, 165, 255)  # amber
            first = violation_timers.get(f"{system_no}:EMPTY")
            if first is None:
                violation_timers[f"{system_no}:EMPTY"] = now_ms
            elif now_ms - first >= VIOLATION_MS:
                violation_timers.pop(f"{system_no}:EMPTY", None)
                snapshot = _crop_b64(annotated, x, y, w, h)
                violations.append({
                    "systemNo": system_no,
                    "violationType": "SEAT_EMPTY",
                    "confidence": 0.9,
                    "snapshotBase64": snapshot,
                    "boundingBox": {"x": x, "y": y, "w": w, "h": h},
                    "timestamp": _now_iso(),
                })
        else:
            violation_timers.pop(f"{system_no}:EMPTY", None)

        # ── Head pose ────────────────────────────────────────
        if len(faces) == 1:
            face_roi = crop
            yaw, pitch = head_detector.estimate(face_roi)
            vtype = None
            if yaw is not None:
                if yaw < -YAW_THRESHOLD:
                    vtype = "HEAD_TURN_LEFT"
                elif yaw > YAW_THRESHOLD:
                    vtype = "HEAD_TURN_RIGHT"
                elif pitch is not None and pitch > PITCH_THRESHOLD:
                    vtype = "HEAD_DOWN"

            key = f"{system_no}:HEAD"
            if vtype:
                color = (0, 165, 255)  # amber
                first = violation_timers.get(key)
                if first is None:
                    violation_timers[key] = now_ms
                elif now_ms - first >= VIOLATION_MS:
                    violation_timers.pop(key, None)
                    conf = min(0.99, 0.6 + abs(yaw or 0) / 90)
                    snapshot = _crop_b64(annotated, x, y, w, h)
                    violations.append({
                        "systemNo": system_no,
                        "violationType": vtype,
                        "confidence": round(conf, 2),
                        "snapshotBase64": snapshot,
                        "boundingBox": {"x": x, "y": y, "w": w, "h": h},
                        "timestamp": _now_iso(),
                    })
            else:
                violation_timers.pop(key, None)

        # Draw zone polygon
        cv2.polylines(annotated, [pts.astype(np.int32)], True, color, 2)
        cv2.putText(annotated, system_no, (x + 4, y + 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

    return annotated, violations

def _crop_b64(frame, x, y, w, h) -> str:
    crop = frame[y:y+h, x:x+w]
    _, jpg = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return base64.b64encode(jpg.tobytes()).decode("ascii")

def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S") + "Z"

# ── Main ──────────────────────────────────────────────────────

async def main():
    log.info("SecureAssess CCTV Vision Service starting...")
    while True:
        try:
            await sio.connect(
                f"{SERVER_URL}/cctv",
                auth={"secret": CCTV_SECRET},
                headers={"x-cctv-secret": CCTV_SECRET},
                namespaces=["/cctv"],
            )
            await asyncio.gather(
                capture_loop(),
                sio.wait(),
            )
        except Exception as e:
            log.error(f"Connection error: {e} — retrying in 5s")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
