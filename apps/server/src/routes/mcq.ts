// ============================================================
// SecureAssess — MCQ Management Routes
// ============================================================

import { Router, type RequestHandler } from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import { prisma } from "../utils/prismaClient";
import { requireTeacher, type AuthedRequest } from "../middleware/auth";
import { MCQQuestionSchema } from "@secureassess/shared";
import { z } from "zod";

export const mcqRouter = Router();
mcqRouter.use(requireTeacher);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// GET /api/mcq/:examId  — list all questions for exam
mcqRouter.get("/:examId", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const questions = await prisma.mCQQuestion.findMany({
    where: { examId: req.params.examId },
    orderBy: { orderIndex: "asc" },
  });
  res.json({ questions });
});

// POST /api/mcq/:examId/manual  — manually add a single question
mcqRouter.post("/:examId/manual", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const parsed = MCQQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  const { questionText, options, correctIndex, difficulty, topicTag } = parsed.data;
  const pointsMap = { EASY: 10, MEDIUM: 20, HARD: 30 };

  const count = await prisma.mCQQuestion.count({ where: { examId: req.params.examId } });
  const question = await prisma.mCQQuestion.create({
    data: {
      examId: req.params.examId,
      questionText,
      optionsJson: JSON.stringify(options),
      correctIndex,
      difficulty,
      topicTag,
      points: pointsMap[difficulty],
      orderIndex: count,
    },
  });
  res.status(201).json({ question });
});

// PATCH /api/mcq/:examId/:questionId  — edit a question
mcqRouter.patch("/:examId/:questionId", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const parsed = MCQQuestionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  const { options, ...rest } = parsed.data;
  const pointsMap: Record<string, number> = { EASY: 10, MEDIUM: 20, HARD: 30 };

  const updated = await prisma.mCQQuestion.update({
    where: { id: req.params.questionId },
    data: {
      ...rest,
      ...(options ? { optionsJson: JSON.stringify(options) } : {}),
      ...(rest.difficulty ? { points: pointsMap[rest.difficulty] ?? 10 } : {}),
    },
  });
  res.json({ question: updated });
});

// DELETE /api/mcq/:examId/:questionId
mcqRouter.delete("/:examId/:questionId", async (req, res) => {
  await prisma.mCQQuestion.delete({ where: { id: req.params.questionId } }).catch(() => null);
  res.json({ deleted: true });
});

// POST /api/mcq/:examId/extract-pdf  — extract text from PDF for MCQ gen
mcqRouter.post("/:examId/extract-pdf", upload.single("pdf") as unknown as RequestHandler, async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  if (!req.file) { res.status(400).json({ error: "No PDF uploaded" }); return; }

  try {
    const result = await pdfParse(req.file.buffer);
    res.json({
      text: result.text,
      pages: result.numpages,
      wordCount: result.text.split(/\s+/).length,
    });
  } catch (err: unknown) {
    res.status(400).json({ error: `PDF parse failed: ${(err as Error).message}` });
  }
});

// POST /api/mcq/:examId/bulk-import  — import AI-generated questions after review
mcqRouter.post("/:examId/bulk-import", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const schema = z.object({ questions: z.array(MCQQuestionSchema) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }

  const pointsMap: Record<string, number> = { EASY: 10, MEDIUM: 20, HARD: 30 };
  const startIndex = await prisma.mCQQuestion.count({ where: { examId: req.params.examId } });

  await prisma.mCQQuestion.createMany({
    data: parsed.data.questions.map((q, i) => ({
      examId: req.params.examId,
      questionText: q.questionText,
      optionsJson: JSON.stringify(q.options),
      correctIndex: q.correctIndex,
      difficulty: q.difficulty,
      topicTag: q.topicTag,
      points: pointsMap[q.difficulty] ?? 10,
      orderIndex: startIndex + i,
    })),
  });

  const total = await prisma.mCQQuestion.count({ where: { examId: req.params.examId } });
  res.status(201).json({ imported: parsed.data.questions.length, totalQuestions: total });
});

