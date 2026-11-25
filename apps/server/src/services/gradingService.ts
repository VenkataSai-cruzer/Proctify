// ============================================================
// SecureAssess Server — Deferred Grading & Reconciliation
// ============================================================
// Runs AFTER exam completion (submit or timer expiry).
// 1. Recomputes every answer against the stored correctIndex.
// 2. Applies difficulty-tier weighting.
// 3. Deducts points for unforgiven violations.
// 4. Pushes the full per-answer breakdown to the teacher only.
// ============================================================

import { prisma } from "../utils/prismaClient";
import { logger } from "../utils/logger";

export interface AnswerBreakdown {
  questionId: string;
  questionText: string;
  chosenIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  difficulty: string;
  pointsAwarded: number;
  timeSpentMs: number;
  seq: number;
}

export interface ReconciliationResult {
  sessionId: string;
  studentName: string;
  registerNumber: string;
  systemNo: string;
  rawScore: number;
  violationDeduction: number;
  finalScore: number;
  totalPossible: number;
  accuracyPct: number;
  highestTierReached: string;
  status: string;
  answers: AnswerBreakdown[];
}

export async function reconcileSession(sessionId: string): Promise<ReconciliationResult> {
  const session = await prisma.studentSession.findUnique({
    where: { id: sessionId },
    include: {
      roster: true,
      exam: true,
      answers: { include: { question: true }, orderBy: { answeredAt: "asc" } },
      violations: { where: { forgiven: false } },
    },
  });

  if (!session) throw new Error(`Session ${sessionId} not found`);

  const totalPossible = await prisma.mCQQuestion.aggregate({
    where: { examId: session.examId },
    _sum: { points: true },
  });
  const maxScore = totalPossible._sum.points ?? 100;

  // ── Recompute each answer ──────────────────────────────────
  const breakdowns: AnswerBreakdown[] = [];
  let rawScore = 0;

  for (const ar of session.answers) {
    const q = ar.question;
    const isCorrect = ar.chosenIndex === q.correctIndex;
    const pts       = isCorrect ? q.points : 0;
    rawScore += pts;

    breakdowns.push({
      questionId:   q.id,
      questionText: q.questionText,
      chosenIndex:  ar.chosenIndex,
      correctIndex: q.correctIndex,
      isCorrect,
      difficulty:   q.difficulty,
      pointsAwarded: pts,
      timeSpentMs:  ar.timeSpentMs,
      seq:          ar.seq,
    });

    // Backfill the answer record with ground-truth values
    await prisma.answerRecord.update({
      where: { id: ar.id },
      data: { isCorrect, pointsAwarded: pts },
    });
  }

  // ── Violation deduction ────────────────────────────────────
  // Each unforgiven violation deducts 10 % of the per-question
  // average score, capped at 30 % of rawScore.
  const perQuestionAvg = rawScore / Math.max(breakdowns.length, 1);
  const rawDeduction   = Math.round(session.violations.length * perQuestionAvg * 0.1);
  const violationDeduction = Math.min(rawDeduction, Math.round(rawScore * 0.3));
  const finalScore    = Math.max(0, rawScore - violationDeduction);

  const accuracyPct = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;

  // ── Persist reconciled values ──────────────────────────────
  await prisma.studentSession.update({
    where: { id: sessionId },
    data: {
      currentScore: rawScore,     // gross score for leaderboard
      finalScore,                  // net score after deductions
      violationDeduction,
    },
  });

  logger.info("Session reconciled", { sessionId, rawScore, violationDeduction, finalScore });

  return {
    sessionId,
    studentName:      session.roster.fullName,
    registerNumber:   session.roster.registerNumber,
    systemNo:         session.systemNo,
    rawScore,
    violationDeduction,
    finalScore,
    totalPossible:    maxScore,
    accuracyPct,
    highestTierReached: session.highestTierReached,
    status:           session.status,
    answers:          breakdowns,
  };
}

/** Reconcile ALL submitted sessions for an exam and return a summary. */
export async function reconcileExam(examId: string): Promise<ReconciliationResult[]> {
  const sessions = await prisma.studentSession.findMany({
    where: { examId, status: { in: ["SUBMITTED", "DISQUALIFIED"] } },
    select: { id: true },
  });

  const results: ReconciliationResult[] = [];
  for (const { id } of sessions) {
    try {
      results.push(await reconcileSession(id));
    } catch (err) {
      logger.error("Reconciliation failed for session", { sessionId: id, error: (err as Error).message });
    }
  }

  return results.sort((a, b) => b.finalScore - a.finalScore);
}
