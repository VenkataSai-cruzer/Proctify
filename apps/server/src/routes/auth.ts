// ============================================================
// SecureAssess — Auth Routes (Teacher login / register)
// ============================================================

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prismaClient";
import { LoginSchema, RegisterTeacherSchema } from "@secureassess/shared";
import { logger } from "../utils/logger";

export const authRouter = Router();

// POST /api/auth/register
authRouter.post("/register", async (req, res) => {
  const parsed = RegisterTeacherSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  const { name, email, password } = parsed.data;

  const existing = await prisma.teacher.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const teacher = await prisma.teacher.create({
    data: { name, email, passwordHash },
    select: { id: true, name: true, email: true, createdAt: true },
  });

  logger.info("Teacher registered", { teacherId: teacher.id, email });
  res.status(201).json({ teacher });
});

// POST /api/auth/login
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
  const token = jwt.sign(
    { teacherId: teacher.id, email: teacher.email, name: teacher.name },
    secret,
    { expiresIn: "12h" }
  );

  logger.info("Teacher logged in", { teacherId: teacher.id });
  res.json({
    token,
    teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
  });
});

// GET /api/auth/me
authRouter.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as { teacherId: string };
    const teacher = await prisma.teacher.findUnique({
      where: { id: payload.teacherId },
      select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true },
    });
    if (!teacher) { res.status(404).json({ error: "Teacher not found" }); return; }
    res.json({ teacher });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});
