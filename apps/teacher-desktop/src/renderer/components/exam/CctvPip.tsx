// ============================================================
// SecureAssess — CCTV Picture-in-Picture Feed
// ============================================================

import { useExamStore } from "../../store/examStore";
import { cn } from "../../lib/utils";
import { motion } from "framer-motion";

export function CctvPip() {
  const frame       = useExamStore((s) => s.cctvFrame);
  const connected   = useExamStore((s) => s.cctvConnected);
  const pipVisible  = useExamStore((s) => s.cctvPipVisible);
  const toggle      = useExamStore((s) => s.toggleCctvPip);

  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1F2937]">
        <div className="flex items-center gap-2">
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
          )} />
          <span className="text-xs font-medium text-slate-300">CCTV Feed</span>
          {connected && (
            <span className="text-[9px] text-slate-500 font-mono">LIVE</span>
          )}
        </div>
        <button onClick={toggle} className="text-slate-500 hover:text-white text-[10px] transition-colors">
          {pipVisible ? "▲ Hide" : "▼ Show"}
        </button>
      </div>

      {/* Feed */}
      <motion.div
        initial={false}
        animate={{ height: pipVisible ? "auto" : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="overflow-hidden"
      >
        {frame && connected ? (
          <img
            src={`data:image/jpeg;base64,${frame}`}
            alt="Live CCTV feed"
            className="w-full object-cover"
            style={{ imageRendering: "auto" }}
          />
        ) : (
          <div className="h-32 flex flex-col items-center justify-center gap-2">
            <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15 10l4.553-2.069A1 1 0 0121 8.869v6.262a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-xs text-slate-600">
              {connected ? "Waiting for feed…" : "CCTV service not connected"}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
