// ============================================================
// SecureAssess Server — .saexam Portable Bundle Routes
// Export: signs exam + roster + questions into a single ZIP
// Import: validates signature, inserts into local DB atomically
// ============================================================

import { Router } from "express";
import archiver from "archiver";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "../utils/prismaClient";
import { requireTeacher } from "../middleware/auth";
import { logger } from "../utils/logger";

export const saexamRouter = Router();
saexamRouter.use(requireTeacher);

const EXPORTS_DIR = path.join(process.cwd(), "exports");
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });

// ── HMAC signature helper ─────────────────────────────────────
function signPayload(payload: string): string {
  const secret = process.env.JWT_SECRET ?? "secureassess-saexam-secret";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function verifyPayload(payload: string, sig: string): boolean {
  return signPayload(payload) === sig;
}

// ── POST /api/saexam/:examId/export  ─────────────────────────
saexamRouter.post("/:examId/export", async (req, res) => {
  const { examId } = req.params;

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const [questions, rosterEntries, allocations, calibration] = await Promise.all([
    prisma.mCQQuestion.findMany({ where: { examId }, orderBy: { orderIndex: "asc" } }),
    prisma.rosterEntry.findMany({ where: { examId } }),
    prisma.seatAllocation.findMany({ where: { examId }, include: { roster: true } }),
    prisma.cCTVCalibration.findUnique({ where: { examId } }),
  ]);

  // Build manifest
  const manifest = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      durationMinutes: exam.durationMinutes,
      passMarkPercent: exam.passMarkPercent,
      disqualifyThreshold: exam.disqualifyThreshold,
      strictSeatBinding: exam.strictSeatBinding,
      lockdownMode: exam.lockdownMode,
      status: "PUBLISHED", // reset to PUBLISHED on import
    },
    stats: {
      questions: questions.length,
      students: rosterEntries.length,
      allocations: allocations.length,
    },
  };

  const manifestStr = JSON.stringify(manifest, null, 2);
  const signature   = signPayload(manifestStr);

  // Zip everything
  const filename = `exam-${examId.slice(0, 8)}-${Date.now()}.saexam`;
  const outPath  = path.join(EXPORTS_DIR, filename);
  const output   = fs.createWriteStream(outPath);
  const archive  = archiver("zip", { zlib: { level: 9 } });

  await new Promise<void>((resolve, reject) => {
    archive.pipe(output);
    output.on("close", resolve);
    archive.on("error", reject);

    archive.append(manifestStr, { name: "manifest.json" });
    archive.append(signature,   { name: "manifest.sig" });
    archive.append(JSON.stringify(questions, null, 2), { name: "questions.json" });
    archive.append(JSON.stringify(rosterEntries, null, 2), { name: "roster.json" });
    archive.append(JSON.stringify(allocations, null, 2),   { name: "allocations.json" });
    if (calibration) {
      archive.append(JSON.stringify(calibration, null, 2), { name: "cctv-calibration.json" });
    }
    archive.finalize();
  });

  // Store bundle hash on exam
  const bundleHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(outPath))
    .digest("hex");
  await prisma.exam.update({ where: { id: examId }, data: { portablePackageHash: bundleHash } });

  logger.info(".saexam bundle exported", { examId, filename, bundleHash });
  res.json({ filename, url: `/exports/${filename}`, bundleHash });
});

// ── POST /api/saexam/import  ─────────────────────────────────
import multer from "multer";
import JSZip from "jszip";
import { type RequestHandler } from "express";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

