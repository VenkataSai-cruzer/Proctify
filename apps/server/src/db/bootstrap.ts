// ============================================================
// SecureAssess Server — SQLite schema bootstrap
//
// The desktop app ships the API server without the Prisma CLI, so schema
// creation cannot go through `prisma migrate deploy`. This module applies the
// exact DDL that Prisma generates for prisma/schema.prisma, using
// `CREATE TABLE/INDEX IF NOT EXISTS`, which makes startup idempotent:
//   • first boot  → every table is created
//   • later boots → no-op
//
// Keep in sync with prisma/schema.prisma. `ensureSchema()` is called once
// before the HTTP server starts listening.
// ============================================================

import { prisma } from "../utils/prismaClient";
import { logger } from "../utils/logger";

const DDL: string[] = [
  // ─── Teacher ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Teacher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "isLabHost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Teacher_email_key" ON "Teacher"("email")`,

  // ─── LabMachine ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "LabMachine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "systemNo" TEXT NOT NULL,
    "machineName" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "hardwareToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "row" INTEGER NOT NULL DEFAULT 0,
    "col" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LabMachine_systemNo_key" ON "LabMachine"("systemNo")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LabMachine_macAddress_key" ON "LabMachine"("macAddress")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LabMachine_hardwareToken_key" ON "LabMachine"("hardwareToken")`,

  // ─── Exam ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "passMarkPercent" REAL NOT NULL DEFAULT 50,
    "disqualifyThreshold" INTEGER NOT NULL DEFAULT 3,
    "strictSeatBinding" BOOLEAN NOT NULL DEFAULT true,
    "lockdownMode" TEXT NOT NULL DEFAULT 'KIOSK',
    "portablePackageHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "teacherId" TEXT NOT NULL,
    CONSTRAINT "Exam_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,

  // ─── MCQQuestion ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "MCQQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionText" TEXT NOT NULL,
    "optionsJson" TEXT NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL,
    "topicTag" TEXT NOT NULL DEFAULT '',
    "points" INTEGER NOT NULL DEFAULT 10,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT NOT NULL,
    CONSTRAINT "MCQQuestion_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,

  // ─── RosterEntry ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "RosterEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "registerNumber" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT NOT NULL,
    CONSTRAINT "RosterEntry_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "RosterEntry_examId_registerNumber_key" ON "RosterEntry"("examId", "registerNumber")`,

  // ─── SeatAllocation ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "SeatAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "systemNo" TEXT NOT NULL,
    CONSTRAINT "SeatAllocation_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SeatAllocation_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "RosterEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SeatAllocation_systemNo_fkey" FOREIGN KEY ("systemNo") REFERENCES "LabMachine" ("systemNo") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SeatAllocation_rosterId_key" ON "SeatAllocation"("rosterId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SeatAllocation_examId_systemNo_key" ON "SeatAllocation"("examId", "systemNo")`,

  // ─── CCTVCalibration ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "CCTVCalibration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cameraSource" TEXT NOT NULL,
    "frameWidth" INTEGER NOT NULL,
    "frameHeight" INTEGER NOT NULL,
    "zonesJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "examId" TEXT NOT NULL,
    CONSTRAINT "CCTVCalibration_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CCTVCalibration_examId_key" ON "CCTVCalibration"("examId")`,

  // ─── StudentSession ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "StudentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientMode" TEXT NOT NULL DEFAULT 'BROWSER',
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "currentDifficulty" TEXT NOT NULL DEFAULT 'EASY',
    "currentScore" INTEGER NOT NULL DEFAULT 0,
    "finalScore" INTEGER,
    "highestTierReached" TEXT NOT NULL DEFAULT 'EASY',
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "violationDeduction" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "submittedAt" DATETIME,
    "timeExtensionMinutes" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "examId" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "systemNo" TEXT NOT NULL,
    CONSTRAINT "StudentSession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentSession_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "RosterEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentSession_systemNo_fkey" FOREIGN KEY ("systemNo") REFERENCES "LabMachine" ("systemNo") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StudentSession_rosterId_key" ON "StudentSession"("rosterId")`,

  // ─── AnswerRecord ───────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "AnswerRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chosenIndex" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "timeSpentMs" INTEGER NOT NULL DEFAULT 0,
    "packetHmac" TEXT NOT NULL DEFAULT '',
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "difficulty" TEXT NOT NULL,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    CONSTRAINT "AnswerRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnswerRecord_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "MCQQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AnswerRecord_sessionId_questionId_key" ON "AnswerRecord"("sessionId", "questionId")`,

  // ─── ViolationEvent ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "ViolationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "systemNo" TEXT NOT NULL,
    "violationType" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CLIENT',
    "confidence" REAL NOT NULL DEFAULT 1.0,
    "snapshotBase64" TEXT,
    "metadataJson" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "forgiven" BOOLEAN NOT NULL DEFAULT false,
    "forgivenAt" DATETIME,
    "prevHash" TEXT NOT NULL DEFAULT '0000000000000000',
    "recordHash" TEXT NOT NULL DEFAULT '',
    "sessionId" TEXT NOT NULL,
    "forgivenById" TEXT,
    CONSTRAINT "ViolationEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ViolationEvent_forgivenById_fkey" FOREIGN KEY ("forgivenById") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,

  // ─── Certificate ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Certificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentName" TEXT NOT NULL,
    "registerNumber" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "examTitle" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "totalPossible" INTEGER NOT NULL,
    "percentile" REAL NOT NULL DEFAULT 0,
    "highestTierReached" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "verificationHash" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examDate" DATETIME NOT NULL,
    "examId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    CONSTRAINT "Certificate_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Certificate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudentSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Certificate_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "RosterEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_verificationHash_key" ON "Certificate"("verificationHash")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_sessionId_key" ON "Certificate"("sessionId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_rosterId_key" ON "Certificate"("rosterId")`,

  // ─── AppSetting ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
  )`,

  // ─── AllowedSubnet ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "AllowedSubnet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cidr" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AllowedSubnet_cidr_key" ON "AllowedSubnet"("cidr")`,
];

export const EXPECTED_TABLES = [
  "Teacher",
  "LabMachine",
  "Exam",
  "MCQQuestion",
  "RosterEntry",
  "SeatAllocation",
  "CCTVCalibration",
  "StudentSession",
  "AnswerRecord",
  "ViolationEvent",
  "Certificate",
  "AppSetting",
  "AllowedSubnet",
] as const;

let ready = false;

/**
 * Create any missing tables. Safe to call on every boot.
 * Throws if the database cannot be initialised — the caller must fail loudly
 * rather than serve a half-broken API.
 */
export async function ensureSchema(): Promise<void> {
  if (ready) return;

  for (const statement of DDL) {
    await prisma.$executeRawUnsafe(statement);
  }

  const tables = await countUserTables();
  const missing = EXPECTED_TABLES.filter((t) => !tables.names.includes(t));
  if (missing.length > 0) {
    throw new Error(`schema bootstrap incomplete — missing tables: ${missing.join(", ")}`);
  }

  ready = true;
  logger.info("SQLite schema ready", { tables: tables.count });
}

export async function countUserTables(): Promise<{ count: number; names: string[] }> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name`
  );
  const names = rows.map((r) => r.name);
  return { count: names.length, names };
}

/** Lightweight connectivity check used by GET /health. */
export async function checkDatabase(): Promise<{ ok: boolean; tables: number; error?: string }> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    const { count } = await countUserTables();
    return { ok: true, tables: count };
  } catch (err) {
    return { ok: false, tables: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
