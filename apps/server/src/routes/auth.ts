// ============================================================
// SecureAssess — Auth Routes (Teacher login / register)
// ============================================================
//
// SECURITY MODEL:
//
//   First-run bootstrap (Teacher table is EMPTY):
//     - Any registration is allowed — that teacher becomes Lab Host
//       with isLabHost=true and sets the faculty registration PIN.
//     - The PIN is stored as a bcrypt hash in AppSetting{ key: 'facultyPin' }.
//     - After the Lab Host is created, all subsequent registrations
//       require the correct PIN to prove faculty status.
//
//   Subsequent registrations:
//     - Must supply the correct Faculty Registration PIN in the request.
//     - PIN can also be set via FACULTY_REGISTRATION_PIN env var as fallback
//       (useful in automated deployment / db:seed flows).
//
//   This prevents a student sitting at an unattended lab PC from creating
//   a Teacher account and accessing exam answers or certificates.
//
// ============================================================

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prismaClient";
import { LoginSchema, RegisterTeacherSchema } from "@secureassess/shared";
import { logger } from "../utils/logger";

export const authRouter = Router();

// ── Helpers ───────────────────────────────────────────────────

/** Retrieve the stored faculty PIN hash from AppSetting, or null if not set. */
async function getStoredPinHash(): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key: "facultyPin" } });
  return setting?.value ?? null;
}

/** True when no teachers exist yet — first-run bootstrap mode. */
async function isFirstRun(): Promise<boolean> {
  const count = await prisma.teacher.count();
  return count === 0;
}

/**
 * Validate the supplied registration PIN against:
 * 1. The hashed PIN stored in AppSetting (set by Lab Host at first registration).
 * 2. The FACULTY_REGISTRATION_PIN env var (plain-text fallback for automated setup).
 */
async function validateRegistrationPin(suppliedPin: string): Promise<boolean> {
  // Env-var bypass (never expose this in the UI — only for seeding/CI)
  const envPin = process.env.FACULTY_REGISTRATION_PIN;
  if (envPin && envPin === suppliedPin) return true;

  // DB-stored hash (set by the Lab Host on first registration)
  const hash = await getStoredPinHash();
  if (!hash) {
    // No PIN configured yet AND no env var — registration is locked.
    // This shouldn't happen after first-run, but fail-closed.
    return false;
  }
  return bcrypt.compare(suppliedPin, hash);
}

// ── GET /api/auth/setup-status ────────────────────────────────
// Called by the client on the Login page to decide whether to show
// the "Create Account" button and whether a PIN is required.

authRouter.get("/setup-status", async (_req, res) => {
  const firstRun       = await isFirstRun();
  const pinHash        = await getStoredPinHash();
  const pinRequired    = !firstRun && (!!pinHash || !!process.env.FACULTY_REGISTRATION_PIN);
  const teacherCount   = await prisma.teacher.count();

  res.json({
    firstRun,            // true  → show "Become Lab Host" UI
    pinRequired,         // true  → show PIN field on registration form
    teacherCount,
    labName: process.env.LAB_NAME ?? "SecureAssess Lab",
    version: "1.0.0",
  });
});

// ── POST /api/auth/register ───────────────────────────────────

