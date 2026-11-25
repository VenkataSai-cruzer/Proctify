// ============================================================
// SecureAssess — Difficulty Tier-Up Animation Badge
// Mounts briefly when student advances to a higher tier.
// ============================================================

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { useStudentStore } from "../store/studentStore";

const TIER_CONFIG = {
  MEDIUM: {
    label: "Level Up!",
    sub: "Moving to Medium difficulty",
    emoji: "🔥",
    bg: "bg-amber-500",
    ring: "ring-amber-300",
  },
  HARD: {
    label: "Expert Mode!",
    sub: "Moving to Hard difficulty",
    emoji: "⚡",
    bg: "bg-red-500",
    ring: "ring-red-300",
  },
};

export function TierUpBadge() {
  const adaptiveState = useStudentStore((s) => s.adaptiveState);
  const [shown, setShown]       = useState<"MEDIUM" | "HARD" | null>(null);
  const [prevTier, setPrevTier] = useState<string | null>(null);

  useEffect(() => {
    if (!adaptiveState) return;
    const current = adaptiveState.highestTierReached;
    if (prevTier && prevTier !== current && (current === "MEDIUM" || current === "HARD")) {
      setShown(current);
      const t = setTimeout(() => setShown(null), 3000);
      return () => clearTimeout(t);
    }
    setPrevTier(current);
  }, [adaptiveState?.highestTierReached]);

  const config = shown ? TIER_CONFIG[shown] : null;

  return (
    <AnimatePresence>
      {shown && config && (
        <motion.div
          key={shown}
          initial={{ scale: 0.5, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: -20 }}
          transition={{ type: "spring", stiffness: 350, damping: 20 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div className={clsx(
            "flex items-center gap-3 px-6 py-4 rounded-2xl text-white shadow-2xl ring-4",
            config.bg, config.ring
          )}>
            <span className="text-3xl">{config.emoji}</span>
            <div>
              <p className="font-bold text-lg leading-tight">{config.label}</p>
              <p className="text-sm opacity-80">{config.sub}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
