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

import type {
  StudentSession,
  ViolationEvent,
  MCQQuestion,
  AdaptiveState,
  NextQuestionPayload,
  LeaderboardEntry,
  SeatAllocation,
  Exam,
  CCTVCalibration,
  Certificate,
  LockdownMode,
} from "./types";

// ─── Utility ──────────────────────────────────────────────────

export type SocketCallback<T = void> = (response: SocketResponse<T>) => void;

export interface SocketResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// ============================================================
// SERVER → CLIENT Events
// ============================================================

export interface ServerToClientEvents {

  // ── Connection / Health ────────────────────────────────────

  /** Server confirms client registered and authenticated */
  "server:welcome": (payload: {
    serverVersion: string;
    serverTime: string;
    examId: string;
    labName: string;
  }) => void;

  /** Server-side keep-alive ping */
  "server:ping": (timestamp: string) => void;

  // ── Exam Lifecycle ────────────────────────────────────────

  /** Exam status changed (PUBLISHED → ACTIVE → PAUSED → COMPLETED) */
  "exam:statusChanged": (payload: {
    examId: string;
    status: Exam["status"];
    message: string;
    timestamp: string;
  }) => void;

  /** Lobby is now open — students may enter credentials */
  "exam:lobbyOpened": (payload: {
    examId: string;
    examTitle: string;
    subject: string;
    durationMinutes: number;
    strictSeatBinding: boolean;
    lockdownMode: LockdownMode;
  }) => void;

  /** Countdown before exam start (broadcasts every second for 10s) */
  "exam:countdown": (payload: {
    examId: string;
    secondsRemaining: number;
  }) => void;

  /** Exam globally paused by teacher */
  "exam:paused": (payload: {
    examId: string;
    reason?: string;
    timestamp: string;
  }) => void;

  /** Exam resumed after pause */
  "exam:resumed": (payload: {
    examId: string;
    timeRemainingSeconds: number;
    timestamp: string;
  }) => void;

  /** Time extended for one or all sessions */
  "exam:timeExtended": (payload: {
    examId: string;
    sessionId?: string;          // undefined = all sessions
    additionalMinutes: number;
    newEndTime: string;
  }) => void;

  /** Final 5-minute and 1-minute warnings */
  "exam:timeWarning": (payload: {
    examId: string;
    minutesRemaining: number;
  }) => void;

  // ── Student Session ───────────────────────────────────────

  /** Login accepted — session created, student joins exam room */
  "session:created": (payload: {
    session: StudentSession;
    seatAllocation: SeatAllocation;
  }) => void;

  /** Session state updated (score, difficulty, status, violations) */
  "session:updated": (payload: StudentSession) => void;

  /** Next question delivered to this student */
  "session:nextQuestion": (payload: NextQuestionPayload) => void;

  /** Answer result returned after submission */
  "session:answerResult": (payload: {
    sessionId: string;
    questionId: string;
    isCorrect: boolean;
    correctIndex: number;
    pointsAwarded: number;
    adaptiveState: AdaptiveState;
    difficultyChanged: boolean;
    newDifficulty?: AdaptiveState["currentDifficulty"];
  }) => void;

  /** Student successfully submitted exam */
  "session:submitted": (payload: {
    sessionId: string;
    message: string;             // always generic — no score shown to student
  }) => void;

  /** Forced submission by teacher */
  "session:forceSubmitted": (payload: {
    sessionId: string;
    reason: string;
  }) => void;

  /** Session disqualified (violation threshold exceeded) */
  "session:disqualified": (payload: {
    sessionId: string;
    reason: string;
    violationCount: number;
  }) => void;

  /** Seat mismatch — student told to move (strict binding mode) */
  "session:seatMismatch": (payload: {
    assignedSystemNo: string;
    message: string;
  }) => void;

  // ── Anti-Cheat / Violations ───────────────────────────────

  /** Violation recorded (echoed back to student — warning UI) */
  "violation:recorded": (payload: {
    violationId: string;
    sessionId: string;
    violationType: ViolationEvent["violationType"];
    warningMessage: string;
    violationCount: number;
    remainingAllowed: number;
    timestamp: string;
  }) => void;

  /** Teacher forgave a violation — restore session status */
  "violation:forgiven": (payload: {
    violationId: string;
    sessionId: string;
    restoredScore?: number;
    timestamp: string;
  }) => void;

  // ── Teacher Dashboard ─────────────────────────────────────

  /** Full session grid snapshot (periodic or on-demand) */
  "dashboard:sessionGrid": (payload: {
    examId: string;
    sessions: StudentSession[];
    timestamp: string;
  }) => void;

  /** Single session delta update for the grid */
  "dashboard:sessionDelta": (payload: {
    examId: string;
    session: StudentSession;
  }) => void;

  /** New violation alert for teacher dashboard */
  "dashboard:violationAlert": (payload: ViolationEvent) => void;

