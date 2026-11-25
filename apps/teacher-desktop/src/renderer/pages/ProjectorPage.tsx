// ============================================================
// SecureAssess Teacher Desktop — Dual-Pane Projector Mode
// Full-screen high-contrast display for classroom projection:
// LEFT: Live rankings leaderboard
// RIGHT: Integrity alerts & CCTV ticker
// ============================================================

import { useEffect, useState } from "react";
import { useExamStore } from "../store/examStore";
import { useTeacherSocket } from "../hooks/useTeacherSocket";
import { EVENTS } from "@secureassess/shared";
import { cn, formatDateTime } from "../lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import type { LeaderboardEntry, ViolationEvent } from "@secureassess/shared";

function DifficultyTierBadge({ tier }: { tier: string }) {
  const styles = {
    EASY:   "bg-emerald-500 text-white",
    MEDIUM: "bg-amber-500 text-white",
    HARD:   "bg-red-500 text-white",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-bold uppercase", (styles as any)[tier] ?? "bg-slate-600 text-white")}>
      {tier}
    </span>
  );
}

function LeaderboardPane({ entries, hideScores }: { entries: LeaderboardEntry[]; hideScores: boolean }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-700/50">
      {/* Header */}
      <div className="px-8 py-5 border-b border-slate-700/50">
        <h2 className="text-cobalt-400 text-xs font-semibold uppercase tracking-widest mb-1">Live Rankings</h2>
        <p className="text-white text-xl font-bold">Student Leaderboard</p>
      </div>

      {/* Podium (top 3) */}
      {entries.length >= 3 && !hideScores && (
        <div className="px-8 py-4 border-b border-slate-700/50">
          <div className="flex items-end justify-center gap-3">
            {/* 2nd */}
            <div className="text-center">
              <div className="bg-slate-600 rounded-t-xl px-4 py-3 h-16 flex flex-col justify-end">
                <p className="text-white text-sm font-bold truncate max-w-[80px]">
                  {entries[1]?.fullName.split(" ")[0]}
                </p>
                <p className="text-slate-300 text-xs tabular-nums">{entries[1]?.currentScore} pts</p>
              </div>
              <div className="bg-slate-500 rounded-b-xl px-4 py-1">
                <p className="text-slate-300 text-xs font-bold">🥈 2nd</p>
              </div>
            </div>
            {/* 1st */}
            <div className="text-center">
              <div className="bg-cobalt-500/30 border border-cobalt-500/50 rounded-t-xl px-5 py-4 h-24 flex flex-col justify-end">
                <p className="text-cobalt-300 text-base font-bold truncate max-w-[100px]">
                  {entries[0]?.fullName.split(" ")[0]}
                </p>
                <p className="text-cobalt-200 font-bold tabular-nums">{entries[0]?.currentScore} pts</p>
              </div>
              <div className="bg-cobalt-500 rounded-b-xl px-5 py-1.5">
                <p className="text-white text-sm font-bold">🥇 1st</p>
              </div>
            </div>
            {/* 3rd */}
            <div className="text-center">
              <div className="bg-amber-800/30 rounded-t-xl px-4 py-3 h-12 flex flex-col justify-end">
                <p className="text-amber-300 text-sm font-bold truncate max-w-[80px]">
                  {entries[2]?.fullName.split(" ")[0]}
                </p>
                <p className="text-amber-400 text-xs tabular-nums">{entries[2]?.currentScore} pts</p>
              </div>
              <div className="bg-amber-700/50 rounded-b-xl px-4 py-1">
                <p className="text-amber-300 text-xs font-bold">🥉 3rd</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full table */}
      <div className="flex-1 overflow-y-auto px-8 py-3 space-y-1">
        <AnimatePresence>
          {entries.map((entry) => (
            <motion.div
              key={entry.registerNumber}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "flex items-center gap-4 px-4 py-3 rounded-xl",
                entry.rank <= 3 ? "bg-cobalt-500/10 border border-cobalt-500/20" : "bg-slate-800/50"
              )}
            >
              <span className={cn(
                "text-lg font-black tabular-nums w-8 text-center",
                entry.rank === 1 ? "text-yellow-400" : entry.rank === 2 ? "text-slate-300" : entry.rank === 3 ? "text-amber-600" : "text-slate-500"
              )}>
                {entry.rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{entry.fullName}</p>
                <p className="text-slate-500 text-xs font-mono">{entry.registerNumber}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <DifficultyTierBadge tier={entry.currentDifficulty} />
                {!hideScores && (
                  <span className="text-white font-bold tabular-nums text-sm w-16 text-right">
                    {entry.currentScore} pts
                  </span>
                )}
                {hideScores && <span className="text-slate-600 text-sm w-16 text-right">—</span>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function IntegrityPane({ violations }: { violations: ViolationEvent[] }) {
  const recent = violations.filter((v) => !v.forgiven).slice(0, 20);
  const sessions = useExamStore((s) => s.sessions);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 py-5 border-b border-slate-700/50">
        <h2 className="text-red-400 text-xs font-semibold uppercase tracking-widest mb-1">Integrity Monitor</h2>
        <div className="flex items-center gap-3">
          <p className="text-white text-xl font-bold">Live Alerts</p>
          {recent.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-4 space-y-2">
        <AnimatePresence>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <span className="text-3xl">✅</span>
              <p className="text-emerald-400 text-sm font-medium">No active violations</p>
              <p className="text-slate-600 text-xs">All students clear</p>
            </div>
          ) : recent.map((v) => {
            const session = sessions.find((s) => s.id === v.sessionId);
            return (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"
              >
                <span className="text-xl flex-shrink-0">{v.source === "CCTV" ? "📷" : "🖥"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-red-300 font-semibold text-sm">
                    {session?.systemNo ?? "—"} · {session?.fullName ?? "Unknown"}
                  </p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {v.violationType.replace(/_/g, " ")}
                    <span className="text-slate-600 ml-2">{formatDateTime(v.timestamp)}</span>
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Quick stats */}
      <div className="px-8 py-4 border-t border-slate-700/50 grid grid-cols-3 gap-3">
        {[
          { label: "Total Alerts", value: violations.length, color: "text-red-400" },
          { label: "Unforgiven", value: violations.filter((v) => !v.forgiven).length, color: "text-amber-400" },
          { label: "CCTV Events", value: violations.filter((v) => v.source === "CCTV").length, color: "text-purple-400" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-800/50 rounded-xl px-3 py-2.5 text-center">
            <p className={cn("text-xl font-bold tabular-nums", s.color)}>{s.value}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectorPage() {
  const { socket } = useTeacherSocket();
  const leaderboard = useExamStore((s) => s.leaderboard);
  const violations  = useExamStore((s) => s.violations);
  const activeExam  = useExamStore((s) => s.activeExam);
  const [hideScores, setHideScores] = useState(false);
  const [examTitle, setExamTitle]   = useState("");

  useEffect(() => {
    // Load title from local storage if activeExam not set (projector may open separately)
    setExamTitle(activeExam?.title ?? "Examination");
  }, [activeExam]);

  // Poll leaderboard
  useEffect(() => {
    if (!socket || !activeExam?.id) return;
    const poll = () => socket.emit(EVENTS.TEACHER_REQUEST_LEADERBOARD, { examId: activeExam.id }, () => {});
    poll();
    const t = setInterval(poll, 10_000);
    return () => clearInterval(t);
  }, [socket, activeExam?.id]);

  return (
    <div className="fixed inset-0 bg-[#060D1A] text-white flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 px-8 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-cobalt-500 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-white">SecureAssess</span>
          <span className="text-slate-600">·</span>
          <span className="text-sm text-slate-300">{examTitle}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-slate-400">LIVE</span>
          </div>
          <button
            onClick={() => setHideScores((h) => !h)}
            className="text-xs text-slate-400 hover:text-white bg-slate-800 rounded-lg px-3 py-1.5 transition-colors"
          >
            {hideScores ? "👁 Show Scores" : "🙈 Hide Scores"}
          </button>
          <span className="text-xs text-slate-600 font-mono tabular-nums">
            {new Date().toLocaleTimeString("en-IN")}
          </span>
        </div>
      </div>

      {/* Dual pane */}
      <div className="flex-1 flex overflow-hidden">
        <LeaderboardPane entries={leaderboard} hideScores={hideScores} />
        <IntegrityPane violations={violations} />
      </div>
    </div>
  );
}
