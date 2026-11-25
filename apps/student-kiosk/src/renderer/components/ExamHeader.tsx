// ============================================================
// SecureAssess — Exam Header Bar
// Shows: system number, student name, score, difficulty tier,
//        question progress, and countdown timer
// ============================================================

import { useStudentStore } from "../store/studentStore";
import { clsx } from "clsx";

const TIER_STYLES = {
  EASY:   "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300",
  MEDIUM: "bg-amber-100   text-amber-700   ring-1 ring-amber-300",
  HARD:   "bg-red-100     text-red-700     ring-1 ring-red-300",
};

const TIER_LABEL = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ExamHeader() {
  const systemNo         = useStudentStore((s) => s.systemNo);
  const studentName      = useStudentStore((s) => s.studentName);
  const registerNumber   = useStudentStore((s) => s.registerNumber);
  const examTitle        = useStudentStore((s) => s.examTitle);
  const adaptiveState    = useStudentStore((s) => s.adaptiveState);
  const timeRemaining    = useStudentStore((s) => s.timeRemainingSeconds);
  const violationCount   = useStudentStore((s) => s.violationCount);
  const disqualifyThreshold = useStudentStore((s) => s.disqualifyThreshold);

  const difficulty = adaptiveState?.currentDifficulty ?? "EASY";
  const score      = adaptiveState?.currentScore ?? 0;
  const answered   = adaptiveState?.questionsAnswered ?? 0;
  const total      = adaptiveState?.totalQuestions ?? 0;

  const isLowTime = timeRemaining <= 300 && timeRemaining > 0; // last 5 mins
  const isCritical = timeRemaining <= 60 && timeRemaining > 0;

  const violationsLeft = Math.max(0, disqualifyThreshold - violationCount);

  return (
    <header className="sticky top-0 z-30 w-full bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

        {/* Left — Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-cobalt-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold leading-none">
              {systemNo.replace("SYS-", "")}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate leading-tight">
              {studentName}
            </p>
            <p className="text-xs text-slate-500 leading-tight font-mono">
              {registerNumber}
            </p>
          </div>
        </div>

        {/* Centre — Exam title + progress */}
        <div className="hidden sm:flex flex-col items-center min-w-0">
          <p className="text-xs font-medium text-slate-500 truncate max-w-xs">
            {examTitle}
          </p>
          {total > 0 && (
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cobalt-500 rounded-full transition-all duration-500"
                  style={{ width: `${(answered / total) * 100}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                {answered}/{total}
              </span>
            </div>
          )}
        </div>

        {/* Right — Score, tier, timer */}
        <div className="flex items-center gap-3 flex-shrink-0">

          {/* Score */}
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-400 leading-tight">Score</span>
            <span className="text-sm font-bold text-slate-800 tabular-nums leading-tight">
              {score} pts
            </span>
          </div>

          {/* Difficulty tier badge */}
          <span className={clsx(
            "px-2.5 py-1 rounded-full text-xs font-bold tracking-wide",
            TIER_STYLES[difficulty]
          )}>
            {TIER_LABEL[difficulty]}
          </span>

          {/* Violations indicator */}
          {violationCount > 0 && (
            <div className="flex items-center gap-1">
              {Array.from({ length: disqualifyThreshold }).map((_, i) => (
                <span
                  key={i}
                  className={clsx(
                    "w-2 h-2 rounded-full",
                    i < violationCount ? "bg-red-500" : "bg-slate-200"
                  )}
                />
              ))}
            </div>
          )}

          {/* Timer */}
          <div className={clsx(
            "flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono font-bold text-sm tabular-nums",
            isCritical
              ? "bg-red-500 text-white animate-pulse"
              : isLowTime
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-700"
          )}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {formatTime(timeRemaining)}
          </div>
        </div>
      </div>
    </header>
  );
}
