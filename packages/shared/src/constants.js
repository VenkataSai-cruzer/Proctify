"use strict";
// ============================================================
// SecureAssess — Application-Wide Constants
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH = exports.LIMITS = exports.CCTV = exports.ANTICHEAT = exports.ADAPTIVE = exports.MDNS_SERVICE = exports.PORTS = void 0;
// ─── Ports & Networking ───────────────────────────────────────
exports.PORTS = {
    SERVER: 3000,
    CCTV_SERVICE: 3001,
};
exports.MDNS_SERVICE = {
    NAME: "secureassess-lab",
    TYPE: "_secureassess._tcp",
    HOST: "secureassess-lab.local",
};
// ─── Adaptive Engine ─────────────────────────────────────────
exports.ADAPTIVE = {
    POINTS: { EASY: 10, MEDIUM: 20, HARD: 30 },
    PROMOTE_AFTER_CORRECT: 2, // consecutive correct to tier up
    DEMOTE_AFTER_INCORRECT: 1, // incorrect answers to tier down
};
// ─── Anti-Cheat ───────────────────────────────────────────────
exports.ANTICHEAT = {
    DEFAULT_DISQUALIFY_THRESHOLD: 3,
    DEVTOOLS_CHECK_INTERVAL_MS: 1000,
    DEVTOOLS_WIDTH_THRESHOLD: 160,
    HEARTBEAT_INTERVAL_MS: 10_000,
    HEARTBEAT_TIMEOUT_MS: 30_000,
};
// ─── CCTV ─────────────────────────────────────────────────────
exports.CCTV = {
    HEAD_TURN_YAW_THRESHOLD_DEG: 30,
    HEAD_DOWN_PITCH_THRESHOLD_DEG: 20,
    VIOLATION_DURATION_THRESHOLD_MS: 4_000,
    LIVE_FRAME_FPS: 5,
    SNAPSHOT_JPEG_QUALITY: 75,
    CCTV_SECRET_HEADER: "x-cctv-secret",
};
// ─── File Limits ──────────────────────────────────────────────
exports.LIMITS = {
    MAX_PDF_SIZE_MB: 50,
    MAX_ROSTER_ROWS: 500,
    MAX_MCQ_PER_EXAM: 200,
    MAX_LAB_MACHINES: 100,
};
// ─── Token / Auth ─────────────────────────────────────────────
exports.AUTH = {
    JWT_EXPIRY: "12h",
    HARDWARE_TOKEN_LENGTH: 32,
};
