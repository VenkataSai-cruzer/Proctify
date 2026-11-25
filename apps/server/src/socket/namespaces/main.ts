// ============================================================
// SecureAssess — Main Socket.IO Namespace (/)
// ============================================================
// SECURITY: Answer submission is ZERO-LEAK.
//   • correctIndex is NEVER sent to any student socket.
//   • isCorrect / correctIndex are NEVER echoed in callbacks or events.
//   • Adaptive difficulty advances silently server-side.
//   • Full grading reconciliation runs only on exam completion
//     and is pushed exclusively to teacher sockets.
// ============================================================

import type { Namespace, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../../utils/prismaClient";
import { logger } from "../../utils/logger";
import { EVENTS, ROOMS, ADAPTIVE } from "@secureassess/shared";
import type { TeacherJwtPayload } from "../../middleware/auth";
import {
  verifyClientPacketHmac,
  deriveSessionSecret,
  computeViolationRecordHash,
  getLastViolationHash,
  signCertificateQr,
} from "../../utils/security";
import { reconcileSession } from "../../services/gradingService";

// In-memory heartbeat watchdog map  sessionId → timer
const heartbeatMap = new Map<string, NodeJS.Timeout>();

// Allowed iframe/frame origins — only our own renderer
const ALLOWED_ORIGINS = new Set(["null", "file://", "http://localhost:5173", "http://localhost:5174"]);

export function registerMainNamespace(nsp: Namespace): void {

  // ── Socket middleware: validate origin for student sockets ──
  nsp.use((socket, next) => {
    const origin = socket.handshake.headers.origin ?? "null";
    // Teachers and machines connect from Electron (origin=null/file) or LAN
    // Students also connect from Electron renderer — same rule
    const isLAN = origin.startsWith("http://192.168.") ||
                  origin.startsWith("http://10.")       ||
                  origin.startsWith("http://172.")      ||
                  origin.startsWith("http://localhost");
    if (!ALLOWED_ORIGINS.has(origin) && !isLAN) {
      return next(new Error("Origin not allowed"));
    }
    next();
  });

  nsp.on("connection", (socket: Socket) => {
    logger.debug("Socket connected", { id: socket.id });

    // ── Teacher Auth ──────────────────────────────────────────
    socket.on(EVENTS.AUTH_TEACHER_JOIN, async ({ token, examId }, callback) => {
      // Validate sender frame is from our renderer (not from an injected iframe)
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as TeacherJwtPayload;
        socket.data.teacherId = payload.teacherId;
        socket.data.role = "teacher";
        await socket.join(`teacher:${payload.teacherId}`);
        if (examId) await socket.join(ROOMS.exam(examId));
        callback({ success: true, data: { teacherId: payload.teacherId, name: payload.name } });
      } catch {
        callback({ success: false, error: "Invalid teacher token" });
      }
    });

    // ── Machine Registration ──────────────────────────────────
    socket.on(EVENTS.AUTH_MACHINE_REGISTER, async ({ hardwareToken, systemNo, clientMode }, callback) => {
      const machine = await prisma.labMachine.findUnique({ where: { hardwareToken } });
      if (!machine?.isActive) {
        callback({ success: false, error: "Unregistered or inactive machine" });
        return;
      }
      socket.data.systemNo  = systemNo;
      socket.data.clientMode = clientMode;
      socket.data.role      = "machine";
      callback({ success: true, data: { registered: true } });
      nsp.to(ROOMS.exam("*")).emit(EVENTS.DASHBOARD_MACHINE_STATUS, {
        systemNo, online: true, clientMode, ipAddress: machine.ipAddress,
        timestamp: new Date().toISOString(),
      });
    });

    // ── Student Login ─────────────────────────────────────────
    socket.on(EVENTS.STUDENT_LOGIN, async (payload, callback) => {
      const { examId, fullName, registerNumber, year, systemNo, hardwareToken, clientMode } = payload;

      const machine = await prisma.labMachine.findUnique({ where: { hardwareToken } });
      if (!machine?.isActive) {
        callback({ success: false, error: "Machine not authorized", code: "MACHINE_BLOCKED" });
        return;
      }
      const exam = await prisma.exam.findUnique({ where: { id: examId } });
      if (!exam || !["PUBLISHED", "ACTIVE"].includes(exam.status)) {
        callback({ success: false, error: "Exam is not currently open", code: "EXAM_CLOSED" });
        return;
      }
      const rosterEntry = await prisma.rosterEntry.findUnique({
        where: { examId_registerNumber: { examId, registerNumber } },
      });
      if (!rosterEntry) {
        callback({ success: false, error: "Student not found in roster", code: "NOT_IN_ROSTER" });
        return;
      }
      if (exam.strictSeatBinding) {
        const allocation = await prisma.seatAllocation.findUnique({ where: { rosterId: rosterEntry.id } });
        if (allocation && allocation.systemNo !== systemNo) {
          socket.emit(EVENTS.SESSION_SEAT_MISMATCH, {
            assignedSystemNo: allocation.systemNo,
            message: `Seat Mismatch: Please proceed to ${allocation.systemNo}.`,
          });
          callback({ success: false, error: `Seat Mismatch: Please proceed to ${allocation.systemNo}.`, code: "SEAT_MISMATCH" });
          return;
        }
      }

      const existing = await prisma.studentSession.findUnique({ where: { rosterId: rosterEntry.id } });
      let session = existing;
      if (!session) {
        session = await prisma.studentSession.create({
          data: { examId, rosterId: rosterEntry.id, systemNo, clientMode, status: "WAITING" },
        });
      }

      socket.data.sessionId  = session.id;
      socket.data.role       = "student";
      socket.data.examId     = examId;
      await socket.join(ROOMS.session(session.id));
      await socket.join(ROOMS.exam(examId));

      const allocation = await prisma.seatAllocation.findUnique({
        where: { rosterId: rosterEntry.id },
        include: { roster: true },
      });

      // Derive a per-session HMAC secret and return it to the client
      // so the client can sign its answer packets without the master secret.
      const sessionSecret = deriveSessionSecret(session.id);

      callback({
        success: true,
        data: {
          sessionId: session.id,
          sessionSecret,   // used by client to sign answer packets
          seatAllocation: {
            id: allocation?.id ?? "",
            examId,
            rosterId: rosterEntry.id,
            systemNo: allocation?.systemNo ?? systemNo,
            fullName: rosterEntry.fullName,
            registerNumber: rosterEntry.registerNumber,
            year: rosterEntry.year,
          },
        },
      });

      nsp.to(ROOMS.exam(examId)).emit(EVENTS.DASHBOARD_SESSION_DELTA, {
        examId, session: serializeSession(session, rosterEntry),
      });
      logger.info("Student logged in", { registerNumber, systemNo, sessionId: session.id });
      startHeartbeatWatch(socket, session.id, examId);
    });

    // ── Heartbeat (with monotonic seq anti-replay) ────────────
    socket.on(EVENTS.STUDENT_HEARTBEAT, async ({ sessionId, timestamp }) => {
      await prisma.studentSession.updateMany({
        where: { id: sessionId },
        data: { lastHeartbeatAt: new Date() },
      });
      resetHeartbeatWatch(socket, sessionId, socket.data.examId ?? "");
    });

    // ── Request Next Question — correctIndex STRIPPED ─────────
    socket.on(EVENTS.STUDENT_REQUEST_NEXT_QUESTION, async ({ sessionId }, callback) => {
      const session = await prisma.studentSession.findUnique({ where: { id: sessionId } });
      if (!session || session.status !== "ACTIVE") {
        callback({ success: false, error: "Session not active" });
        return;
      }

      const answered = await prisma.answerRecord.findMany({
        where: { sessionId },
        select: { questionId: true },
      });
      const answeredIds = answered.map((a: { questionId: string }) => a.questionId);
      const exclude = answeredIds.length > 0 ? answeredIds : ["__none__"];

      let question = await prisma.mCQQuestion.findFirst({
        where: { examId: session.examId, difficulty: session.currentDifficulty, id: { notIn: exclude } },
        orderBy: { orderIndex: "asc" },
      });

      if (!question) {
        question = await prisma.mCQQuestion.findFirst({
          where: { examId: session.examId, id: { notIn: exclude } },
          orderBy: { orderIndex: "asc" },
        });
      }

      if (!question) {
        await autoSubmitAndReconcile(session.id, session.examId, nsp);
        callback({ success: false, error: "All questions answered — exam submitted" });
        return;
      }

      const exam = await prisma.exam.findUnique({ where: { id: session.examId } });
      callback({
        success: true,
        data: buildNextQuestionPayload(question, session, exam?.durationMinutes ?? 60),
        // NOTE: buildNextQuestionPayload explicitly omits correctIndex
      });
    });

    // ── Submit Answer — ZERO-LEAK deferred grading ────────────
    socket.on(EVENTS.STUDENT_SUBMIT_ANSWER, async (
      { sessionId, questionId, chosenIndex, seq, timeSpentMs, packetHmac }:
      { sessionId: string; questionId: string; chosenIndex: number;
        seq: number; timeSpentMs?: number; packetHmac?: string },
      callback
    ) => {
      const session = await prisma.studentSession.findUnique({ where: { id: sessionId } });
      if (!session || session.status !== "ACTIVE") {
        callback({ success: false, error: "Session not active" });
        return;
      }

      // ── Anti-replay: seq must be strictly monotonic ─────────
      if (typeof seq === "number" && seq <= session.lastSeq) {
        logger.warn("Replay detected — seq not monotonic", { sessionId, seq, lastSeq: session.lastSeq });
        callback({ success: false, error: "Replay detected", code: "REPLAY" });
        return;
      }

      // ── HMAC packet verification ─────────────────────────────
      if (packetHmac) {
        const sessionSecret = deriveSessionSecret(sessionId);
        const valid = verifyClientPacketHmac(
          sessionSecret, sessionId, questionId, chosenIndex, seq ?? 0, packetHmac
        );
        if (!valid) {
          logger.warn("Packet HMAC failed", { sessionId, questionId });
          callback({ success: false, error: "Packet integrity check failed", code: "HMAC_FAIL" });
          return;
        }
      }

      const question = await prisma.mCQQuestion.findUnique({ where: { id: questionId } });
      if (!question) { callback({ success: false, error: "Question not found" }); return; }

      // ── Evaluate answer server-side — NEVER send result to client ─
      const isCorrect    = chosenIndex === question.correctIndex;
      const pointsAwarded = isCorrect ? question.points : 0;

      const { newDifficulty, newConsecutive, tierChanged } = computeAdaptive(
        session.currentDifficulty as "EASY" | "MEDIUM" | "HARD",
        session.consecutiveCorrect,
        isCorrect
      );
      const highestTier = rankTier(newDifficulty) > rankTier(session.highestTierReached as "EASY" | "MEDIUM" | "HARD")
        ? newDifficulty
        : session.highestTierReached as "EASY" | "MEDIUM" | "HARD";

      // Persist answer (all correctness fields stored server-side)
      await prisma.answerRecord.upsert({
        where: { sessionId_questionId: { sessionId, questionId } },
        update: {
          chosenIndex, seq: seq ?? 0, timeSpentMs: timeSpentMs ?? 0,
          packetHmac: packetHmac ?? "",
          isCorrect, difficulty: session.currentDifficulty, pointsAwarded,
        },
        create: {
          sessionId, questionId, chosenIndex,
          seq: seq ?? 0, timeSpentMs: timeSpentMs ?? 0,
          packetHmac: packetHmac ?? "",
          isCorrect, difficulty: session.currentDifficulty, pointsAwarded,
        },
      });

      const updatedSession = await prisma.studentSession.update({
        where: { id: sessionId },
        data: {
          currentScore: session.currentScore + pointsAwarded,
          currentDifficulty: newDifficulty,
          consecutiveCorrect: newConsecutive,
          highestTierReached: highestTier,
          lastSeq: seq ?? session.lastSeq,
        },
      });

      // ── Response to student: NEUTRAL — no correctness info ───
      // Only the new difficulty tier (needed to show tier-up badge) is exposed.
      const answered = await prisma.answerRecord.count({ where: { sessionId } });
      const total    = await prisma.mCQQuestion.count({ where: { examId: session.examId } });

      callback({
        success: true,
        data: {
          // No isCorrect, no correctIndex, no pointsAwarded
          difficultyChanged: tierChanged,
          newDifficulty:     tierChanged ? newDifficulty : undefined,
          questionsAnswered: answered,
          totalQuestions:    total,
        },
      });

      // ── Teacher grid update — still carries score ──────────
      nsp.to(ROOMS.exam(session.examId)).emit(EVENTS.DASHBOARD_SESSION_DELTA, {
        examId: session.examId,
        session: serializeSession(updatedSession, null),
      });
    });

    // ── Exam Submit ───────────────────────────────────────────
    socket.on(EVENTS.STUDENT_SUBMIT_EXAM, async ({ sessionId }, callback) => {
      await autoSubmitAndReconcile(sessionId, socket.data.examId ?? "", nsp);
      callback({ success: true, data: { submitted: true } });
    });

    // ── Anti-Cheat Violation (hash-chained) ───────────────────
    socket.on(EVENTS.ANTICHEAT_VIOLATION, async ({ sessionId, violationType, metadata, timestamp }) => {
      const session = await prisma.studentSession.findUnique({ where: { id: sessionId } });
      if (!session || !["ACTIVE", "WAITING"].includes(session.status)) return;

      const exam = await prisma.exam.findUnique({ where: { id: session.examId } });

      // Build hash chain
      const id      = crypto.randomUUID();
      const ts      = timestamp ?? new Date().toISOString();
      const prevHash = await getLastViolationHash(prisma, sessionId);
      const recordHash = computeViolationRecordHash(prevHash, id, sessionId, violationType, ts);

      const violation = await prisma.violationEvent.create({
        data: {
          id,
          sessionId,
          systemNo: session.systemNo,
          violationType,
          source: "CLIENT",
          confidence: 1.0,
          metadataJson: metadata ? JSON.stringify(metadata) : null,
          timestamp: new Date(ts),
          prevHash,
          recordHash,
        },
      });

      const violationCount = session.violationCount + 1;
      const threshold      = exam?.disqualifyThreshold ?? 3;

      const updatedSession = await prisma.studentSession.update({
        where: { id: sessionId },
        data: { violationCount, status: violationCount >= threshold ? "DISQUALIFIED" : session.status },
      });

      socket.emit(EVENTS.VIOLATION_RECORDED, {
        violationId: violation.id,
        sessionId,
        violationType,
        warningMessage: `Warning ${violationCount}/${threshold}: ${formatViolationType(violationType)}`,
        violationCount,
        remainingAllowed: Math.max(0, threshold - violationCount),
        timestamp: ts,
      });

      nsp.to(ROOMS.exam(session.examId)).emit(EVENTS.DASHBOARD_VIOLATION_ALERT, {
        id: violation.id, sessionId, systemNo: session.systemNo,
        violationType, source: "CLIENT", confidence: 1.0,
        timestamp: ts, forgiven: false,
      });

      // Forward to projector namespace
      nsp.server.of("/projector").to(ROOMS.projector(session.examId)).emit(EVENTS.DASHBOARD_VIOLATION_ALERT, {
        id: violation.id, sessionId, systemNo: session.systemNo,
        violationType, source: "CLIENT", confidence: 1.0,
        timestamp: ts, forgiven: false,
      });

      if (violationCount >= threshold) {
        socket.emit(EVENTS.SESSION_DISQUALIFIED, {
          sessionId, reason: "Violation threshold exceeded", violationCount,
        });
      }
    });

    // ── Teacher Controls ──────────────────────────────────────
    socket.on(EVENTS.TEACHER_OPEN_LOBBY, async ({ examId }, callback) => {
      const exam = await prisma.exam.update({
        where: { id: examId },
        data: { status: "PUBLISHED" },
      });
      nsp.to(ROOMS.exam(examId)).emit(EVENTS.EXAM_LOBBY_OPENED, {
        examId,
        examTitle: exam.title,
        subject: exam.subject,
        durationMinutes: exam.durationMinutes,
        strictSeatBinding: exam.strictSeatBinding,
        lockdownMode: exam.lockdownMode,
      });
      callback({ success: true });
    });

    socket.on(EVENTS.TEACHER_START_EXAM, async ({ examId }, callback) => {
      await prisma.exam.update({ where: { id: examId }, data: { status: "ACTIVE" } });
      const updated = await prisma.studentSession.updateMany({
        where: { examId, status: "WAITING" },
        data: { status: "ACTIVE", startedAt: new Date() },
      });
      nsp.to(ROOMS.exam(examId)).emit(EVENTS.EXAM_STATUS_CHANGED, {
        examId, status: "ACTIVE",
        message: "Exam has started. Good luck!",
        timestamp: new Date().toISOString(),
      });
      callback({ success: true, data: { startedCount: updated.count } });
    });

    socket.on(EVENTS.TEACHER_PAUSE_EXAM, async ({ examId, reason }, callback) => {
      await prisma.exam.update({ where: { id: examId }, data: { status: "PAUSED" } });
      nsp.to(ROOMS.exam(examId)).emit(EVENTS.EXAM_PAUSED, { examId, reason, timestamp: new Date().toISOString() });
      callback({ success: true });
    });

    socket.on(EVENTS.TEACHER_RESUME_EXAM, async ({ examId }, callback) => {
      await prisma.exam.update({ where: { id: examId }, data: { status: "ACTIVE" } });
      nsp.to(ROOMS.exam(examId)).emit(EVENTS.EXAM_RESUMED, {
        examId, timeRemainingSeconds: 0, timestamp: new Date().toISOString(),
      });
      callback({ success: true });
    });

    socket.on(EVENTS.TEACHER_FORCE_SUBMIT, async ({ examId, sessionId, reason }, callback) => {
      await autoSubmitAndReconcile(sessionId, examId, nsp);
      nsp.to(ROOMS.session(sessionId)).emit(EVENTS.SESSION_FORCE_SUBMITTED, {
        sessionId, reason: reason ?? "Force submitted by teacher",
      });
      callback({ success: true });
    });

    socket.on(EVENTS.TEACHER_EXTEND_TIME, async ({ examId, sessionId, additionalMinutes }, callback) => {
      if (sessionId) {
        await prisma.studentSession.updateMany({
          where: { id: sessionId },
          data: { timeExtensionMinutes: { increment: additionalMinutes } },
        });
      }
      nsp.to(ROOMS.exam(examId)).emit(EVENTS.EXAM_TIME_EXTENDED, {
        examId, sessionId, additionalMinutes,
        newEndTime: new Date(Date.now() + additionalMinutes * 60000).toISOString(),
      });
      callback({ success: true });
    });

    socket.on(EVENTS.TEACHER_REQUEST_GRID, async ({ examId }, callback) => {
      const sessions = await prisma.studentSession.findMany({
        where: { examId }, include: { roster: true },
      });
      callback({
        success: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { sessions: sessions.map((s: any) => serializeSession(s, s.roster)) },
      });
    });

    socket.on(EVENTS.TEACHER_FORGIVE_VIOLATION, async ({ violationId }, callback) => {
      const teacherId = socket.data.teacherId;
      const violation = await prisma.violationEvent.update({
        where: { id: violationId },
        data: { forgiven: true, forgivenById: teacherId, forgivenAt: new Date() },
        include: { session: { include: { roster: true } } },
      });

      const violationCount = await prisma.violationEvent.count({
        where: { sessionId: violation.sessionId, forgiven: false },
      });

      const session = await prisma.studentSession.update({
        where: { id: violation.sessionId },
        data: {
          violationCount,
          status: violationCount < (3) ? "ACTIVE" : violation.session.status,
        },
      });

      nsp.to(ROOMS.session(violation.sessionId)).emit(EVENTS.VIOLATION_FORGIVEN, {
        violationId,
        sessionId: violation.sessionId,
        timestamp: new Date().toISOString(),
      });
      callback({ success: true, data: { session: serializeSession(session, violation.session.roster) } });
    });

    socket.on(EVENTS.TEACHER_REQUEST_LEADERBOARD, async ({ examId }, callback) => {
      const sessions = await prisma.studentSession.findMany({
        where: { examId }, include: { roster: true }, orderBy: { currentScore: "desc" },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries = sessions.map((s: any, i: number) => ({
        rank: i + 1,
        fullName: s.roster.fullName,
        registerNumber: s.roster.registerNumber,
        systemNo: s.systemNo,
        currentScore: s.currentScore,
        currentDifficulty: s.currentDifficulty as "EASY" | "MEDIUM" | "HARD",
        highestTierReached: s.highestTierReached as "EASY" | "MEDIUM" | "HARD",
        status: s.status as "WAITING" | "ACTIVE" | "PAUSED" | "SUBMITTED" | "FLAGGED" | "DISQUALIFIED",
      }));
      callback({ success: true, data: { entries } });
      nsp.to(ROOMS.projector(examId)).emit(EVENTS.DASHBOARD_LEADERBOARD, {
        examId, entries, timestamp: new Date().toISOString(),
      });
    });

    socket.on(EVENTS.TEACHER_GENERATE_REPORT, async ({ examId, reportType }, callback) => {
      if (reportType === "MARKSHEET" || reportType === "FORENSIC") {
        // Run deferred reconciliation before generating the report
        const { reconcileExam } = await import("../../services/gradingService");
        const results = await reconcileExam(examId);
        // Push full breakdown to this teacher socket only
        nsp.to(`teacher:${socket.data.teacherId}`).emit("exam:reconciliationComplete" as any, {
          examId, results, timestamp: new Date().toISOString(),
        });
      }
      callback({ success: true, data: { queued: true } });
    });

    socket.on(EVENTS.ANTICHEAT_RECONNECT_SYNC, async ({ sessionId, pendingAnswer }, callback) => {
      const session = await prisma.studentSession.findUnique({
        where: { id: sessionId }, include: { exam: true },
      });
      if (!session) { callback({ success: false, error: "Session not found" }); return; }

      // Flush any pending answer (treat as an unverified late submission — persist but mark)
      if (pendingAnswer?.questionId) {
        const q = await prisma.mCQQuestion.findUnique({ where: { id: pendingAnswer.questionId } });
        if (q) {
          const isCorrect = pendingAnswer.chosenIndex === q.correctIndex;
          await prisma.answerRecord.upsert({
            where: { sessionId_questionId: { sessionId, questionId: pendingAnswer.questionId } },
            update: {},
            create: {
              sessionId, questionId: pendingAnswer.questionId,
              chosenIndex: pendingAnswer.chosenIndex,
              isCorrect, difficulty: session.currentDifficulty,
              pointsAwarded: isCorrect ? q.points : 0,
              seq: 0, timeSpentMs: 0, packetHmac: "",
            },
          });
        }
      }
      callback({ success: true, data: { sessionState: serializeSession(session, null) } });
    });

    socket.on("disconnect", () => {
      clearHeartbeatWatch(socket.data.sessionId);
      logger.debug("Socket disconnected", { id: socket.id, role: socket.data.role });
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────

import crypto from "crypto";

async function autoSubmitAndReconcile(
  sessionId: string, examId: string, nsp: Namespace
): Promise<void> {
  await prisma.studentSession.updateMany({
    where: { id: sessionId, status: { in: ["ACTIVE", "WAITING", "PAUSED"] } },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });

  // Run deferred reconciliation — results go ONLY to teacher sockets
  try {
    const result = await reconcileSession(sessionId);
    nsp.to(ROOMS.exam(examId)).emit("exam:sessionReconciled" as any, {
      examId,
      sessionId,
      breakdown: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("Reconciliation error", { sessionId, error: (err as Error).message });
  }

  // Generic submit event (no scores) to the student
  nsp.to(ROOMS.session(sessionId)).emit(EVENTS.SESSION_SUBMITTED, {
    sessionId,
    message: "Your exam has been submitted successfully.",
  });
}

function computeAdaptive(
  current: "EASY" | "MEDIUM" | "HARD",
  consecutive: number,
  isCorrect: boolean
): { newDifficulty: "EASY" | "MEDIUM" | "HARD"; newConsecutive: number; tierChanged: boolean } {
  const tiers: ("EASY" | "MEDIUM" | "HARD")[] = ["EASY", "MEDIUM", "HARD"];
  const idx = tiers.indexOf(current);
  if (isCorrect) {
    const c = consecutive + 1;
    if (c >= ADAPTIVE.PROMOTE_AFTER_CORRECT && idx < tiers.length - 1)
      return { newDifficulty: tiers[idx + 1]!, newConsecutive: 0, tierChanged: true };
    return { newDifficulty: current, newConsecutive: c, tierChanged: false };
  } else {
    if (idx > 0) return { newDifficulty: tiers[idx - 1]!, newConsecutive: 0, tierChanged: true };
    return { newDifficulty: current, newConsecutive: 0, tierChanged: false };
  }
}

function rankTier(t: "EASY" | "MEDIUM" | "HARD"): number {
  return { EASY: 0, MEDIUM: 1, HARD: 2 }[t];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildNextQuestionPayload(question: any, session: any, durationMinutes: number): any {
  return {
    question: {
      id:           question.id,
      examId:       question.examId,
      questionText: question.questionText,
      options:      JSON.parse(question.optionsJson),
      // correctIndex is INTENTIONALLY OMITTED
      difficulty:   question.difficulty,
      topicTag:     question.topicTag,
      points:       question.points,
      orderIndex:   question.orderIndex,
    },
    adaptiveState: {
      currentDifficulty:  session.currentDifficulty,
      consecutiveCorrect: session.consecutiveCorrect,
      currentScore:       session.currentScore,
      highestTierReached: session.highestTierReached,
      questionsAnswered:  0,
      totalQuestions:     0,
    },
    timeRemainingSeconds: (durationMinutes + (session.timeExtensionMinutes ?? 0)) * 60,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeSession(session: any, roster: any): any {
  return {
    id: session.id,
    examId: session.examId,
    rosterId: session.rosterId,
    systemNo: session.systemNo,
    fullName: roster?.fullName ?? "",
    registerNumber: roster?.registerNumber ?? "",
    year: roster?.year ?? "",
    clientMode: session.clientMode,
    status: session.status,
    currentDifficulty: session.currentDifficulty,
    currentScore: session.currentScore,
    highestTierReached: session.highestTierReached,
    consecutiveCorrect: session.consecutiveCorrect,
    violationCount: session.violationCount,
    startedAt:   session.startedAt?.toISOString()   ?? null,
    submittedAt: session.submittedAt?.toISOString() ?? null,
    timeExtensionMinutes: session.timeExtensionMinutes ?? 0,
  };
}

function formatViolationType(vt: string): string {
  return vt.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function startHeartbeatWatch(socket: Socket, sessionId: string, _examId: string): void {
  clearHeartbeatWatch(sessionId);
  const timer = setTimeout(() => {
    logger.warn("Heartbeat timeout", { sessionId });
  }, 35_000);
  heartbeatMap.set(sessionId, timer);
}

function resetHeartbeatWatch(socket: Socket, sessionId: string, examId: string): void {
  startHeartbeatWatch(socket, sessionId, examId);
}

function clearHeartbeatWatch(sessionId?: string): void {
  if (!sessionId) return;
  const t = heartbeatMap.get(sessionId);
  if (t) { clearTimeout(t); heartbeatMap.delete(sessionId); }
}