  /** Lab machine connectivity update */
  "dashboard:machineStatus": (payload: {
    systemNo: string;
    online: boolean;
    clientMode: "KIOSK" | "BROWSER" | null;
    ipAddress: string;
    timestamp: string;
  }) => void;

  /** Leaderboard updated (for projector mode) */
  "dashboard:leaderboard": (payload: {
    examId: string;
    entries: LeaderboardEntry[];
    timestamp: string;
  }) => void;

  // ── CCTV Feed ─────────────────────────────────────────────

  /** Live JPEG frame from CCTV service (base64, throttled to ~5 fps) */
  "cctv:liveFrame": (payload: {
    frameBase64: string;
    timestamp: string;
    activeAlerts: string[];      // systemNos currently in alert state
  }) => void;

  /** CCTV violation event (from Python service) */
  "cctv:violation": (payload: {
    systemNo: string;
    sessionId?: string;
    violationType: ViolationEvent["violationType"];
    confidence: number;
    snapshotBase64?: string;
    boundingBox?: { x: number; y: number; w: number; h: number };
    timestamp: string;
  }) => void;

  /** CCTV service connection status */
  "cctv:serviceStatus": (payload: {
    connected: boolean;
    cameraSource: string;
    fps: number;
    timestamp: string;
  }) => void;

  // ── MCQ Generation ────────────────────────────────────────

  /** Progress update during LLM question generation */
  "mcq:generationProgress": (payload: {
    examId: string;
    generated: number;
    target: number;
    currentTopic?: string;
    stage: "EXTRACTING" | "GENERATING" | "DEDUPLICATING" | "COMPLETE" | "ERROR";
    error?: string;
  }) => void;

  /** Final batch of generated/deduped questions ready for review */
  "mcq:generationComplete": (payload: {
    examId: string;
    questions: MCQQuestion[];
    duplicatesRemoved: number;
    totalGenerated: number;
  }) => void;

  // ── Certificate & Report ──────────────────────────────────

  /** Certificate(s) ready for download */
  "export:certificatesReady": (payload: {
    examId: string;
    certificates: Certificate[];
    zipDownloadToken: string;
  }) => void;

  /** Report PDF ready */
  "export:reportReady": (payload: {
    examId: string;
    reportType: "MARKSHEET" | "FORENSIC";
    downloadToken: string;
  }) => void;

  // ── LAN Discovery ─────────────────────────────────────────

  /** mDNS peer found on LAN */
  "discovery:serverFound": (payload: {
    host: string;
    port: number;
    labName: string;
    serverVersion: string;
  }) => void;
}

// ============================================================
// CLIENT → SERVER Events
// ============================================================

export interface ClientToServerEvents {

  // ── Connection ────────────────────────────────────────────

  /** Teacher authenticates their socket connection */
  "auth:teacherJoin": (payload: {
    token: string;              // JWT
    examId?: string;
  }, callback: SocketCallback<{ teacherId: string; name: string }>) => void;

  /** Lab machine registers its socket (kiosk daemon or browser) */
  "auth:machineRegister": (payload: {
    hardwareToken: string;
    systemNo: string;
    clientMode: "KIOSK" | "BROWSER";
    userAgent?: string;
  }, callback: SocketCallback<{ registered: boolean }>) => void;

  // ── Student Exam Flow ─────────────────────────────────────

  /** Student submits credentials to join exam lobby */
  "student:login": (payload: {
    examId: string;
    fullName: string;
    registerNumber: string;
    year: string;
    systemNo: string;
    hardwareToken: string;
    clientMode: "KIOSK" | "BROWSER";
  }, callback: SocketCallback<{ sessionId: string; seatAllocation: SeatAllocation }>) => void;

  /** Student requests the next question */
  "student:requestNextQuestion": (payload: {
    sessionId: string;
  }, callback: SocketCallback<NextQuestionPayload>) => void;

  /** Student submits their answer */
  "student:submitAnswer": (payload: {
    sessionId: string;
    questionId: string;
    chosenIndex: number;
  }, callback: SocketCallback<{
    isCorrect: boolean;
    correctIndex: number;
    pointsAwarded: number;
    adaptiveState: AdaptiveState;
  }>) => void;

  /** Student voluntarily submits exam (all questions answered / time up) */
  "student:submitExam": (payload: {
    sessionId: string;
  }, callback: SocketCallback<{ submitted: boolean }>) => void;

  /** Student heartbeat — proves session is alive */
  "student:heartbeat": (payload: {
    sessionId: string;
    timestamp: string;
  }) => void;

  // ── Anti-Cheat Client Events ──────────────────────────────

  /** Client-side violation detected */
  "anticheat:violation": (payload: {
    sessionId: string;
    violationType: string;
    metadata?: Record<string, unknown>;
    timestamp: string;
  }) => void;

