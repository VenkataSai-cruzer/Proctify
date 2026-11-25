// ============================================================
// SecureAssess — Student REST Routes (behind lab firewall)
// ============================================================

import { Router } from "express";
import { prisma } from "../utils/prismaClient";

export const studentRouter = Router();

// GET /api/student/exam/:examId/lobby  — Get exam lobby info
studentRouter.get("/exam/:examId/lobby", async (req, res) => {
  const exam = await prisma.exam.findUnique({
    where: { id: req.params.examId },
    select: {
      id: true,
      title: true,
      subject: true,
      durationMinutes: true,
      status: true,
      strictSeatBinding: true,
    },
  });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  if (!["PUBLISHED", "ACTIVE"].includes(exam.status)) {
    res.status(403).json({ error: "Exam is not currently open" }); return;
  }
  res.json({ exam });
});
