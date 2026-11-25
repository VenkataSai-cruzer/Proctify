"use strict";
// ============================================================
// SecureAssess — Zod Validation Schemas
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCQGenerationRequestSchema = exports.ForgivenceSchema = exports.TimeExtensionSchema = exports.CCTVViolationSchema = exports.ClientViolationSchema = exports.SubmitAnswerSchema = exports.StudentLoginSchema = exports.CCTVCalibrationSchema = exports.CCTVZoneSchema = exports.Point2DSchema = exports.SeatAllocationSchema = exports.LabMachineSchema = exports.RosterUploadSchema = exports.RosterEntrySchema = exports.LLMGeneratedMCQArraySchema = exports.MCQQuestionSchema = exports.MCQOptionSchema = exports.UpdateExamSchema = exports.CreateExamSchema = exports.RegisterTeacherSchema = exports.LoginSchema = exports.ClientModeSchema = exports.ViolationTypeSchema = exports.SessionStatusSchema = exports.ExamStatusSchema = exports.DifficultySchema = void 0;
const zod_1 = require("zod");
// ─── Enums ───────────────────────────────────────────────────
exports.DifficultySchema = zod_1.z.enum(["EASY", "MEDIUM", "HARD"]);
exports.ExamStatusSchema = zod_1.z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "PAUSED", "COMPLETED"]);
exports.SessionStatusSchema = zod_1.z.enum(["WAITING", "ACTIVE", "PAUSED", "SUBMITTED", "FLAGGED", "DISQUALIFIED"]);
exports.ViolationTypeSchema = zod_1.z.enum([
    "HEAD_TURN_LEFT", "HEAD_TURN_RIGHT", "HEAD_DOWN",
    "MULTIPLE_FACES", "SEAT_EMPTY",
    "TAB_SWITCH", "WINDOW_BLUR", "DEVTOOLS_DETECTED",
    "MULTI_TAB_DETECTED", "CLIPBOARD_ACCESS", "PRINT_SCREEN",
    "FULLSCREEN_EXIT", "PROCESS_DETECTED",
]);
exports.ClientModeSchema = zod_1.z.enum(["KIOSK", "BROWSER"]);
// ─── Auth ─────────────────────────────────────────────────────
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
exports.RegisterTeacherSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8).max(128),
});
// ─── Exam ─────────────────────────────────────────────────────
exports.CreateExamSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).max(200),
    subject: zod_1.z.string().min(2).max(100),
    durationMinutes: zod_1.z.number().int().min(5).max(300),
    passMarkPercent: zod_1.z.number().min(0).max(100),
    disqualifyThreshold: zod_1.z.number().int().min(1).max(20).default(3),
    strictSeatBinding: zod_1.z.boolean().default(true),
    lockdownMode: zod_1.z.enum(["KIOSK", "WINDOWED"]).default("KIOSK"),
});
exports.UpdateExamSchema = exports.CreateExamSchema.partial();
// ─── MCQ Question ─────────────────────────────────────────────
exports.MCQOptionSchema = zod_1.z.object({
    index: zod_1.z.number().int().min(0).max(3),
    text: zod_1.z.string().min(1).max(1000),
});
exports.MCQQuestionSchema = zod_1.z.object({
    questionText: zod_1.z.string().min(5).max(2000),
    options: zod_1.z.array(exports.MCQOptionSchema).length(4),
    correctIndex: zod_1.z.number().int().min(0).max(3),
    difficulty: exports.DifficultySchema,
    topicTag: zod_1.z.string().min(1).max(100),
});
// Schema for structured LLM output — array of MCQs
exports.LLMGeneratedMCQArraySchema = zod_1.z.array(exports.MCQQuestionSchema).min(1).max(100);
// ─── Roster ───────────────────────────────────────────────────
exports.RosterEntrySchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2).max(200),
    registerNumber: zod_1.z.string().min(2).max(50).regex(/^[A-Za-z0-9]+$/),
    year: zod_1.z.string().min(1).max(20),
});
exports.RosterUploadSchema = zod_1.z.array(exports.RosterEntrySchema).min(1).max(500);
// ─── Lab Machine ─────────────────────────────────────────────
exports.LabMachineSchema = zod_1.z.object({
    systemNo: zod_1.z.string().regex(/^SYS-\d{2,3}$/),
    machineName: zod_1.z.string().min(1).max(100),
    macAddress: zod_1.z.string().regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/),
    ipAddress: zod_1.z.string().ip(),
    hardwareToken: zod_1.z.string().min(16).max(128),
    isActive: zod_1.z.boolean().default(true),
    row: zod_1.z.number().int().min(0),
    col: zod_1.z.number().int().min(0),
});
// ─── Seat Allocation ─────────────────────────────────────────
exports.SeatAllocationSchema = zod_1.z.object({
    examId: zod_1.z.string().uuid(),
    systemNo: zod_1.z.string().regex(/^SYS-\d{2,3}$/),
    rosterId: zod_1.z.string().uuid(),
});
// ─── CCTV Calibration ────────────────────────────────────────
exports.Point2DSchema = zod_1.z.object({
    x: zod_1.z.number().min(0),
    y: zod_1.z.number().min(0),
});
exports.CCTVZoneSchema = zod_1.z.object({
    systemNo: zod_1.z.string().regex(/^SYS-\d{2,3}$/),
    polygon: zod_1.z.array(exports.Point2DSchema).length(4),
});
exports.CCTVCalibrationSchema = zod_1.z.object({
    examId: zod_1.z.string().uuid(),
    cameraSource: zod_1.z.string().min(1), // "0", "1", or rtsp URL
    frameWidth: zod_1.z.number().int().positive(),
    frameHeight: zod_1.z.number().int().positive(),
    zones: zod_1.z.array(exports.CCTVZoneSchema).min(1),
});
// ─── Student Login ────────────────────────────────────────────
exports.StudentLoginSchema = zod_1.z.object({
    examId: zod_1.z.string().uuid(),
    fullName: zod_1.z.string().min(2).max(200),
    registerNumber: zod_1.z.string().min(2).max(50),
    year: zod_1.z.string().min(1).max(20),
    systemNo: zod_1.z.string().regex(/^SYS-\d{2,3}$/),
    hardwareToken: zod_1.z.string().min(16),
    clientMode: exports.ClientModeSchema,
});
// ─── Answer Submission ────────────────────────────────────────
exports.SubmitAnswerSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid(),
    questionId: zod_1.z.string().uuid(),
    chosenIndex: zod_1.z.number().int().min(0).max(3),
});
// ─── Client Anti-Cheat Event ─────────────────────────────────
exports.ClientViolationSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid(),
    violationType: exports.ViolationTypeSchema,
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
    timestamp: zod_1.z.string().datetime(),
});
// ─── CCTV Violation (from Python service) ────────────────────
exports.CCTVViolationSchema = zod_1.z.object({
    systemNo: zod_1.z.string().regex(/^SYS-\d{2,3}$/),
    violationType: exports.ViolationTypeSchema,
    confidence: zod_1.z.number().min(0).max(1),
    snapshotBase64: zod_1.z.string().optional(),
    timestamp: zod_1.z.string().datetime(),
});
// ─── Exam Control Commands (Teacher → Server) ────────────────
exports.TimeExtensionSchema = zod_1.z.object({
    examId: zod_1.z.string().uuid(),
    sessionId: zod_1.z.string().uuid().optional(), // undefined = apply to all
    additionalMinutes: zod_1.z.number().int().min(1).max(60),
});
exports.ForgivenceSchema = zod_1.z.object({
    violationId: zod_1.z.string().uuid(),
    teacherId: zod_1.z.string().uuid(),
});
// ─── PDF MCQ Generation Request ──────────────────────────────
exports.MCQGenerationRequestSchema = zod_1.z.object({
    examId: zod_1.z.string().uuid(),
    pdfText: zod_1.z.string().min(50),
    targetCount: zod_1.z.number().int().min(5).max(100).default(30),
    mode: zod_1.z.enum(["online", "offline"]),
    onlineProvider: zod_1.z.enum(["openai", "groq", "gemini"]).optional(),
    apiKey: zod_1.z.string().optional(),
    offlineModel: zod_1.z.string().optional().default("qwen3:8b"),
    difficultyDistribution: zod_1.z.object({
        easy: zod_1.z.number().min(0).max(100),
        medium: zod_1.z.number().min(0).max(100),
        hard: zod_1.z.number().min(0).max(100),
    }).refine(d => d.easy + d.medium + d.hard === 100, {
        message: "Difficulty distribution must sum to 100",
    }).default({ easy: 40, medium: 40, hard: 20 }),
});
