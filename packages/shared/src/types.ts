// ============================================================
// SecureAssess — Core Domain Types
// ============================================================

// ─── Enums ───────────────────────────────────────────────────

export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export type ExamStatus = "DRAFT" | "PUBLISHED" | "ACTIVE" | "PAUSED" | "COMPLETED";
export type SessionStatus = "WAITING" | "ACTIVE" | "PAUSED" | "SUBMITTED" | "FLAGGED" | "DISQUALIFIED";
export type ViolationType =
  | "HEAD_TURN_LEFT"
  | "HEAD_TURN_RIGHT"
  | "HEAD_DOWN"
  | "MULTIPLE_FACES"
  | "SEAT_EMPTY"
  | "TAB_SWITCH"
  | "WINDOW_BLUR"
  | "DEVTOOLS_DETECTED"
  | "MULTI_TAB_DETECTED"
  | "CLIPBOARD_ACCESS"
  | "PRINT_SCREEN"
  | "FULLSCREEN_EXIT"
  | "PROCESS_DETECTED";

export type ClientMode = "KIOSK" | "BROWSER";
export type LabMode = "HOME" | "LAB_SERVER" | "LAB_CLIENT";

/** Per-exam lockdown strength applied to student kiosk windows */
export type LockdownMode = "KIOSK" | "WINDOWED";

// ─── Teacher ─────────────────────────────────────────────────

export interface Teacher {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
}

// ─── Exam & Questions ─────────────────────────────────────────

export interface MCQOption {
  index: number;
  text: string;
}

export interface MCQQuestion {
  id: string;
  examId: string;
  questionText: string;
  options: MCQOption[];        // always 4
  correctIndex: number;        // 0–3
  difficulty: Difficulty;
  topicTag: string;
  points: number;              // derived: EASY=10, MEDIUM=20, HARD=30
  orderIndex: number;
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  durationMinutes: number;
  status: ExamStatus;
  teacherId: string;
  totalQuestions: number;
  passMarkPercent: number;
  disqualifyThreshold: number; // violation count before auto-disqualify
  strictSeatBinding: boolean;
  lockdownMode: LockdownMode;  // KIOSK = OS kiosk lock, WINDOWED = monitored window
  createdAt: string;
  updatedAt: string;
}

// ─── Roster & Seating ─────────────────────────────────────────

export interface RosterEntry {
  id: string;
  examId: string;
  fullName: string;
  registerNumber: string;
  year: string;
}

export interface SeatAllocation {
  id: string;
  examId: string;
  rosterId: string;
  systemNo: string;            // e.g. "SYS-14"
  fullName: string;
  registerNumber: string;
  year: string;
}

// ─── Lab Machines ─────────────────────────────────────────────

export interface LabMachine {
  systemNo: string;            // e.g. "SYS-01"
  machineName: string;
  macAddress: string;
  ipAddress: string;
  hardwareToken: string;
  isActive: boolean;
  row: number;
  col: number;
}

// ─── CCTV & Calibration ───────────────────────────────────────

export interface Point2D {
  x: number;
  y: number;
}

export interface CCTVZone {
  systemNo: string;
  polygon: Point2D[];          // 4 corner points in image-space
}

export interface CCTVCalibration {
  id: string;
  examId: string;
  cameraSource: string;        // "0", "1", or "rtsp://..."
  frameWidth: number;
  frameHeight: number;
  zones: CCTVZone[];
  createdAt: string;
}

// ─── Student Session ──────────────────────────────────────────

export interface StudentSession {
  id: string;
  examId: string;
  rosterId: string;
  systemNo: string;
  fullName: string;
  registerNumber: string;
  year: string;
  clientMode: ClientMode;
  status: SessionStatus;
  currentDifficulty: Difficulty;
  currentScore: number;
  highestTierReached: Difficulty;
  consecutiveCorrect: number;
  violationCount: number;
  startedAt: string | null;
  submittedAt: string | null;
  timeExtensionMinutes: number;
}

// ─── Answer & Progress ────────────────────────────────────────

export interface AnswerRecord {
  id: string;
  sessionId: string;
  questionId: string;
  chosenIndex: number;
  isCorrect: boolean;
  difficulty: Difficulty;
  pointsAwarded: number;
  answeredAt: string;
}

export interface AdaptiveState {
  currentDifficulty: Difficulty;
  consecutiveCorrect: number;
  currentScore: number;
  highestTierReached: Difficulty;
  questionsAnswered: number;
  totalQuestions: number;
}

// ─── Violations ───────────────────────────────────────────────

export interface ViolationEvent {
  id: string;
  sessionId: string;
  systemNo: string;
  violationType: ViolationType;
  source: "CLIENT" | "CCTV";
  confidence: number;          // 0.0–1.0
  snapshotBase64?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  forgiven: boolean;
  forgivenBy?: string;
  forgivenAt?: string;
}

// ─── Certificate ──────────────────────────────────────────────

export interface Certificate {
  id: string;
  sessionId: string;
  studentName: string;
  registerNumber: string;
  year: string;
  examTitle: string;
  subject: string;
  score: number;
  totalPossible: number;
  percentile: number;
  highestTierReached: Difficulty;
  status: "VERIFIED" | "FLAGGED" | "DISQUALIFIED";
  verificationHash: string;
  issuedAt: string;
  examDate: string;
}

// ─── Next Question Payload ────────────────────────────────────

export interface NextQuestionPayload {
  question: Omit<MCQQuestion, "correctIndex">; // never send correctIndex to client
  adaptiveState: AdaptiveState;
  timeRemainingSeconds: number;
}

// ─── Projector Mode ───────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  fullName: string;
  registerNumber: string;
  systemNo: string;
  currentScore: number;
  currentDifficulty: Difficulty;
  highestTierReached: Difficulty;
  status: SessionStatus;
}
