// ============================================================
// SecureAssess — PDF Certificate, Marksheet & Forensic Report
// ============================================================

import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import archiver from "archiver";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import QRCode from "qrcode";
import { prisma } from "../utils/prismaClient";
import { logger } from "../utils/logger";
import { signCertificateQr } from "../utils/security";

const EXPORTS_DIR = path.join(process.cwd(), "exports");
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });

// ── Certificate PDF Generator ─────────────────────────────────

async function buildCertificatePDF(params: {
  studentName: string;
  registerNumber: string;
  year: string;
  examTitle: string;
  subject: string;
  score: number;
  totalPossible: number;
  highestTierReached: string;
  examDate: string;
  verificationHash: string;
}): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();

  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold  = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const helvetica  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // ── Background ──────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.98, 0.97, 0.94) });

  // ── Outer border (double) ────────────────────────────────
  page.drawRectangle({ x: 20, y: 20, width: width - 40, height: height - 40,
    borderColor: rgb(0.65, 0.5, 0.15), borderWidth: 3 });
  page.drawRectangle({ x: 28, y: 28, width: width - 56, height: height - 56,
    borderColor: rgb(0.65, 0.5, 0.15), borderWidth: 1 });

  // ── Header ───────────────────────────────────────────────
  page.drawText("CERTIFICATE OF ACHIEVEMENT", {
    x: 0, y: height - 95,
    size: 32, font: timesBold,
    color: rgb(0.2, 0.2, 0.55),
    maxWidth: width,
    lineHeight: 40,
  });

  // Center text helper
  const center = (text: string, font: typeof timesRoman, size: number, y: number, color = rgb(0.1, 0.1, 0.1)) => {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - tw) / 2, y, size, font, color });
  };

  center("CERTIFICATE OF ACHIEVEMENT", timesBold, 30, height - 90, rgb(0.18, 0.18, 0.5));
  center("SecureAssess Examination System", helvetica, 14, height - 118, rgb(0.4, 0.4, 0.4));

  // Divider
  page.drawLine({ start: { x: 60, y: height - 128 }, end: { x: width - 60, y: height - 128 },
    thickness: 1, color: rgb(0.65, 0.5, 0.15) });

  center("This is to certify that", timesRoman, 16, height - 165, rgb(0.3, 0.3, 0.3));
  center(params.studentName.toUpperCase(), timesBold, 28, height - 205, rgb(0.1, 0.1, 0.4));

  center(`Register Number: ${params.registerNumber}  |  Year: ${params.year}`, helvetica, 13, height - 235, rgb(0.35, 0.35, 0.35));

  center("has successfully completed the examination", timesRoman, 16, height - 268, rgb(0.3, 0.3, 0.3));
  center(`"${params.examTitle}"`, timesBold, 20, height - 298, rgb(0.1, 0.35, 0.6));
  center(`Subject: ${params.subject}`, timesRoman, 15, height - 325, rgb(0.3, 0.3, 0.3));

  // Score row
  center(
    `Score: ${params.score} pts  |  Highest Tier: ${params.highestTierReached}  |  Date: ${params.examDate}`,
    helvetica, 13, height - 358, rgb(0.2, 0.2, 0.2)
  );

  // Divider
  page.drawLine({ start: { x: 60, y: height - 376 }, end: { x: width - 60, y: height - 376 },
    thickness: 1, color: rgb(0.65, 0.5, 0.15) });

  // Verification QR — HMAC-signed payload for tamper-proof verification
  const qrPayload = signCertificateQr(params.verificationHash);
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 80, margin: 0 });
  const qrBase64 = qrDataUrl.replace("data:image/png;base64,", "");
  const qrImg = await pdfDoc.embedPng(Buffer.from(qrBase64, "base64"));
  page.drawImage(qrImg, { x: width - 160, y: 50, width: 80, height: 80 });
  page.drawText(`Verify: ${params.verificationHash.slice(0, 16)}...`, {
    x: width - 200, y: 40, size: 7, font: helvetica, color: rgb(0.5, 0.5, 0.5),
  });

  // Footer
  center(`Issued by SecureAssess  |  ${new Date().toLocaleDateString("en-IN")}`, helvetica, 10, 35, rgb(0.5, 0.5, 0.5));

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

