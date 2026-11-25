// ============================================================
// SecureAssess — Violation Warning Toast Overlay
// Appears as a persistent top banner when a violation fires.
// Auto-dismisses after 5 s (store clears the warning).
// ============================================================

import { useStudentStore } from "../store/studentStore";
import { AnimatePresence, motion } from "framer-motion";
import { clsx } from "clsx";

export function ViolationToast() {
  const warning = useStudentStore((s) => s.violationWarning);
  const clear   = useStudentStore((s) => s.setViolationWarning);
  const disqualifyThreshold = useStudentStore((s) => s.disqualifyThreshold);

  const isTimerWarning = warning?.id.startsWith("time-warn");
  const isLastWarning  = !isTimerWarning && warning && warning.remaining === 1;
  const isFinal        = !isTimerWarning && warning && warning.remaining === 0;

  return (
    <AnimatePresence>
      {warning && (
        <motion.div
          key={warning.id}
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className={clsx(
            "fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-4 px-6 py-3 shadow-lg",
            isTimerWarning
              ? "bg-amber-500 text-white"
              : isFinal || isLastWarning
                ? "bg-red-600 text-white"
                : "bg-amber-500 text-white"
          )}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">
              {isTimerWarning ? "⏱" : isFinal ? "🚫" : "⚠️"}
            </span>
            <div>
              <p className="font-semibold text-sm leading-tight">
                {warning.message}
              </p>
              {!isTimerWarning && (
                <p className="text-xs opacity-80 mt-0.5">
                  {warning.remaining > 0
                    ? `${warning.remaining} warning${warning.remaining === 1 ? "" : "s"} remaining before disqualification`
                    : "You have been disqualified from this exam."}
                </p>
              )}
            </div>
          </div>
          {!isFinal && (
            <button
              onClick={() => clear(null)}
              className="flex-shrink-0 text-white/70 hover:text-white text-xl leading-none"
              aria-label="Dismiss"
            >
              ✕
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
