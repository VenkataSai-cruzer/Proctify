// ============================================================
// SecureAssess — Exam CRUD Routes
// ============================================================

import { Router } from "express";
import { prisma } from "../utils/prismaClient";
import { requireTeacher, type AuthedRequest } from "../middleware/auth";
import { CreateExamSchema, UpdateExamSchema } from "@secureassess/shared";
import type { Request } from "express";

export const examRouter = Router();
examRouter.use(requireTeacher);

// GET /api/exam  — list all exams for this teacher
examRouter.get("/", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exams = await prisma.exam.findMany({
    where: { teacherId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { questions: true, rosterEntries: true, sessions: true } } },
  });
  res.json({ exams });
});

// POST /api/exam  — create new exam
examRouter.post("/", async (req, res) => {
  const { teacherId } = req.teacher!;
  const parsed = CreateExamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  const exam = await prisma.exam.create({
    data: { ...parsed.data, teacherId },
  });
  res.status(201).json({ exam });
});

// GET /api/exam/:id
examRouter.get("/:id", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({
    where: { id: req.params.id, teacherId },
    include: {
      questions: { orderBy: { orderIndex: "asc" } },
      _count: { select: { rosterEntries: true, sessions: true } },
    },
  });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  res.json({ exam });
});

// PATCH /api/exam/:id
examRouter.patch("/:id", async (req, res) => {
  const { teacherId } = req.teacher!;
  const parsed = UpdateExamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  const exam = await prisma.exam.findFirst({ where: { id: req.params.id, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  if (exam.status === "ACTIVE") {
    res.status(409).json({ error: "Cannot edit an active exam" });
    return;
  }
  const updated = await prisma.exam.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json({ exam: updated });
});

// DELETE /api/exam/:id
examRouter.delete("/:id", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.id, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  if (exam.status === "ACTIVE") {
    res.status(409).json({ error: "Cannot delete an active exam" });
    return;
  }
  await prisma.exam.delete({ where: { id: req.params.id } });
  res.json({ deleted: true });
});

// PATCH /api/exam/:id/status
examRouter.patch("/:id/status", async (req, res) => {
  const { teacherId } = req.teacher!;
  const { status } = req.body as { status: string };
  const validStatuses = ["DRAFT", "PUBLISHED", "ACTIVE", "PAUSED", "COMPLETED"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  const exam = await prisma.exam.findFirst({ where: { id: req.params.id, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  const updated = await prisma.exam.update({
    where: { id: req.params.id },
    data: { status },
  });
  res.json({ exam: updated });
});

