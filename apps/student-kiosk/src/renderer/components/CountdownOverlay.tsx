// ============================================================
// SecureAssess — Pre-Exam Countdown Overlay
// Full-screen overlay shown for 10 seconds before questions start
// ============================================================

import { useStudentStore } from "../store/studentStore";
import { motion, AnimatePresence } from "framer-motion";

export function CountdownOverlay() {
  const phase           = useStudentStore((s) => s.phase);
  const countdownSeconds = useStudentStore((s) => s.countdownSeconds);
  const examTitle       = useStudentStore((s) => s.examTitle);

  if (phase !== "COUNTDOWN") return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-slate-900 flex flex-col items-center justify-center gap-6"
      >
        <motion.p
          className="text-slate-400 text-sm tracking-widest uppercase"
        >
          {examTitle}
        </motion.p>

        <motion.div
          key={countdownSeconds}
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="relative flex items-center justify-center"
        >
          {/* Circular track */}
          <svg className="absolute w-48 h-48 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#1F2937" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="44" fill="none"
              stroke="#3B82F6" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 44}`}
              strokeDashoffset={`${2 * Math.PI * 44 * (1 - countdownSeconds / 10)}`}
              className="transition-all duration-900"
            />
          </svg>
          <span className="text-7xl font-bold text-white tabular-nums z-10">
            {countdownSeconds}
          </span>
        </motion.div>

        <div className="text-center">
          <p className="text-white text-xl font-semibold">Get Ready!</p>
          <p className="text-slate-400 text-sm mt-1">
            Your exam starts in {countdownSeconds} second{countdownSeconds !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex gap-6 mt-4 text-slate-500 text-xs">
          <span>📱 Phones prohibited</span>
          <span>👀 CCTV is active</span>
          <span>🔒 Screen is monitored</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
