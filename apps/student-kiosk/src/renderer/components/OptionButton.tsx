// ============================================================
// SecureAssess — MCQ Option Button
// Handles: idle, hover, selected, correct, incorrect states
// ============================================================

import { clsx } from "clsx";
import { motion } from "framer-motion";

interface Props {
  index: number;
  text: string;
  selected: boolean;
  feedback: "correct" | "incorrect" | "revealed" | null;
  disabled: boolean;
  onClick: () => void;
}

const LETTERS = ["A", "B", "C", "D"];

export function OptionButton({ index, text, selected, feedback, disabled, onClick }: Props) {
  const letter = LETTERS[index] ?? String(index + 1);

  const containerClass = clsx(
    "w-full text-left flex items-start gap-4 px-5 py-4 rounded-xl border-2 transition-all duration-200 select-none",
    // Base
    "bg-white",
    // States
    !disabled && !feedback && !selected &&
      "border-slate-200 hover:border-cobalt-400 hover:bg-blue-50 cursor-pointer",
    selected && !feedback &&
      "border-cobalt-500 bg-blue-50 cursor-pointer",
    feedback === "correct" &&
      "border-emerald-500 bg-emerald-50 cursor-default",
    feedback === "incorrect" &&
      "border-red-500 bg-red-50 cursor-default",
    feedback === "revealed" &&
      "border-emerald-400 bg-emerald-50/60 cursor-default",
    disabled && !feedback &&
      "border-slate-200 opacity-60 cursor-not-allowed",
  );

  const letterClass = clsx(
    "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors",
    !selected && !feedback && "bg-slate-100 text-slate-500",
    selected && !feedback && "bg-cobalt-500 text-white",
    feedback === "correct"  && "bg-emerald-500 text-white",
    feedback === "incorrect" && "bg-red-500 text-white",
    feedback === "revealed" && "bg-emerald-400 text-white",
  );

  const icon =
    feedback === "correct"  ? "✓" :
    feedback === "incorrect" ? "✗" :
    feedback === "revealed"  ? "✓" :
    letter;

  return (
    <motion.button
      whileHover={!disabled && !feedback ? { x: 3 } : {}}
      whileTap={!disabled && !feedback ? { scale: 0.99 } : {}}
      onClick={disabled || !!feedback ? undefined : onClick}
      className={containerClass}
      type="button"
    >
      <span className={letterClass}>{icon}</span>
      <span className={clsx(
        "flex-1 text-sm leading-relaxed font-medium pt-0.5",
        feedback === "correct"  && "text-emerald-800",
        feedback === "incorrect" && "text-red-700",
        feedback === "revealed" && "text-emerald-700",
        !feedback && "text-slate-700",
      )}>
        {text}
      </span>
    </motion.button>
  );
}
