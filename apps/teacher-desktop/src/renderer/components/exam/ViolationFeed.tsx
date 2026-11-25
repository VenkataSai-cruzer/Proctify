// ============================================================
// SecureAssess — Live Violation Alert Feed (right panel strip)
// ============================================================

import { useExamStore } from "../../store/examStore";
import { cn, formatDateTime } from "../../lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import type { ViolationEvent } from "@secureassess/shared";

const SOURCE_ICON: Record<string, string> = { CCTV: "📷", CLIENT: "🖥" };
const TYPE_SHORT: Record<string, string> = {
  HEAD_TURN_LEFT: "Head Left",
  HEAD_TURN_RIGHT: "Head Right",
  HEAD_DOWN: "Head Down",
  MULTIPLE_FACES: "Multi-Face",
  SEAT_EMPTY: "Seat Empty",
  TAB_SWITCH: "Tab Switch",
  WINDOW_BLUR: "Win Blur",
  DEVTOOLS_DETECTED: "DevTools",
  MULTI_TAB_DETECTED: "Multi-Tab",
  CLIPBOARD_ACCESS: "Clipboard",
  PRINT_SCREEN: "Screenshot",
  FULLSCREEN_EXIT: "Fullscreen",
  PROCESS_DETECTED: "Proc Detect",
};

function ViolationRow({ v }: { v: ViolationEvent }) {
  const sessions = useExamStore((s) => s.sessions);
  const session  = sessions.find((s) => s.id === v.sessionId);
  const setSelected = useExamStore((s) => s.setSelectedSession);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "flex items-start gap-2.5 px-3 py-2.5 border-b border-[#1F2937] hover:bg-white/[0.02] cursor-pointer transition-colors",
        v.forgiven && "opacity-40"
      )}
      onClick={() => setSelected(v.sessionId)}
    >
      <div className="flex-shrink-0 mt-0.5">
        <span className="text-sm">{SOURCE_ICON[v.source] ?? "⚠"}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs font-semibold text-amber-400 truncate">
            {session?.systemNo ?? "—"} · {session?.fullName?.split(" ")[0] ?? "Unknown"}
          </p>
          <span className="text-[9px] text-slate-500 tabular-nums flex-shrink-0">
            {formatDateTime(v.timestamp)}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {TYPE_SHORT[v.violationType] ?? v.violationType.replace(/_/g, " ")}
          {v.confidence < 1 && (
            <span className="text-slate-600 ml-1">({Math.round(v.confidence * 100)}%)</span>
          )}
          {v.forgiven && <span className="text-emerald-500 ml-1">· Forgiven</span>}
        </p>
      </div>
    </motion.div>
  );
}

export function ViolationFeed() {
  const violations = useExamStore((s) => s.violations);
  const recent     = violations.slice(0, 60);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-[#1F2937] flex items-center justify-between flex-shrink-0">
        <p className="text-xs font-semibold text-white">
          Violations
          {violations.length > 0 && (
            <span className="ml-1.5 text-[10px] font-normal text-slate-500">({violations.length})</span>
          )}
        </p>
        {violations.some((v) => !v.forgiven) && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence>
          {recent.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-6 italic">No violations yet</p>
          ) : (
            recent.map((v) => <ViolationRow key={v.id} v={v} />)
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
