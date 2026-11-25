// ============================================================
// SecureAssess Teacher Desktop — App Shell (Sidebar + Topbar)
// ============================================================

import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useExamStore } from "../../store/examStore";
import { cn } from "../../lib/utils";
import type { ReactNode } from "react";
import { UpdaterBanner } from "../ui/UpdaterBanner";

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

const NAV_ITEMS = [
  { to: "/", icon: "⬛", label: "Dashboard", exact: true },
  { to: "/machines", icon: "🖥", label: "Lab Machines" },
  { to: "/settings", icon: "⚙", label: "Settings" },
];

function ModeTag() {
  const labMode = useAuthStore((s) => s.labMode);
  const labels = { HOME: "Home Mode", LAB_SERVER: "Lab Server", LAB_CLIENT: "Lab Client" };
  const colors = {
    HOME: "bg-slate-700 text-slate-300",
    LAB_SERVER: "bg-cobalt-500/20 text-cobalt-400 ring-1 ring-cobalt-500/30",
    LAB_CLIENT: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide", colors[labMode])}>
      {labels[labMode]}
    </span>
  );
}

export function AppShell({ children, title, subtitle, actions }: Props) {
  const navigate = useNavigate();
  const teacher  = useAuthStore((s) => s.teacher);
  const logout   = useAuthStore((s) => s.logout);
  const exams    = useExamStore((s) => s.exams);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B1120] text-white">
      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-[#1F2937] bg-[#0D1424]">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[#1F2937]">
          <div className="w-7 h-7 rounded-lg bg-cobalt-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-tight">SecureAssess</p>
            <ModeTag />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.exact}
              className={({ isActive }) => cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-cobalt-500/20 text-cobalt-400"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}>
              <span className="text-base w-4 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {/* Exam list */}
          {exams.length > 0 && (
            <div className="pt-3">
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                Exams
              </p>
              {exams.slice(0, 8).map((exam) => (
                <NavLink key={exam.id} to={`/exam/${exam.id}`}
                  className={({ isActive }) => cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors truncate",
                    isActive
                      ? "bg-cobalt-500/20 text-cobalt-400"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full flex-shrink-0",
                    exam.status === "ACTIVE" ? "bg-emerald-400 animate-pulse"
                      : exam.status === "PAUSED" ? "bg-amber-400"
                      : exam.status === "COMPLETED" ? "bg-slate-500"
                      : "bg-slate-600"
                  )} />
                  <span className="truncate">{exam.title}</span>
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        {/* Teacher profile */}
        <div className="border-t border-[#1F2937] px-3 py-3 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-cobalt-500/20 ring-1 ring-cobalt-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-cobalt-400 text-xs font-bold">
              {teacher?.name?.[0]?.toUpperCase() ?? "T"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-white truncate">{teacher?.name}</p>
            <p className="text-[10px] text-slate-500 truncate">{teacher?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-slate-500 hover:text-red-400 transition-colors p-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex-shrink-0 h-12 border-b border-[#1F2937] flex items-center px-5 gap-4">
          <div className="flex-1 min-w-0">
            {title && (
              <div className="flex items-baseline gap-2.5">
                <h1 className="text-sm font-semibold text-white truncate">{title}</h1>
                {subtitle && <span className="text-xs text-slate-500 truncate hidden sm:inline">{subtitle}</span>}
              </div>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </header>

        {/* Updater banner */}
        <UpdaterBanner />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
