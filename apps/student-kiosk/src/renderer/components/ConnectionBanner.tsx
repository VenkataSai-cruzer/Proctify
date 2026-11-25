// ============================================================
// SecureAssess — LAN Connection Status Banner
// Shows a subtle reconnecting bar when socket drops.
// ============================================================

import { useStudentStore } from "../store/studentStore";
import { motion, AnimatePresence } from "framer-motion";

export function ConnectionBanner() {
  const connected = useStudentStore((s) => s.connected);
  const phase     = useStudentStore((s) => s.phase);

  // Only show during active exam phases
  const isExamPhase = ["ACTIVE", "REVIEW", "PAUSED", "COUNTDOWN"].includes(phase);

  return (
    <AnimatePresence>
      {!connected && isExamPhase && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 32, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="w-full bg-amber-500 overflow-hidden"
        >
          <div className="h-full flex items-center justify-center gap-2">
            <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
            <p className="text-white text-xs font-medium">
              Connection lost — your answers are saved locally. Reconnecting…
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