authRouter.post("/register", async (req, res) => {
  const parsed = RegisterTeacherSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  const { name, email, password } = parsed.data;
  const { registrationPin, newPin } = req.body as { registrationPin?: string; newPin?: string };

  const firstRun = await isFirstRun();

  if (firstRun) {
    // ── First-run: Lab Host bootstrapping ─────────────────────
    // The first teacher to register becomes Lab Host and sets the PIN.
    if (!newPin || newPin.trim().length < 4) {
      res.status(400).json({
        error: "First-run setup requires a Faculty Registration PIN (min 4 chars). " +
               "This PIN will be required for all future teacher registrations.",
        code: "PIN_REQUIRED_FOR_FIRST_RUN",
      });
      return;
    }

    const existing = await prisma.teacher.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const pinHash      = await bcrypt.hash(newPin.trim(), 10);

    // Store PIN hash in AppSettings
    await prisma.appSetting.upsert({
      where: { key: "facultyPin" },
      update: { value: pinHash },
      create: { key: "facultyPin", value: pinHash },
    });

    const teacher = await prisma.teacher.create({
      data: { name, email, passwordHash, isLabHost: true },
      select: { id: true, name: true, email: true, isLabHost: true, createdAt: true },
    });

    logger.info("Lab Host registered (first-run)", { teacherId: teacher.id, email });
    res.status(201).json({
      teacher,
      message: "You are the Lab Host. Your Faculty Registration PIN has been set. " +
               "All future teacher accounts require this PIN.",
    });
    return;
  }

  // ── Subsequent registration: PIN required ─────────────────
  if (!registrationPin || registrationPin.trim().length === 0) {
    res.status(403).json({
      error: "Faculty Registration PIN is required. Contact your Lab Host.",
      code: "PIN_REQUIRED",
    });
    return;
  }

  const pinValid = await validateRegistrationPin(registrationPin.trim());
  if (!pinValid) {
    logger.warn("Teacher registration blocked: wrong PIN", { email });
    res.status(403).json({
      error: "Invalid Faculty Registration PIN.",
      code: "WRONG_PIN",
    });
    return;
  }

  const existing = await prisma.teacher.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const teacher = await prisma.teacher.create({
    data: { name, email, passwordHash, isLabHost: false },
    select: { id: true, name: true, email: true, isLabHost: true, createdAt: true },
  });

  logger.info("Teacher registered", { teacherId: teacher.id, email });
  res.status(201).json({ teacher });
});

// ── POST /api/auth/login ──────────────────────────────────────

authRouter.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  const { email, password } = parsed.data;

  const teacher = await prisma.teacher.findUnique({ where: { email } });
  if (!teacher) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, teacher.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const secret = process.env.JWT_SECRET!;
  const token  = jwt.sign(
    { teacherId: teacher.id, email: teacher.email, name: teacher.name, isLabHost: teacher.isLabHost },
    secret,
    { expiresIn: "12h" }
  );

  logger.info("Teacher logged in", { teacherId: teacher.id, isLabHost: teacher.isLabHost });
  res.json({
    token,
    teacher: { id: teacher.id, name: teacher.name, email: teacher.email, isLabHost: teacher.isLabHost },
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────

authRouter.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as { teacherId: string };
    const teacher = await prisma.teacher.findUnique({
      where: { id: payload.teacherId },
      select: { id: true, name: true, email: true, avatarUrl: true, isLabHost: true, createdAt: true },
    });
    if (!teacher) { res.status(404).json({ error: "Teacher not found" }); return; }
    res.json({ teacher });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

// ── POST /api/auth/change-pin ─────────────────────────────────
// Lab Host can change the faculty registration PIN.

import { requireTeacher } from "../middleware/auth";

authRouter.post("/change-pin", requireTeacher, async (req, res) => {
  const { currentPin, newPin } = req.body as { currentPin?: string; newPin?: string };
  const teacherId = req.teacher!.teacherId;

  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher?.isLabHost) {
    res.status(403).json({ error: "Only the Lab Host can change the faculty registration PIN." });
    return;
  }
  if (!currentPin || !newPin || newPin.trim().length < 4) {
    res.status(400).json({ error: "Current PIN and new PIN (min 4 chars) are required." });
    return;
  }

  const currentValid = await validateRegistrationPin(currentPin.trim());
  if (!currentValid) {
    res.status(403).json({ error: "Current PIN is incorrect." });
    return;
  }

  const newPinHash = await bcrypt.hash(newPin.trim(), 10);
  await prisma.appSetting.upsert({
    where: { key: "facultyPin" },
    update: { value: newPinHash },
    create: { key: "facultyPin", value: newPinHash },
  });

  logger.info("Faculty registration PIN changed", { teacherId });
  res.json({ success: true, message: "Faculty registration PIN updated." });
});
