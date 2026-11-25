// ============================================================
// SecureAssess Shared — Explicit named re-exports
// (Explicit re-exports required for Rollup treeshaking)
// ============================================================

// ── types ────────────────────────────────────────────────────
export type {
  Difficulty, ExamStatus, SessionStatus, ViolationType, ClientMode, LabMode,
  Teacher, MCQOption, MCQQuestion, Exam, RosterEntry, SeatAllocation, LabMachine,
  Point2D, CCTVZone, CCTVCalibration, StudentSession, AnswerRecord, AdaptiveState,
  ViolationEvent, Certificate, NextQuestionPayload, LeaderboardEntry,
  LockdownMode,
} from "./types";

// ── schemas ───────────────────────────────────────────────────
export {
  DifficultySchema, ExamStatusSchema, SessionStatusSchema, ViolationTypeSchema,
  ClientModeSchema, LoginSchema, RegisterTeacherSchema, CreateExamSchema,
  UpdateExamSchema, MCQOptionSchema, MCQQuestionSchema, LLMGeneratedMCQArraySchema,
  RosterEntrySchema, RosterUploadSchema, LabMachineSchema, SeatAllocationSchema,
  Point2DSchema, CCTVZoneSchema, CCTVCalibrationSchema, StudentLoginSchema,
  SubmitAnswerSchema, ClientViolationSchema, CCTVViolationSchema,
  TimeExtensionSchema, ForgivenceSchema, MCQGenerationRequestSchema,
} from "./schemas";

// ── events ────────────────────────────────────────────────────
export type {
  SocketCallback, SocketResponse,
  ServerToClientEvents, ClientToServerEvents, CCTVServiceToServerEvents,
} from "./events";
export { SOCKET_NAMESPACES, ROOMS, EVENTS } from "./events";

// ── constants ─────────────────────────────────────────────────
export { PORTS, MDNS_SERVICE, ADAPTIVE, ANTICHEAT, CCTV, LIMITS, AUTH } from "./constants";
