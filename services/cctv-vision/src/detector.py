"""
SecureAssess CCTV — Head Pose & Face Detection
Uses MediaPipe Face Landmarker for 3D head-pose estimation
and OpenCV's Haar/DNN cascade as a lightweight face counter.
"""

from __future__ import annotations
import logging
import numpy as np
import cv2

log = logging.getLogger("cctv-vision.detector")

# ── MediaPipe lazy import ─────────────────────────────────────

try:
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision
    _MP_AVAILABLE = True
except ImportError:
    _MP_AVAILABLE = False
    log.warning("MediaPipe not available — head-pose estimation disabled")


class HeadPoseDetector:
    """
    Estimates yaw and pitch from face landmarks using MediaPipe FaceLandmarker.
    Falls back gracefully if MediaPipe is unavailable.
    """

    # Indices in the 478-landmark model for solvePnP reference points
    LANDMARK_IDS = [1, 152, 263, 33, 287, 57]  # nose, chin, L-eye, R-eye, L-mouth, R-mouth

    # 3D model coordinates (canonical face in mm)
    MODEL_POINTS = np.array([
        [0.0,    0.0,    0.0],     # nose tip (1)
        [0.0,  -63.6,  -12.5],    # chin (152)
        [-43.3,  32.7,  -26.0],   # left eye (263)
        [43.3,   32.7,  -26.0],   # right eye (33)
        [-28.9, -28.9,  -24.1],   # left mouth (287)
        [28.9,  -28.9,  -24.1],   # right mouth (57)
    ], dtype=np.float64)

    def __init__(self):
        self._landmarker = None
        if _MP_AVAILABLE:
            self._init_mediapipe()

    def _init_mediapipe(self):
        import os
        from pathlib import Path
        model_path = Path(__file__).parent.parent / "models" / "face_landmarker.task"
        if not model_path.exists():
            log.warning(f"MediaPipe model not found at {model_path} — head-pose disabled. "
                        "Download from: https://storage.googleapis.com/mediapipe-models/"
                        "face_landmarker/face_landmarker/float16/1/face_landmarker.task")
            return
        try:
            BaseOptions = mp_python.BaseOptions
            FaceLandmarkerOptions = mp_vision.FaceLandmarkerOptions
            self._landmarker = mp_vision.FaceLandmarker.create_from_options(
                FaceLandmarkerOptions(
                    base_options=BaseOptions(model_asset_path=str(model_path)),
                    num_faces=1,
                    min_face_detection_confidence=0.5,
                    min_face_presence_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
            )
            log.info("MediaPipe FaceLandmarker initialized")
        except Exception as e:
            log.warning(f"MediaPipe init failed: {e}")

    def estimate(self, frame_bgr: np.ndarray) -> tuple[float | None, float | None]:
        """
        Returns (yaw_deg, pitch_deg) or (None, None) on failure.
        yaw > 0 → turning right, yaw < 0 → turning left
        pitch > 0 → looking down
        """
        if self._landmarker is None:
            return None, None

        try:
            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = self._landmarker.detect(mp_image)
            if not result.face_landmarks:
                return None, None

            landmarks = result.face_landmarks[0]
            h, w = frame_bgr.shape[:2]

            image_points = np.array([
                [landmarks[i].x * w, landmarks[i].y * h]
                for i in self.LANDMARK_IDS
            ], dtype=np.float64)

            focal = w
            cam_matrix = np.array([
                [focal, 0, w / 2],
                [0, focal, h / 2],
                [0,     0,     1],
            ], dtype=np.float64)

            dist_coeffs = np.zeros((4, 1), dtype=np.float64)
            success, rvec, tvec = cv2.solvePnP(
                self.MODEL_POINTS, image_points, cam_matrix, dist_coeffs,
                flags=cv2.SOLVEPNP_ITERATIVE
            )
            if not success:
                return None, None

            rmat, _ = cv2.Rodrigues(rvec)
            proj_matrix = np.hstack((rmat, tvec))
            _, _, _, _, _, _, euler = cv2.decomposeProjectionMatrix(proj_matrix)
            pitch = float(euler[0, 0])
            yaw   = float(euler[1, 0])
            return yaw, pitch

        except Exception as e:
            log.debug(f"Head-pose estimation error: {e}")
            return None, None


class FaceDetector:
    """
    Lightweight face counter using OpenCV DNN (default) or Haar cascade (fallback).
    Returns a list of bounding boxes for detected faces in the frame.
    """

    def __init__(self):
        # Try to use OpenCV DNN face detector
        self._net = None
        try:
            import os
            prototxt = str(cv2.data.haarcascades).replace("haarcascades", "") + \
                       "dnn/opencv_face_detector.pbtxt"
            caffemodel = str(cv2.data.haarcascades).replace("haarcascades", "") + \
                         "dnn/opencv_face_detector_uint8.pb"
            if os.path.exists(prototxt) and os.path.exists(caffemodel):
                self._net = cv2.dnn.readNetFromTensorflow(caffemodel, prototxt)
        except Exception:
            pass

        self._cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    def detect(self, frame_bgr: np.ndarray) -> list[tuple[int, int, int, int]]:
        """Returns list of (x, y, w, h) bounding boxes."""
        if frame_bgr is None or frame_bgr.size == 0:
            return []

        if self._net is not None:
            return self._detect_dnn(frame_bgr)
        return self._detect_haar(frame_bgr)

    def _detect_dnn(self, frame: np.ndarray) -> list[tuple[int, int, int, int]]:
        h, w = frame.shape[:2]
        blob = cv2.dnn.blobFromImage(cv2.resize(frame, (300, 300)), 1.0, (300, 300),
                                      (104.0, 177.0, 123.0))
        self._net.setInput(blob)
        detections = self._net.forward()
        boxes = []
        for i in range(detections.shape[2]):
            confidence = detections[0, 0, i, 2]
            if confidence > 0.5:
                x1 = int(detections[0, 0, i, 3] * w)
                y1 = int(detections[0, 0, i, 4] * h)
                x2 = int(detections[0, 0, i, 5] * w)
                y2 = int(detections[0, 0, i, 6] * h)
                boxes.append((x1, y1, x2 - x1, y2 - y1))
        return boxes

    def _detect_haar(self, frame: np.ndarray) -> list[tuple[int, int, int, int]]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self._cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
        return [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in faces]
