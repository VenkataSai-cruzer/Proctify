import { cn } from "../../lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
type Size    = "xs" | "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

import type { ReactNode } from "react";

const VARIANTS: Record<Variant, string> = {
  primary:   "bg-cobalt-500 hover:bg-cobalt-600 text-white shadow-sm",
  secondary: "bg-[#1F2937] hover:bg-[#374151] text-slate-300 border border-[#374151]",
  ghost:     "hover:bg-white/5 text-slate-400 hover:text-white",
  danger:    "bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30",
  success:   "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30",
  warning:   "bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30",
};

const SIZES: Record<Size, string> = {
  xs: "px-2.5 py-1 text-xs rounded-md gap-1.5",
  sm: "px-3 py-1.5 text-xs rounded-lg gap-2",
  md: "px-4 py-2 text-sm rounded-lg gap-2",
};

export function Button({ variant = "primary", size = "sm", loading, icon, children, className, disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150 select-none",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        VARIANTS[variant], SIZES[size], className
      )}
    >
      {loading ? (
        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon}
      {children}
    </button>
  );
}
