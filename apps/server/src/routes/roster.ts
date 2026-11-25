// ============================================================
// SecureAssess — Roster Upload & Seating Allocation Routes
// ============================================================

import { Router, type RequestHandler } from "express";
import multer from "multer";
import { prisma } from "../utils/prismaClient";
import { requireTeacher, type AuthedRequest } from "../middleware/auth";
import { RosterUploadSchema } from "@secureassess/shared";
import { parseRosterFile } from "../services/rosterParser";
import { generateSeatAllocations } from "../services/seatingEngine";

export const rosterRouter = Router();
rosterRouter.use(requireTeacher);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"];
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith(".csv") || file.originalname.endsWith(".xlsx"));
  },
});

// POST /api/roster/:examId/upload  — Upload CSV/XLSX/PDF roster
rosterRouter.post("/:examId/upload", upload.single("roster") as unknown as RequestHandler, async (req, res) => {
  const { teacherId } = req.teacher!;
  const { examId } = req.params;

  const exam = await prisma.exam.findFirst({ where: { id: examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" }); return;
  }

  let entries: Array<{ fullName: string; registerNumber: string; year: string }>;
  try {
    entries = await parseRosterFile(req.file.buffer, req.file.originalname);
  } catch (err: unknown) {
    res.status(400).json({ error: `Failed to parse roster: ${(err as Error).message}` });
    return;
  }

  const parsed = RosterUploadSchema.safeParse(entries);
  if (!parsed.success) {
    res.status(400).json({ error: "Roster validation failed", issues: parsed.error.issues });
    return;
  }

  // Clear existing roster for this exam
  await prisma.rosterEntry.deleteMany({ where: { examId } });

  // Insert new entries
  await prisma.rosterEntry.createMany({
    data: parsed.data.map((e) => ({ ...e, examId })),
  });

  const roster = await prisma.rosterEntry.findMany({ where: { examId } });
  res.status(201).json({ roster, count: roster.length });
});

// GET /api/roster/:examId  — Get roster
rosterRouter.get("/:examId", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  const roster = await prisma.rosterEntry.findMany({
    where: { examId: req.params.examId },
    include: { seatAllocation: true },
  });
  res.json({ roster });
});

// POST /api/roster/:examId/allocate  — Run anti-adjacency seating shuffle
rosterRouter.post("/:examId/allocate", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const roster = await prisma.rosterEntry.findMany({ where: { examId: req.params.examId } });
  const machines = await prisma.labMachine.findMany({ where: { isActive: true }, orderBy: { systemNo: "asc" } });

  if (roster.length === 0) {
    res.status(400).json({ error: "No roster entries. Upload a roster first." }); return;
  }
  if (machines.length < roster.length) {
    res.status(400).json({
      error: `Not enough active machines (${machines.length}) for roster size (${roster.length})`,
    }); return;
  }

  const allocations = generateSeatAllocations(roster, machines);

  // Clear old allocations
  await prisma.seatAllocation.deleteMany({ where: { examId: req.params.examId } });

  // Insert new
  await prisma.seatAllocation.createMany({
    data: allocations.map((a) => ({
      examId: req.params.examId,
      rosterId: a.rosterId,
      systemNo: a.systemNo,
    })),
  });

  const result = await prisma.seatAllocation.findMany({
    where: { examId: req.params.examId },
    include: { roster: true, machine: true },
  });

  res.json({ allocations: result });
});

// GET /api/roster/:examId/allocations
rosterRouter.get("/:examId/allocations", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  const allocations = await prisma.seatAllocation.findMany({
    where: { examId: req.params.examId },
    include: { roster: true, machine: true },
  });
  res.json({ allocations });
});

