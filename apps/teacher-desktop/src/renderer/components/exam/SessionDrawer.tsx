// ============================================================
// SecureAssess — Session Detail Drawer
// Forensic timeline + 1-click "Forgive / Restore Points"
// Shows combined client + CCTV violations in chronological order
// ============================================================

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useExamStore } from "../../store/examStore";
import { useTeacherSocket } from "../../hooks/useTeacherSocket";
import { EVENTS } from "@secureassess/shared";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cn, difficultyBg, statusBadge, formatDateTime } from "../../lib/utils";
import toast from "react-hot-toast";
import type { ViolationEvent, StudentSession } from "@secureassess/shared";

// ── Violation entry with expand + forgive ─────────────────────

function ViolationEntry({
  violation: v,
  onForgive,
  forgiving,
}: {
  violation: ViolationEvent;
  onForgive: () => void;
  forgiving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const sourceIcon  = v.source === "CCTV" ? "📷" : "🖥";
  const sourceColor = v.source === "CCTV" ? "text-purple-400" : "text-amber-400";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        v.forgiven
          ? "border-[#1F2937] bg-[#0B1120] opacity-50"
          : "border-amber-500/25 bg-amber-500/5"
      )}
    >
      {/* Header row */}
      <div
        className="flex items-start gap-2 p-2.5 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-sm flex-shrink-0 mt-0.5">{sourceIcon}</span>
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold text-[11px] leading-tight",
            v.forgiven ? "text-slate-500" : "text-amber-400")}>
            {v.violationType.replace(/_/g, " ")}
          </p>
          <p className={cn("text-[9px] mt-0.5 tabular-nums", sourceColor)}>
            {v.source}
            {v.confidence < 1 && ` · ${Math.round(v.confidence * 100)}%`}
            {" · "}{formatDateTime(v.timestamp)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!v.forgiven && (
            <Button
              size="xs" variant="success"
              loading={forgiving}
              onClick={(e) => { e.stopPropagation(); onForgive(); }}
              className="text-[9px] px-1.5 py-0.5"
            >
              ✓ Forgive
            </Button>
          )}
          <span className="text-slate-600 text-[10px]">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded: CCTV snapshot + forgiven note */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            className="overflow-hidden border-t border-[#1F2937]"
          >
            <div className="p-2.5 space-y-1.5">
              {v.snapshotBase64 && (
                <img
                  src={`data:image/jpeg;base64,${v.snapshotBase64}`}
                  alt="CCTV evidence snapshot"
                  className="w-full rounded-lg object-cover max-h-32"
                />
              )}
              {(v as any).metadata && (
                <pre className="text-[9px] text-slate-600 font-mono whitespace-pre-wrap">
                  {JSON.stringify((v as any).metadata, null, 2)}
                </pre>
              )}
              {v.forgiven && (
                <p className="text-[9px] text-emerald-500 italic">
                  ✓ Forgiven by teacher
                  {v.forgivenAt ? ` · ${formatDateTime(v.forgivenAt)}` : ""}
                </p>
              )}
              {!v.snapshotBase64 && !v.forgiven && (
                <p className="text-[9px] text-slate-600 italic">No snapshot available</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main drawer ───────────────────────────────────────────────

export function SessionDrawer() {
  const selectedId        = useExamStore((s) => s.selectedSessionId);
  const sessions          = useExamStore((s) => s.sessions);
  const violations        = useExamStore((s) => s.violations);
  const activeExam        = useExamStore((s) => s.activeExam);
  const setSelected       = useExamStore((s) => s.setSelectedSession);
  const forgivenViolation = useExamStore((s) => s.forgivenViolation);
  const upsertSession     = useExamStore((s) => s.upsertSession);
  const { socket }        = useTeacherSocket();

  const [forgivingId, setForgivingId] = useState<string | null>(null);

  const session = sessions.find((s) => s.id === selectedId) ?? null;

  // Sort violations chronologically (oldest first = top of timeline)
  const sessionViolations = violations
    .filter((v) => v.sessionId === selectedId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const unforgivenCount = sessionViolations.filter((v) => !v.forgiven).length;

  const handleForceSubmit = () => {
    if (!socket || !session || !activeExam) return;
    if (!confirm(`Force submit ${session.fullName}?`)) return;
    socket.emit(EVENTS.TEACHER_FORCE_SUBMIT,
      { examId: activeExam.id, sessionId: session.id },
      (resp: { success: boolean; error?: string }) => {
        if (resp.success) toast.success(`Force submitted ${session.fullName}`);
        else toast.error(resp.error ?? "Failed");
      }
    );
  };

  const handleExtend = (minutes: number) => {
    if (!socket || !session || !activeExam) return;
    socket.emit(EVENTS.TEACHER_EXTEND_TIME,
      { examId: activeExam.id, sessionId: session.id, additionalMinutes: minutes },
      (resp: { success: boolean; error?: string }) => {
        if (resp.success) toast.success(`+${minutes} min granted`);
      }
    );
  };

  const handleForgive = (violationId: string) => {
    if (!socket || forgivingId) return;
    setForgivingId(violationId);

    socket.emit(EVENTS.TEACHER_FORGIVE_VIOLATION, { violationId },
      (resp: { success: boolean; data?: { session: StudentSession }; error?: string }) => {
        setForgivingId(null);
        if (resp.success) {
          forgivenViolation(violationId);
          if (resp.data?.session) upsertSession(resp.data.session);
          toast.success("Violation forgiven — points restored");
        } else {
          toast.error(resp.error ?? "Forgive failed");
        }
      }
    );
  };

  const handleForgiveAll = () => {
    const unforgiven = sessionViolations.filter((v) => !v.forgiven);
    if (unforgiven.length === 0) return;
    if (!confirm(`Forgive all ${unforgiven.length} violations for ${session?.fullName}?`)) return;
    for (const v of unforgiven) handleForgive(v.id);
  };

  return (
    <AnimatePresence>
      {selectedId && session && (
        <motion.aside
          key="drawer"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-80 flex-shrink-0 border-l border-[#1F2937] flex flex-col bg-[#0D1424] overflow-hidden"
        >
          {/* ── Header ──────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1F2937]">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{session.fullName}</p>
              <p className="text-xs text-slate-500 font-mono">
                {session.registerNumber} · {session.systemNo}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white p-1 ml-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Stats grid ──────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-[#1F2937]">
            {([
              { label: "Score",      value: `${session.currentScore} pts` },
              { label: "Violations", value: String(session.violationCount) },
              { label: "Difficulty", node: <Badge className={cn("text-[9px]", difficultyBg(session.currentDifficulty))}>{session.currentDifficulty}</Badge> },
              { label: "Status",     node: <Badge className={cn("text-[9px]", statusBadge(session.status))}>{session.status}</Badge> },
            ] as const).map((item: any) => (
              <div key={item.label} className="bg-[#111827] rounded-lg px-3 py-2">
                <p className="text-[10px] text-slate-500 mb-1">{item.label}</p>
                {item.node ?? (
                  <p className="text-sm font-bold text-white tabular-nums">{item.value}</p>
                )}
              </div>
            ))}
          </div>

          {/* ── Controls ────────────────────────────────────── */}
          <div className="px-4 py-3 border-b border-[#1F2937]">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Controls</p>
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="xs" variant="warning" onClick={() => handleExtend(5)}>+5 min</Button>
              <Button size="xs" variant="warning" onClick={() => handleExtend(10)}>+10 min</Button>
              <Button size="xs" variant="danger"  onClick={handleForceSubmit} className="col-span-2">
                Force Submit
              </Button>
            </div>
          </div>

          {/* ── Forensic Timeline ───────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
            {/* Timeline header with Forgive All */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                Timeline
                <span className="ml-1.5 text-slate-600 normal-case">
                  ({sessionViolations.length} events
                  {unforgivenCount > 0 ? `, ${unforgivenCount} active` : ", all forgiven"})
                </span>
              </p>
              {unforgivenCount > 1 && (
                <button
                  onClick={handleForgiveAll}
                  className="text-[9px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded whitespace-nowrap"
                >
                  Forgive All
                </button>
              )}
            </div>

            {sessionViolations.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-2xl block mb-2">✅</span>
                <p className="text-xs text-slate-600 italic">No violations recorded</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessionViolations.map((v) => (
                  <ViolationEntry
                    key={v.id}
                    violation={v}
                    onForgive={() => handleForgive(v.id)}
                    forgiving={forgivingId === v.id}
                  />
                ))}
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
