import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function difficultyColor(d: string) {
  return d === "EASY" ? "text-emerald-400" : d === "MEDIUM" ? "text-amber-400" : "text-red-400";
}

export function difficultyBg(d: string) {
  return d === "EASY"
    ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
    : d === "MEDIUM"
    ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
    : "bg-red-500/15 text-red-400 ring-1 ring-red-500/30";
}

export function statusBadge(s: string) {
  const map: Record<string, string> = {
    WAITING:      "bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/30",
    ACTIVE:       "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30",
    PAUSED:       "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
    SUBMITTED:    "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
    FLAGGED:      "bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30",
    DISQUALIFIED: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
  };
  return map[s] ?? "bg-slate-500/15 text-slate-400";
}

export function clientModeBadge(m: string) {
  return m === "KIOSK"
    ? "bg-cobalt-500/15 text-cobalt-400 ring-1 ring-cobalt-500/30"
    : "bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30";
}
