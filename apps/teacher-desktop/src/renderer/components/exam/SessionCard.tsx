// ============================================================
// SecureAssess — Live System Grid Card
// Displays one student session in the NOC grid.
// ============================================================

import { cn } from "../../lib/utils";
import { difficultyBg, statusBadge, clientModeBadge } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import { useExamStore } from "../../store/examStore";
import type { StudentSession } from "@secureassess/shared";
import { motion } from "framer-motion";

interface Props {
  session: StudentSession;
  onClick: () => void;
}

export function SessionCard({ session, onClick }: Props) {
  const selectedId = useExamStore((s) => s.selectedSessionId);
  const isSelected = selectedId === session.id;

  const isAlert = session.status === "FLAGGED" || session.status === "DISQUALIFIED" || session.violationCount > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      className={cn(
        "relative bg-[#111827] border rounded-xl p-3 cursor-pointer transition-all",
        isSelected ? "border-cobalt-500/60 ring-1 ring-cobalt-500/30" : "border-[#1F2937] hover:border-[#374151]",
        isAlert && !isSelected && "border-amber-500/30",
        session.status === "DISQUALIFIED" && "border-red-500/40 bg-red-500/5"
      )}
    >
      {/* Alert pulse */}
      {session.status === "DISQUALIFIED" && (
        <span className="absolute top-2 right-2 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
      )}

      {/* System number */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">
            {session.systemNo}
          </span>
          <Badge className={cn("text-[9px]", clientModeBadge(session.clientMode))}>
            {session.clientMode === "KIOSK" ? "🔒 KIOSK LOCKED" : "🌐 BROWSER MODE"}
          </Badge>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <Badge className={cn("text-[9px]", statusBadge(session.status))}>
            {session.status}
          </Badge>
          {/* Lockdown mode badge — derived from exam store */}
          <span className={cn(
            "text-[8px] font-bold px-1.5 py-0.5 rounded",
            (session as any).lockdownMode === "WINDOWED"
              ? "bg-purple-500/15 text-purple-400"
              : "bg-cobalt-500/15 text-cobalt-400"
          )}>
            {(session as any).lockdownMode === "WINDOWED" ? "🪟 WINDOWED" : "🔒 KIOSK"}
          </span>
        </div>
      </div>

      {/* Student name */}
      <p className="text-sm font-semibold text-white truncate leading-tight mb-0.5">
        {session.fullName || "—"}
      </p>
      <p className="text-[10px] text-slate-500 font-mono truncate mb-2">
        {session.registerNumber || "—"}
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-white tabular-nums">
          {session.currentScore} <span className="text-slate-500 font-normal">pts</span>
        </span>
        <Badge className={cn("text-[9px]", difficultyBg(session.currentDifficulty))}>
          {session.currentDifficulty}
        </Badge>
        {session.violationCount > 0 && (
          <div className="flex items-center gap-0.5 ml-auto">
            {[0, 1, 2].map((i) => (
              <span key={i} className={cn(
                "w-1.5 h-1.5 rounded-full",
                i < session.violationCount ? "bg-red-500" : "bg-[#1F2937]"
              )} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