  /** Client re-syncs state after brief LAN drop */
  "anticheat:reconnectSync": (payload: {
    sessionId: string;
    lastQuestionId?: string;
    pendingAnswer?: { questionId: string; chosenIndex: number };
  }, callback: SocketCallback<{
    sessionState: StudentSession;
    currentQuestion?: NextQuestionPayload;
  }>) => void;

  // ── Teacher Controls ──────────────────────────────────────

  /** Open exam lobby (students can now log in) */
  "teacher:openLobby": (payload: {
    examId: string;
  }, callback: SocketCallback<void>) => void;

  /** Start exam for all sessions in lobby */
  "teacher:startExam": (payload: {
    examId: string;
  }, callback: SocketCallback<{ startedCount: number }>) => void;

  /** Pause exam for all */
  "teacher:pauseExam": (payload: {
    examId: string;
    reason?: string;
  }, callback: SocketCallback<void>) => void;

  /** Resume exam for all */
  "teacher:resumeExam": (payload: {
    examId: string;
  }, callback: SocketCallback<void>) => void;

  /** Extend time — one student or all */
  "teacher:extendTime": (payload: {
    examId: string;
    sessionId?: string;
    additionalMinutes: number;
  }, callback: SocketCallback<void>) => void;

  /** Force submit one student */
  "teacher:forceSubmit": (payload: {
    examId: string;
    sessionId: string;
    reason?: string;
  }, callback: SocketCallback<void>) => void;

  /** Request full dashboard grid snapshot */
  "teacher:requestGrid": (payload: {
    examId: string;
  }, callback: SocketCallback<{ sessions: StudentSession[] }>) => void;

  /** Forgive a violation (restore points) */
  "teacher:forgiveViolation": (payload: {
    violationId: string;
  }, callback: SocketCallback<{ session: StudentSession }>) => void;

  /** Request leaderboard */
  "teacher:requestLeaderboard": (payload: {
    examId: string;
  }, callback: SocketCallback<{ entries: LeaderboardEntry[] }>) => void;

  /** Request certificate generation */
  "teacher:generateCertificates": (payload: {
    examId: string;
  }, callback: SocketCallback<{ queued: boolean }>) => void;

  /** Request forensic/marksheet report generation */
  "teacher:generateReport": (payload: {
    examId: string;
    reportType: "MARKSHEET" | "FORENSIC";
  }, callback: SocketCallback<{ queued: boolean }>) => void;

  // ── CCTV ─────────────────────────────────────────────────

  /** Save CCTV calibration zones */
  "cctv:saveCalibration": (payload: CCTVCalibration,
    callback: SocketCallback<{ saved: boolean }>) => void;

  /** Request CCTV live frame stream start/stop */
  "cctv:toggleLiveFeed": (payload: {
    enabled: boolean;
  }, callback: SocketCallback<void>) => void;

  // ── MCQ Generation ────────────────────────────────────────

  /** Trigger LLM MCQ generation from extracted PDF text */
  "mcq:generate": (payload: {
    examId: string;
    pdfText: string;
    targetCount: number;
    mode: "online" | "offline";
    onlineProvider?: "openai" | "groq" | "gemini";
    apiKey?: string;
    offlineModel?: string;
    difficultyDistribution: { easy: number; medium: number; hard: number };
  }, callback: SocketCallback<{ jobId: string }>) => void;
}

// ============================================================
// INTER-SERVICE Events (Python CCTV ↔ Node Server)
// ============================================================

export interface CCTVServiceToServerEvents {

  /** Python service announces it has connected */
  "cctv:serviceConnected": (payload: {
    version: string;
    cameraSource: string;
    frameWidth: number;
    frameHeight: number;
  }) => void;

  /** Throttled live frame (base64 JPEG) for PiP feed */
  "cctv:frame": (payload: {
    frameBase64: string;
    timestamp: string;
    fps: number;
  }) => void;

  /** Violation detected by vision service */
  "cctv:violation": (payload: {
    systemNo: string;
    violationType: string;
    confidence: number;
    snapshotBase64?: string;
    boundingBox?: { x: number; y: number; w: number; h: number };
    timestamp: string;
  }) => void;

  /** Heartbeat from Python service */
  "cctv:heartbeat": (payload: {
    timestamp: string;
    activeSessions: number;
    detectionLatencyMs: number;
  }) => void;
}

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
export const SOCKET_NAMESPACES = {
  MAIN: "/",
  CCTV: "/cctv",
  PROJECTOR: "/projector",
} as const;

/**
 * Room naming helpers
 */
export const ROOMS = {
  exam: (examId: string) => `exam:${examId}`,
  session: (sessionId: string) => `session:${sessionId}`,
  teacher: (teacherId: string) => `teacher:${teacherId}`,
  projector: (examId: string) => `projector:${examId}`,
  machines: (examId: string) => `machines:${examId}`,
} as const;

/**
 * All event name constants (avoids string literals in application code)
 */
export const EVENTS = {
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
} as const;