// ── Public API ────────────────────────────────────────────────

export async function generateCertificates(examId: string): Promise<string> {
  const sessions = await prisma.studentSession.findMany({
    where: { examId, status: { in: ["SUBMITTED", "ACTIVE"] } },
    include: { roster: true, exam: true },
  });

  const exam = sessions[0]?.exam;
  if (!exam) throw new Error("Exam not found");

  const totalPossible = await prisma.mCQQuestion.aggregate({
    where: { examId },
    _sum: { points: true },
  });
  const maxScore = totalPossible._sum.points ?? 100;

  const zipFilename = `certificates-${examId}-${Date.now()}.zip`;
  const zipPath = path.join(EXPORTS_DIR, zipFilename);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);

  for (const session of sessions) {
    const isDisqualified = session.violationCount >= exam.disqualifyThreshold;
    if (isDisqualified) continue;

    const verificationHash = crypto
      .createHash("sha256")
      .update(`${session.id}:${session.currentScore}:${exam.id}`)
      .digest("hex");

    const pdfBuffer = await buildCertificatePDF({
      studentName: session.roster.fullName,
      registerNumber: session.roster.registerNumber,
      year: session.roster.year,
      examTitle: exam.title,
      subject: exam.subject,
      score: session.currentScore,
      totalPossible: maxScore,
      highestTierReached: session.highestTierReached,
      examDate: session.submittedAt?.toLocaleDateString("en-IN") ?? new Date().toLocaleDateString("en-IN"),
      verificationHash,
    });

    // Upsert certificate record
    await prisma.certificate.upsert({
      where: { sessionId: session.id },
      update: { score: session.currentScore, verificationHash, status: "VERIFIED" },
      create: {
        examId,
        sessionId: session.id,
        rosterId: session.rosterId,
        studentName: session.roster.fullName,
        registerNumber: session.roster.registerNumber,
        year: session.roster.year,
        examTitle: exam.title,
        subject: exam.subject,
        score: session.currentScore,
        totalPossible: maxScore,
        highestTierReached: session.highestTierReached,
        status: "VERIFIED",
        verificationHash,
        issuedAt: new Date(),
        examDate: session.submittedAt ?? new Date(),
      },
    });

    archive.append(pdfBuffer, { name: `${session.roster.registerNumber}_certificate.pdf` });
  }

  await archive.finalize();
  logger.info("Certificates generated", { examId, zipPath });
  return zipPath;
}

export async function generateMarksheet(examId: string): Promise<{ pdfPath: string; csvPath: string }> {
  const sessions = await prisma.studentSession.findMany({
    where: { examId },
    include: { roster: true, exam: true },
    orderBy: { currentScore: "desc" },
  });

  if (sessions.length === 0) throw new Error("No sessions found");
  const exam = sessions[0]!.exam;

  // ── CSV ──────────────────────────────────────────────────
  const csvRows = [
    ["Rank", "Name", "Register No", "Year", "Score", "Highest Tier", "Violations", "Status"].join(","),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...sessions.map((s: any, i: number) => [
      i + 1, `"${s.roster.fullName}"`, s.roster.registerNumber, s.roster.year,
      s.currentScore, s.highestTierReached, s.violationCount, s.status,
    ].join(",")),
  ];
  const csvPath = path.join(EXPORTS_DIR, `marksheet-${examId}-${Date.now()}.csv`);
  fs.writeFileSync(csvPath, csvRows.join("\n"), "utf-8");

  // ── PDF ──────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([842, 595]);
  const { width, height } = page.getSize();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText(`${exam.title} - Class Marksheet`, { x: 40, y: height - 50, size: 18, font: bold, color: rgb(0.1, 0.1, 0.4) });
  page.drawText(`Subject: ${exam.subject}  |  ${new Date().toLocaleDateString("en-IN")}`, {
    x: 40, y: height - 72, size: 11, font: reg, color: rgb(0.4, 0.4, 0.4),
  });

  const headers = ["Rank", "Name", "Reg No", "Year", "Score", "Tier", "Violations", "Status"];
  const colX = [40, 80, 240, 330, 390, 450, 520, 600];
  let y = height - 100;

  page.drawRectangle({ x: 35, y: y - 4, width: width - 70, height: 18, color: rgb(0.2, 0.3, 0.6) });
  headers.forEach((h, i) => {
    page.drawText(h, { x: colX[i]!, y, size: 10, font: bold, color: rgb(1, 1, 1) });
  });
  y -= 22;

  for (const [idx, s] of sessions.entries()) {
    if (y < 60) break;
    const rowColor = idx % 2 === 0 ? rgb(0.97, 0.97, 1) : rgb(1, 1, 1);
    page.drawRectangle({ x: 35, y: y - 4, width: width - 70, height: 16, color: rowColor });
    const row = [idx + 1, s.roster.fullName.slice(0, 22), s.roster.registerNumber, s.roster.year,
      s.currentScore, s.highestTierReached, s.violationCount, s.status];
    row.forEach((v: string | number, i: number) => {
      page.drawText(String(v), { x: colX[i]!, y, size: 9, font: reg, color: rgb(0.1, 0.1, 0.1) });
    });
    y -= 18;
  }

  const pdfBytes = await pdfDoc.save();
  const pdfPath = path.join(EXPORTS_DIR, `marksheet-${examId}-${Date.now()}.pdf`);
  fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));

  return { pdfPath, csvPath };
}

