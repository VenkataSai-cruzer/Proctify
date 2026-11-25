// ============================================================
// SecureAssess — Export Routes (Certificates, Reports, Marksheet)
// ============================================================
// Full PDF generation is implemented in services/exportService.ts
// These routes trigger generation jobs and serve the resulting files.
// ============================================================

import { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../utils/prismaClient";
import { requireTeacher, type AuthedRequest } from "../middleware/auth";
import { logger } from "../utils/logger";

export const exportRouter = Router();
exportRouter.use(requireTeacher);

const EXPORTS_DIR = path.join(process.cwd(), "exports");
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });

// POST /api/export/:examId/certificates  — generate & zip all certificates
exportRouter.post("/:examId/certificates", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  if (exam.status !== "COMPLETED") {
    res.status(409).json({ error: "Certificates can only be generated after exam completion" }); return;
  }

  // Lazy import to avoid startup cost
  const { generateCertificates } = await import("../services/exportService");
  try {
    const zipPath = await generateCertificates(req.params.examId);
    const token = path.basename(zipPath);
    res.json({ zipDownloadToken: token, url: `/exports/${token}` });
  } catch (err) {
    logger.error("Certificate generation failed", { error: (err as Error).message });
    res.status(500).json({ error: "Certificate generation failed" });
  }
});

// POST /api/export/:examId/marksheet  — generate marksheet CSV + PDF
exportRouter.post("/:examId/marksheet", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const { generateMarksheet } = await import("../services/exportService");
  try {
    const { pdfPath, csvPath } = await generateMarksheet(req.params.examId);
    res.json({
      pdf: `/exports/${path.basename(pdfPath)}`,
      csv: `/exports/${path.basename(csvPath)}`,
    });
  } catch (err) {
    logger.error("Marksheet generation failed", { error: (err as Error).message });
    res.status(500).json({ error: "Marksheet generation failed" });
  }
});

// POST /api/export/:examId/forensic  — generate forensic CCTV audit report
exportRouter.post("/:examId/forensic", async (req, res) => {
  const { teacherId } = req.teacher!;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.examId, teacherId } });
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const { generateForensicReport } = await import("../services/exportService");
  try {
    const pdfPath = await generateForensicReport(req.params.examId);
    res.json({ pdf: `/exports/${path.basename(pdfPath)}` });
  } catch (err) {
    logger.error("Forensic report generation failed", { error: (err as Error).message });
    res.status(500).json({ error: "Forensic report generation failed" });
  }
});