saexamRouter.post("/import", upload.single("bundle") as unknown as RequestHandler, async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No .saexam file uploaded" }); return; }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(req.file.buffer);
  } catch {
    res.status(400).json({ error: "Invalid .saexam file — not a valid ZIP" }); return;
  }

  // Read & verify signature
  const manifestFile = zip.file("manifest.json");
  const sigFile      = zip.file("manifest.sig");
  if (!manifestFile || !sigFile) {
    res.status(400).json({ error: "Missing manifest.json or manifest.sig in bundle" }); return;
  }

  const manifestStr = await manifestFile.async("string");
  const sig         = await sigFile.async("string");

  if (!verifyPayload(manifestStr, sig.trim())) {
    res.status(400).json({ error: "Bundle signature verification failed — file may be tampered" }); return;
  }

  const manifest = JSON.parse(manifestStr);
  const { exam: examData, version } = manifest;

  if (version !== "1.0") {
    res.status(400).json({ error: `Unsupported bundle version: ${version}` }); return;
  }

  // Load JSON payloads
  const questionsStr    = await zip.file("questions.json")?.async("string") ?? "[]";
  const rosterStr       = await zip.file("roster.json")?.async("string")    ?? "[]";
  const allocationsStr  = await zip.file("allocations.json")?.async("string") ?? "[]";
  const calibrationStr  = await zip.file("cctv-calibration.json")?.async("string");

  const questions   = JSON.parse(questionsStr);
  const roster      = JSON.parse(rosterStr);
  const calibration = calibrationStr ? JSON.parse(calibrationStr) : null;

  const teacherId = req.teacher!.teacherId;

  // Atomic upsert
  const bundleHash = crypto
    .createHash("sha256").update(req.file.buffer).digest("hex");

  await prisma.$transaction(async (tx: typeof prisma) => {
    // Upsert exam
    const importedExam = await tx.exam.upsert({
      where: { id: examData.id },
      update: {
        title: examData.title, subject: examData.subject,
        durationMinutes: examData.durationMinutes,
        passMarkPercent: examData.passMarkPercent,
        disqualifyThreshold: examData.disqualifyThreshold,
        strictSeatBinding: examData.strictSeatBinding,
        lockdownMode: examData.lockdownMode ?? "KIOSK",
        status: "PUBLISHED",
        portablePackageHash: bundleHash,
      },
      create: {
        id: examData.id, title: examData.title, subject: examData.subject,
        durationMinutes: examData.durationMinutes,
        passMarkPercent: examData.passMarkPercent,
        disqualifyThreshold: examData.disqualifyThreshold,
        strictSeatBinding: examData.strictSeatBinding,
        lockdownMode: examData.lockdownMode ?? "KIOSK",
        status: "PUBLISHED",
        teacherId,
        portablePackageHash: bundleHash,
      },
    });

    // Upsert questions
    for (const q of questions) {
      await tx.mCQQuestion.upsert({
        where: { id: q.id },
        update: { questionText: q.questionText, optionsJson: q.optionsJson, correctIndex: q.correctIndex, difficulty: q.difficulty, topicTag: q.topicTag, points: q.points, orderIndex: q.orderIndex },
        create: { id: q.id, examId: importedExam.id, questionText: q.questionText, optionsJson: q.optionsJson, correctIndex: q.correctIndex, difficulty: q.difficulty, topicTag: q.topicTag ?? "", points: q.points, orderIndex: q.orderIndex },
      });
    }

    // Upsert roster entries
    for (const r of roster) {
      await tx.rosterEntry.upsert({
        where: { examId_registerNumber: { examId: importedExam.id, registerNumber: r.registerNumber } },
        update: { fullName: r.fullName, year: r.year },
        create: { id: r.id, examId: importedExam.id, fullName: r.fullName, registerNumber: r.registerNumber, year: r.year },
      });
    }

    // Upsert CCTV calibration
    if (calibration) {
      await tx.cCTVCalibration.upsert({
        where: { examId: importedExam.id },
        update: { cameraSource: calibration.cameraSource, frameWidth: calibration.frameWidth, frameHeight: calibration.frameHeight, zonesJson: calibration.zonesJson },
        create: { examId: importedExam.id, cameraSource: calibration.cameraSource, frameWidth: calibration.frameWidth, frameHeight: calibration.frameHeight, zonesJson: calibration.zonesJson },
      });
    }

    return importedExam;
  });

  logger.info(".saexam bundle imported", { examId: examData.id, bundleHash });
  res.json({ imported: true, examId: examData.id, questionsImported: questions.length, studentsImported: roster.length });
});