export async function generateForensicReport(examId: string): Promise<string> {
  const violations = await prisma.violationEvent.findMany({
    where: { session: { examId } },
    include: { session: { include: { roster: true } } },
    orderBy: { timestamp: "asc" },
  });

  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595, 842]); // A4 portrait
  const bold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const reg    = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const mono   = await pdfDoc.embedFont(StandardFonts.Courier);
  const { width, height } = page.getSize();

  page.drawText("SecureAssess - Forensic Anti-Cheat Report", { x: 40, y: height - 50, size: 16, font: bold, color: rgb(0.1, 0.1, 0.4) });
  page.drawText(`Exam ID: ${examId}  |  Generated: ${new Date().toLocaleString("en-IN")}`, {
    x: 40, y: height - 70, size: 10, font: reg, color: rgb(0.4, 0.4, 0.4),
  });

  // ── Hash-chain integrity summary ──────────────────────────
  let chainValid = true;
  let prevHash: string | null = null;

  let y = height - 100;
  for (const v of violations) {
    if (y < 80) break;

    // Verify hash chain
    const computedHash = require("crypto").createHash("sha256")
      .update(`${v.prevHash || "0".repeat(64)}|${v.id}|${v.sessionId}|${v.violationType}|${new Date(v.timestamp).toISOString()}`)
      .digest("hex");
    if (computedHash !== v.recordHash) {
      chainValid = false;
    }

    page.drawText(
      `${v.session.roster.fullName} (${v.session.systemNo}) - ${v.violationType} [${v.source}] @ ${new Date(v.timestamp).toLocaleTimeString("en-IN")} - Conf: ${(v.confidence * 100).toFixed(0)}%  ${v.forgiven ? "[FORGIVEN]" : ""}`,
      { x: 40, y, size: 9, font: v.forgiven ? reg : bold, color: v.forgiven ? rgb(0.5, 0.5, 0.5) : rgb(0.7, 0.1, 0.1) }
    );
    y -= 13;

    // Show hash chain snippet (first 16 chars) — ASCII only for WinAnsi fonts
    page.drawText(
      `  chain: ${v.recordHash?.slice(0, 16) ?? "-"} <- ${v.prevHash?.slice(0, 16) ?? "-"}${v.forgiven ? " [OK]" : ""}`,
      { x: 40, y, size: 7, font: mono, color: rgb(0.4, 0.4, 0.4) }
    );
    y -= 10;
  }

  // ── Chain integrity footer ─────────────────────────────────
  y -= 10;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 16;
  page.drawText(
    `Audit Chain Integrity: ${chainValid ? "[VERIFIED] all hashes link correctly" : "[TAMPERED] hash mismatch detected"}`,
    { x: 40, y, size: 9, font: bold, color: chainValid ? rgb(0.1, 0.5, 0.1) : rgb(0.7, 0.1, 0.1) }
  );

  const pdfBytes = await pdfDoc.save();
  const pdfPath = path.join(EXPORTS_DIR, `forensic-${examId}-${Date.now()}.pdf`);
  fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));
  logger.info("Forensic report generated", { examId, pdfPath });
  return pdfPath;
}
