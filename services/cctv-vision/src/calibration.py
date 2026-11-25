"""
SecureAssess CCTV — Zone Calibration Model
Stores per-seat polygon zones and provides point-in-polygon lookup.
"""

from __future__ import annotations
from dataclasses import dataclass, field
import numpy as np
import cv2


@dataclass
class Zone:
    system_no: str
    polygon: np.ndarray  # shape (4, 2) float32


@dataclass
class ZoneCalibration:
    exam_id: str
    camera_source: str
    frame_width: int
    frame_height: int
    zones: list[Zone] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "ZoneCalibration":
        zones = []
        for z in data.get("zones", []):
            pts = np.array([[p["x"], p["y"]] for p in z["polygon"]], dtype=np.float32)
            zones.append(Zone(system_no=z["systemNo"], polygon=pts))
        return cls(
            exam_id=data.get("examId", ""),
            camera_source=data.get("cameraSource", "0"),
            frame_width=data.get("frameWidth", 1280),
            frame_height=data.get("frameHeight", 720),
            zones=zones,
        )

    def to_dict(self) -> dict:
        return {
            "examId": self.exam_id,
            "cameraSource": self.camera_source,
            "frameWidth": self.frame_width,
            "frameHeight": self.frame_height,
            "zones": [
                {
                    "systemNo": z.system_no,
                    "polygon": [{"x": float(p[0]), "y": float(p[1])} for p in z.polygon],
                }
                for z in self.zones
            ],
        }

    def zone_for_point(self, x: float, y: float) -> Zone | None:
        """Return the zone containing the given point, or None."""
        pt = (float(x), float(y))
        for zone in self.zones:
            if cv2.pointPolygonTest(zone.polygon, pt, False) >= 0:
                return zone
        return None
