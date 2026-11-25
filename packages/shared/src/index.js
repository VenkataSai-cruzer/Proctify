"use strict";
// ============================================================
// SecureAssess Shared — Explicit named re-exports
// (Explicit re-exports required for Rollup treeshaking)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH = exports.LIMITS = exports.CCTV = exports.ANTICHEAT = exports.ADAPTIVE = exports.MDNS_SERVICE = exports.PORTS = exports.EVENTS = exports.ROOMS = exports.SOCKET_NAMESPACES = exports.MCQGenerationRequestSchema = exports.ForgivenceSchema = exports.TimeExtensionSchema = exports.CCTVViolationSchema = exports.ClientViolationSchema = exports.SubmitAnswerSchema = exports.StudentLoginSchema = exports.CCTVCalibrationSchema = exports.CCTVZoneSchema = exports.Point2DSchema = exports.SeatAllocationSchema = exports.LabMachineSchema = exports.RosterUploadSchema = exports.RosterEntrySchema = exports.LLMGeneratedMCQArraySchema = exports.MCQQuestionSchema = exports.MCQOptionSchema = exports.UpdateExamSchema = exports.CreateExamSchema = exports.RegisterTeacherSchema = exports.LoginSchema = exports.ClientModeSchema = exports.ViolationTypeSchema = exports.SessionStatusSchema = exports.ExamStatusSchema = exports.DifficultySchema = void 0;
// ── schemas ───────────────────────────────────────────────────
var schemas_1 = require("./schemas");
Object.defineProperty(exports, "DifficultySchema", { enumerable: true, get: function () { return schemas_1.DifficultySchema; } });
Object.defineProperty(exports, "ExamStatusSchema", { enumerable: true, get: function () { return schemas_1.ExamStatusSchema; } });
Object.defineProperty(exports, "SessionStatusSchema", { enumerable: true, get: function () { return schemas_1.SessionStatusSchema; } });
Object.defineProperty(exports, "ViolationTypeSchema", { enumerable: true, get: function () { return schemas_1.ViolationTypeSchema; } });
Object.defineProperty(exports, "ClientModeSchema", { enumerable: true, get: function () { return schemas_1.ClientModeSchema; } });
Object.defineProperty(exports, "LoginSchema", { enumerable: true, get: function () { return schemas_1.LoginSchema; } });
Object.defineProperty(exports, "RegisterTeacherSchema", { enumerable: true, get: function () { return schemas_1.RegisterTeacherSchema; } });
Object.defineProperty(exports, "CreateExamSchema", { enumerable: true, get: function () { return schemas_1.CreateExamSchema; } });
Object.defineProperty(exports, "UpdateExamSchema", { enumerable: true, get: function () { return schemas_1.UpdateExamSchema; } });
Object.defineProperty(exports, "MCQOptionSchema", { enumerable: true, get: function () { return schemas_1.MCQOptionSchema; } });
Object.defineProperty(exports, "MCQQuestionSchema", { enumerable: true, get: function () { return schemas_1.MCQQuestionSchema; } });
Object.defineProperty(exports, "LLMGeneratedMCQArraySchema", { enumerable: true, get: function () { return schemas_1.LLMGeneratedMCQArraySchema; } });
Object.defineProperty(exports, "RosterEntrySchema", { enumerable: true, get: function () { return schemas_1.RosterEntrySchema; } });
Object.defineProperty(exports, "RosterUploadSchema", { enumerable: true, get: function () { return schemas_1.RosterUploadSchema; } });
Object.defineProperty(exports, "LabMachineSchema", { enumerable: true, get: function () { return schemas_1.LabMachineSchema; } });
Object.defineProperty(exports, "SeatAllocationSchema", { enumerable: true, get: function () { return schemas_1.SeatAllocationSchema; } });
Object.defineProperty(exports, "Point2DSchema", { enumerable: true, get: function () { return schemas_1.Point2DSchema; } });
Object.defineProperty(exports, "CCTVZoneSchema", { enumerable: true, get: function () { return schemas_1.CCTVZoneSchema; } });
Object.defineProperty(exports, "CCTVCalibrationSchema", { enumerable: true, get: function () { return schemas_1.CCTVCalibrationSchema; } });
Object.defineProperty(exports, "StudentLoginSchema", { enumerable: true, get: function () { return schemas_1.StudentLoginSchema; } });
Object.defineProperty(exports, "SubmitAnswerSchema", { enumerable: true, get: function () { return schemas_1.SubmitAnswerSchema; } });
Object.defineProperty(exports, "ClientViolationSchema", { enumerable: true, get: function () { return schemas_1.ClientViolationSchema; } });
Object.defineProperty(exports, "CCTVViolationSchema", { enumerable: true, get: function () { return schemas_1.CCTVViolationSchema; } });
Object.defineProperty(exports, "TimeExtensionSchema", { enumerable: true, get: function () { return schemas_1.TimeExtensionSchema; } });
Object.defineProperty(exports, "ForgivenceSchema", { enumerable: true, get: function () { return schemas_1.ForgivenceSchema; } });
Object.defineProperty(exports, "MCQGenerationRequestSchema", { enumerable: true, get: function () { return schemas_1.MCQGenerationRequestSchema; } });
var events_1 = require("./events");
Object.defineProperty(exports, "SOCKET_NAMESPACES", { enumerable: true, get: function () { return events_1.SOCKET_NAMESPACES; } });
Object.defineProperty(exports, "ROOMS", { enumerable: true, get: function () { return events_1.ROOMS; } });
Object.defineProperty(exports, "EVENTS", { enumerable: true, get: function () { return events_1.EVENTS; } });
// ── constants ─────────────────────────────────────────────────
var constants_1 = require("./constants");
Object.defineProperty(exports, "PORTS", { enumerable: true, get: function () { return constants_1.PORTS; } });
Object.defineProperty(exports, "MDNS_SERVICE", { enumerable: true, get: function () { return constants_1.MDNS_SERVICE; } });
Object.defineProperty(exports, "ADAPTIVE", { enumerable: true, get: function () { return constants_1.ADAPTIVE; } });
Object.defineProperty(exports, "ANTICHEAT", { enumerable: true, get: function () { return constants_1.ANTICHEAT; } });
Object.defineProperty(exports, "CCTV", { enumerable: true, get: function () { return constants_1.CCTV; } });
Object.defineProperty(exports, "LIMITS", { enumerable: true, get: function () { return constants_1.LIMITS; } });
Object.defineProperty(exports, "AUTH", { enumerable: true, get: function () { return constants_1.AUTH; } });
