// ============================================================
// SecureAssess Teacher Desktop — Exam Builder
// Central hub for one exam: tabs for Questions, Roster, Seating,
// Live Monitor, CCTV, Forensic, Exports
// ============================================================

import { useEffect } from "react";
import { useParams, useNavigate, NavLink } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { useExamStore } from "../store/examStore";
import { useTeacherSocket } from "../hooks/useTeacherSocket";
import { EVENTS } from "@secureassess/shared";
import { SaexamPanel } from "../components/exam/SaexamPanel";
import { api } from "../lib/api";
import { cn, statusBadge } from "../lib/utils";
import toast from "react-hot-toast";
import type { Exam } from "@secureassess/shared";

const TABS = [
  { label: "Questions",   to: (id: string) => `/exam/${id}/mcq`,      icon: "📝" },
  { label: "Roster",      to: (id: string) => `/exam/${id}/roster`,   icon: "👥" },
  { label: "Seating",     to: (id: string) => `/exam/${id}/seating`,  icon: "🗺" },
  { label: "CCTV Setup",  to: (id: string) => `/exam/${id}/cctv`,     icon: "📷" },
  { label: "Live",        to: (id: string) => `/exam/${id}/live`,     icon: "⚡" },
  { label: "Forensic",    to: (id: string) => `/exam/${id}/forensic`, icon: "🔍" },
];

export default function ExamBuilderPage() {
  const { id = "" } = useParams();
  const navigate     = useNavigate();
  const { socket }   = useTeacherSocket();
  const activeExam   = useExamStore((s) => s.activeExam);
  const setActiveExam = useExamStore((s) => s.setActiveExam);
  const exams        = useExamStore((s) => s.exams);

  // Load exam if not already in store
  useEffect(() => {
    if (activeExam?.id !== id) {
      api.get<{ exam: Exam }>(`/api/exam/${id}`)
        .then(({ exam }) => setActiveExam(exam))
        .catch(() => { toast.error("Exam not found"); navigate("/"); });
    }
  }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!activeExam) return;
    if (newStatus === "ACTIVE" && socket) {
      socket.emit(EVENTS.TEACHER_OPEN_LOBBY, { examId: activeExam.id }, (resp: any) => {
        if (!resp.success) toast.error(resp.error ?? "Failed");
        else toast.success("Lobby opened — students can now log in");
      });
    }
    try {
      const { exam } = await api.patch<{ exam: Exam }>(`/api/exam/${id}/status`, { status: newStatus });
      setActiveExam(exam);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this exam? This cannot be undone.")) return;
    try {
      await api.delete(`/api/exam/${id}`);
      setActiveExam(null);
      navigate("/");
    } catch (err: any) { toast.error(err.message); }
  };

  const exam = activeExam?.id === id ? activeExam : exams.find((e) => e.id === id);

  const nextAction =
    exam?.status === "DRAFT"      ? { label: "Publish", status: "PUBLISHED",  variant: "secondary" as const } :
    exam?.status === "PUBLISHED"  ? { label: "Open Lobby & Start", status: "ACTIVE", variant: "primary" as const } :
    exam?.status === "ACTIVE"     ? { label: "Pause Exam", status: "PAUSED",  variant: "warning" as const } :
    exam?.status === "PAUSED"     ? { label: "Resume Exam", status: "ACTIVE", variant: "success" as const } :
    null;

  return (
    <AppShell
      title={exam?.title ?? "Loading…"}
      subtitle={exam?.subject}
      actions={
        <div className="flex items-center gap-2">
          {exam && <Badge className={cn("text-xs", statusBadge(exam.status))} dot>{exam.status}</Badge>}
          {nextAction && (
            <Button size="sm" variant={nextAction.variant} onClick={() => handleStatusChange(nextAction.status)}>
              {nextAction.label}
            </Button>
          )}
          {exam?.status === "ACTIVE" && (
            <Button size="sm" variant="primary" onClick={() => navigate(`/exam/${id}/live`)}>
              Live Monitor →
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleDelete} className="text-red-500 hover:text-red-400">
            Delete
          </Button>
        </div>
      }
    >
      {/* Tab bar */}
      <div className="border-b border-[#1F2937] flex gap-0 px-5 overflow-x-auto">
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to(id)}
            className={({ isActive }) => cn(
              "flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
              isActive
                ? "border-cobalt-500 text-cobalt-400"
                : "border-transparent text-slate-500 hover:text-slate-300 hover:border-[#374151]"
            )}
          >
            <span>{tab.icon}</span> {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Overview when no sub-route active */}
      <div className="p-5">
        {exam ? (
          <div className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Duration", value: `${exam.durationMinutes} min` },
                { label: "Pass Mark", value: `${exam.passMarkPercent}%` },
                { label: "Violation Limit", value: exam.disqualifyThreshold },
                { label: "Seat Binding", value: exam.strictSeatBinding ? "Strict" : "Open" },
                { label: "Lockdown Mode", value: (exam as any).lockdownMode ?? "KIOSK" },
                { label: "Last Updated", value: formatDateLong(exam.updatedAt) },
              ].map((item) => (
                <div key={item.label} className="bg-[#111827] border border-[#1F2937] rounded-xl px-4 py-3">
                  <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                  <p className="text-sm font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
            <SaexamPanel examId={id} />
          </div>
        ) : (
          <div className="flex justify-center py-10">
            <svg className="animate-spin w-5 h-5 text-cobalt-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function formatDateLong(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
