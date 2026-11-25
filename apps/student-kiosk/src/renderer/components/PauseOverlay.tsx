// ============================================================
// SecureAssess — Exam Paused Full-Screen Overlay
// ============================================================

import { useStudentStore } from "../store/studentStore";
import { motion } from "framer-motion";

export function PauseOverlay() {
  const phase       = useStudentStore((s) => s.phase);
  const pauseReason = useStudentStore((s) => s.pauseReason);

  if (phase !== "PAUSED") return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-40 bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center gap-6"
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="bg-white rounded-2xl p-10 max-w-md text-center shadow-2xl"
      >
        {/* Pause icon */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-600" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-800 mb-2">Exam Paused</h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          {pauseReason || "Your teacher has temporarily paused the exam. Please wait quietly at your seat."}
        </p>
        <p className="mt-5 text-xs text-slate-400">
          The exam will resume automatically when your teacher continues.
        </p>
      </motion.div>
    </motion.div>
  );
}
