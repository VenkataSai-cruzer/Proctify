"use strict";
// ============================================================
// SecureAssess — Complete Socket.IO Event Contract
// ============================================================
//
// Naming convention:
//   CLIENT_TO_SERVER events: verb:noun  (e.g. "exam:submitAnswer")
//   SERVER_TO_CLIENT events: noun:verb  (e.g. "session:updated")
//   CCTV_SERVICE events:     cctv:noun  (e.g. "cctv:violation")
//
// Rooms:
//   "exam:<examId>"           — all teacher monitors + students in that exam
//   "session:<sessionId>"     — private channel for one student session
//   "teacher:<teacherId>"     — private teacher channel
//   "projector:<examId>"      — projector-only broadcast
//
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENTS = exports.ROOMS = exports.SOCKET_NAMESPACES = void 0;
// ============================================================
// Namespaces
// ============================================================
/**
 * Socket.IO namespace map:
 *
 * "/"          — Teacher desktop & student kiosk connections
 * "/cctv"      — Python CCTV vision service (internal, auth by secret)
 * "/projector" — Read-only projector mode broadcast (teacher only)
 */
exports.SOCKET_NAMESPACES = {
    MAIN: "/",
    CCTV: "/cctv",
    PROJECTOR: "/projector",
};
/**
 * Room naming helpers
 */
exports.ROOMS = {
    exam: (examId) => `exam:${examId}`,
    session: (sessionId) => `session:${sessionId}`,
    teacher: (teacherId) => `teacher:${teacherId}`,
    projector: (examId) => `projector:${examId}`,
    machines: (examId) => `machines:${examId}`,
};
/**
 * All event name constants (avoids string literals in application code)
 */
exports.EVENTS = {
    // Server → Client
    SERVER_WELCOME: "server:welcome",
    SERVER_PING: "server:ping",
    EXAM_STATUS_CHANGED: "exam:statusChanged",
    EXAM_LOBBY_OPENED: "exam:lobbyOpened",
    EXAM_COUNTDOWN: "exam:countdown",
    EXAM_PAUSED: "exam:paused",
    EXAM_RESUMED: "exam:resumed",
    EXAM_TIME_EXTENDED: "exam:timeExtended",
    EXAM_TIME_WARNING: "exam:timeWarning",
    SESSION_CREATED: "session:created",
    SESSION_UPDATED: "session:updated",
    SESSION_NEXT_QUESTION: "session:nextQuestion",
    SESSION_ANSWER_RESULT: "session:answerResult",
    SESSION_SUBMITTED: "session:submitted",
    SESSION_FORCE_SUBMITTED: "session:forceSubmitted",
    SESSION_DISQUALIFIED: "session:disqualified",
    SESSION_SEAT_MISMATCH: "session:seatMismatch",
    VIOLATION_RECORDED: "violation:recorded",
    VIOLATION_FORGIVEN: "violation:forgiven",
    DASHBOARD_SESSION_GRID: "dashboard:sessionGrid",
    DASHBOARD_SESSION_DELTA: "dashboard:sessionDelta",
    DASHBOARD_VIOLATION_ALERT: "dashboard:violationAlert",
    DASHBOARD_MACHINE_STATUS: "dashboard:machineStatus",
    DASHBOARD_LEADERBOARD: "dashboard:leaderboard",
    CCTV_LIVE_FRAME: "cctv:liveFrame",
    CCTV_VIOLATION: "cctv:violation",
    CCTV_SERVICE_STATUS: "cctv:serviceStatus",
    MCQ_GENERATION_PROGRESS: "mcq:generationProgress",
    MCQ_GENERATION_COMPLETE: "mcq:generationComplete",
    EXPORT_CERTIFICATES_READY: "export:certificatesReady",
    EXPORT_REPORT_READY: "export:reportReady",
    DISCOVERY_SERVER_FOUND: "discovery:serverFound",
    // Client → Server
    AUTH_TEACHER_JOIN: "auth:teacherJoin",
    AUTH_MACHINE_REGISTER: "auth:machineRegister",
    STUDENT_LOGIN: "student:login",
    STUDENT_REQUEST_NEXT_QUESTION: "student:requestNextQuestion",
    STUDENT_SUBMIT_ANSWER: "student:submitAnswer",
    STUDENT_SUBMIT_EXAM: "student:submitExam",
    STUDENT_HEARTBEAT: "student:heartbeat",
    ANTICHEAT_VIOLATION: "anticheat:violation",
    ANTICHEAT_RECONNECT_SYNC: "anticheat:reconnectSync",
    TEACHER_OPEN_LOBBY: "teacher:openLobby",
    TEACHER_START_EXAM: "teacher:startExam",
    TEACHER_PAUSE_EXAM: "teacher:pauseExam",
    TEACHER_RESUME_EXAM: "teacher:resumeExam",
    TEACHER_EXTEND_TIME: "teacher:extendTime",
    TEACHER_FORCE_SUBMIT: "teacher:forceSubmit",
    TEACHER_REQUEST_GRID: "teacher:requestGrid",
    TEACHER_FORGIVE_VIOLATION: "teacher:forgiveViolation",
    TEACHER_REQUEST_LEADERBOARD: "teacher:requestLeaderboard",
    TEACHER_GENERATE_CERTIFICATES: "teacher:generateCertificates",
    TEACHER_GENERATE_REPORT: "teacher:generateReport",
    CCTV_SAVE_CALIBRATION: "cctv:saveCalibration",
    CCTV_TOGGLE_LIVE_FEED: "cctv:toggleLiveFeed",
    MCQ_GENERATE: "mcq:generate",
};
