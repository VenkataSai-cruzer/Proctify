// ============================================================
// SecureAssess — Zod Validation Schemas
// ============================================================

import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────

export const DifficultySchema = z.enum(["EASY", "MEDIUM", "HARD"]);
export const ExamStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "PAUSED", "COMPLETED"]);
export const SessionStatusSchema = z.enum(["WAITING", "ACTIVE", "PAUSED", "SUBMITTED", "FLAGGED", "DISQUALIFIED"]);
export const ViolationTypeSchema = z.enum([
  "HEAD_TURN_LEFT", "HEAD_TURN_RIGHT", "HEAD_DOWN",
  "MULTIPLE_FACES", "SEAT_EMPTY",
  "TAB_SWITCH", "WINDOW_BLUR", "DEVTOOLS_DETECTED",
  "MULTI_TAB_DETECTED", "CLIPBOARD_ACCESS", "PRINT_SCREEN",
  "FULLSCREEN_EXIT", "PROCESS_DETECTED",
]);
export const ClientModeSchema = z.enum(["KIOSK", "BROWSER"]);

// ─── Auth ─────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const RegisterTeacherSchema = z.object({
  name:              z.string().min(2).max(100),
  email:             z.string().email(),
  password:          z.string().min(8).max(128),
  registrationPin:   z.string().optional(),   // required after first-run
  newPin:            z.string().min(4).max(64).optional(), // first-run Lab Host PIN setup
});

// ─── Exam ─────────────────────────────────────────────────────

export const CreateExamSchema = z.object({
  title: z.string().min(3).max(200),
  subject: z.string().min(2).max(100),
  durationMinutes: z.number().int().min(5).max(300),
  passMarkPercent: z.number().min(0).max(100),
  disqualifyThreshold: z.number().int().min(1).max(20).default(3),
  strictSeatBinding: z.boolean().default(true),
  lockdownMode: z.enum(["KIOSK", "WINDOWED"]).default("KIOSK"),
});

export const UpdateExamSchema = CreateExamSchema.partial();

// ─── MCQ Question ─────────────────────────────────────────────

export const MCQOptionSchema = z.object({
  index: z.number().int().min(0).max(3),
  text: z.string().min(1).max(1000),
});

export const MCQQuestionSchema = z.object({
  questionText: z.string().min(5).max(2000),
  options: z.array(MCQOptionSchema).length(4),
  correctIndex: z.number().int().min(0).max(3),
  difficulty: DifficultySchema,
  topicTag: z.string().min(1).max(100),
});

// Schema for structured LLM output — array of MCQs
export const LLMGeneratedMCQArraySchema = z.array(MCQQuestionSchema).min(1).max(100);

// ─── Roster ───────────────────────────────────────────────────

export const RosterEntrySchema = z.object({
  fullName: z.string().min(2).max(200),
  registerNumber: z.string().min(2).max(50).regex(/^[A-Za-z0-9]+$/),
  year: z.string().min(1).max(20),
});

export const RosterUploadSchema = z.array(RosterEntrySchema).min(1).max(500);

// ─── Lab Machine ─────────────────────────────────────────────

export const LabMachineSchema = z.object({
  systemNo: z.string().regex(/^SYS-\d{2,3}$/),
  machineName: z.string().min(1).max(100),
  macAddress: z.string().regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/),
  ipAddress: z.string().ip(),
  hardwareToken: z.string().min(16).max(128),
  isActive: z.boolean().default(true),
  row: z.number().int().min(0),
  col: z.number().int().min(0),
});

// ─── Seat Allocation ─────────────────────────────────────────

export const SeatAllocationSchema = z.object({
  examId: z.string().uuid(),
  systemNo: z.string().regex(/^SYS-\d{2,3}$/),
  rosterId: z.string().uuid(),
});

// ─── CCTV Calibration ────────────────────────────────────────

export const Point2DSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
});

export const CCTVZoneSchema = z.object({
  systemNo: z.string().regex(/^SYS-\d{2,3}$/),
  polygon: z.array(Point2DSchema).length(4),
});

export const CCTVCalibrationSchema = z.object({
  examId: z.string().uuid(),
  cameraSource: z.string().min(1),  // "0", "1", or rtsp URL
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  zones: z.array(CCTVZoneSchema).min(1),
});

// ─── Student Login ────────────────────────────────────────────

export const StudentLoginSchema = z.object({
  examId: z.string().uuid(),
  fullName: z.string().min(2).max(200),
  registerNumber: z.string().min(2).max(50),
  year: z.string().min(1).max(20),
  systemNo: z.string().regex(/^SYS-\d{2,3}$/),
  hardwareToken: z.string().min(16),
  clientMode: ClientModeSchema,
});

// ─── Answer Submission ────────────────────────────────────────

export const SubmitAnswerSchema = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  chosenIndex: z.number().int().min(0).max(3),
});

// ─── Client Anti-Cheat Event ─────────────────────────────────

export const ClientViolationSchema = z.object({
  sessionId: z.string().uuid(),
  violationType: ViolationTypeSchema,
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
});

// ─── CCTV Violation (from Python service) ────────────────────

export const CCTVViolationSchema = z.object({
  systemNo: z.string().regex(/^SYS-\d{2,3}$/),
  violationType: ViolationTypeSchema,
  confidence: z.number().min(0).max(1),
  snapshotBase64: z.string().optional(),
  timestamp: z.string().datetime(),
});

// ─── Exam Control Commands (Teacher → Server) ────────────────

export const TimeExtensionSchema = z.object({
  examId: z.string().uuid(),
  sessionId: z.string().uuid().optional(), // undefined = apply to all
  additionalMinutes: z.number().int().min(1).max(60),
});

export const ForgivenceSchema = z.object({
  violationId: z.string().uuid(),
  teacherId: z.string().uuid(),
});

// ─── PDF MCQ Generation Request ──────────────────────────────

export const MCQGenerationRequestSchema = z.object({
  examId: z.string().uuid(),
  pdfText: z.string().min(50),
  targetCount: z.number().int().min(5).max(100).default(30),
  mode: z.enum(["online", "offline"]),
  onlineProvider: z.enum(["openai", "groq", "gemini"]).optional(),
  apiKey: z.string().optional(),
  offlineModel: z.string().optional().default("qwen3:8b"),
  difficultyDistribution: z.object({
    easy: z.number().min(0).max(100),
    medium: z.number().min(0).max(100),
    hard: z.number().min(0).max(100),
  }).refine(d => d.easy + d.medium + d.hard === 100, {
    message: "Difficulty distribution must sum to 100",
  }).default({ easy: 40, medium: 40, hard: 20 }),
});
