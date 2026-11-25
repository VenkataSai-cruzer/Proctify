// ============================================================
// SecureAssess Teacher Desktop — Dashboard (Exam List)
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AppShell } from "../components/layout/AppShell";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { useAuthStore } from "../store/authStore";
import { useExamStore } from "../store/examStore";
import { api } from "../lib/api";
import { cn, statusBadge, formatDateShort } from "../lib/utils";
import toast from "react-hot-toast";
import type { Exam } from "@secureassess/shared";

function NewExamModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (e: Exam) => void }) {
  const [form, setForm] = useState({
    title: "", subject: "", durationMinutes: 60,
    passMarkPercent: 50, disqualifyThreshold: 3, strictSeatBinding: true,
    lockdownMode: "KIOSK" as "KIOSK" | "WINDOWED",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.subject) { toast.error("Title and subject are required"); return; }
    setLoading(true);
    try {
      const { exam } = await api.post<{ exam: Exam }>("/api/exam", form);
      toast.success("Exam created");
      onCreated(exam);
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create exam");
    } finally { setLoading(false); }
  };

  const field = (label: string, key: keyof typeof form, type = "text", placeholder = "") => (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <input
        type={type} placeholder={placeholder}
        value={String(form[key])}
        onChange={(e) => setForm((f) => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
        className="w-full bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cobalt-500"
      />
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="New Exam" size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        {field("Exam Title", "title", "text", "e.g. Mid-Term Examination")}
        {field("Subject", "subject", "text", "e.g. Data Structures")}
        <div className="grid grid-cols-2 gap-3">
          {field("Duration (min)", "durationMinutes", "number")}
          {field("Pass Mark (%)", "passMarkPercent", "number")}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-400">Strict Seat Binding</label>
          <button type="button" onClick={() => setForm((f) => ({ ...f, strictSeatBinding: !f.strictSeatBinding }))}
            className={cn("relative w-9 h-5 rounded-full transition-colors", form.strictSeatBinding ? "bg-cobalt-500" : "bg-[#374151]")}>
            <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all", form.strictSeatBinding ? "right-0.5" : "left-0.5")} />
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1.5">Lockdown Mode</label>
          <div className="flex gap-2">
            {(["KIOSK", "WINDOWED"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setForm((f) => ({ ...f, lockdownMode: m }))}
                className={cn("flex-1 py-2 rounded-lg text-xs font-semibold transition-all",
                  form.lockdownMode === m ? "bg-cobalt-500 text-white" : "bg-[#1F2937] text-slate-400 hover:text-white")}>
                {m === "KIOSK" ? "🔒 Kiosk Lock" : "🪟 Windowed"}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 mt-1">
            {form.lockdownMode === "KIOSK" ? "OS-level fullscreen — no Alt+Tab, no task switching." : "Normal window — all browser anti-cheat active, blur events logged."}
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Create Exam</Button>
        </div>
      </form>
    </Modal>
  );
}

function ExamRow({ exam, onClick }: { exam: Exam; onClick: () => void }) {
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={onClick}
      className="flex items-center gap-4 px-5 py-3.5 border-b border-[#1F2937] hover:bg-white/[0.02] cursor-pointer transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white group-hover:text-cobalt-400 transition-colors truncate">
          {exam.title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{exam.subject}</p>
      </div>
      <div className="flex items-center gap-4 text-xs flex-shrink-0">
        <span className="text-slate-500 hidden sm:inline">{exam.durationMinutes} min</span>
        <Badge className={cn("text-[9px]", statusBadge(exam.status))} dot>{exam.status}</Badge>
        <span className="text-slate-600 hidden md:inline">{formatDateShort(exam.updatedAt)}</span>
        <span className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const navigate    = useNavigate();
  const teacher     = useAuthStore((s) => s.teacher);
  const labMode     = useAuthStore((s) => s.labMode);
  const exams       = useExamStore((s) => s.exams);
  const setExams    = useExamStore((s) => s.setExams);
  const setActiveExam = useExamStore((s) => s.setActiveExam);
  const [newOpen, setNewOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ exams: Exam[] }>("/api/exam")
      .then(({ exams }) => setExams(exams))
      .catch(() => toast.error("Failed to load exams"))
      .finally(() => setLoading(false));
  }, []);

  const handleExamClick = (exam: Exam) => {
    setActiveExam(exam);
    navigate(`/exam/${exam.id}`);
  };

  const handleCreated = (exam: Exam) => {
    setExams([exam, ...exams]);
    setActiveExam(exam);
    navigate(`/exam/${exam.id}`);
  };

  const stats = {
    total: exams.length,
    active: exams.filter((e) => e.status === "ACTIVE").length,
    draft: exams.filter((e) => e.status === "DRAFT").length,
    completed: exams.filter((e) => e.status === "COMPLETED").length,
  };

  return (
    <AppShell
      title={`Welcome, ${teacher?.name?.split(" ")[0] ?? "Teacher"}`}
      subtitle={labMode === "HOME" ? "Home Mode — Offline" : "Connected to Lab Server"}
      actions={<Button onClick={() => setNewOpen(true)} size="sm">+ New Exam</Button>}
    >
      <div className="p-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Exams", value: stats.total, color: "text-white" },
            { label: "Active", value: stats.active, color: "text-emerald-400" },
            { label: "Draft", value: stats.draft, color: "text-slate-400" },
            { label: "Completed", value: stats.completed, color: "text-cobalt-400" },
          ].map((s) => (
            <Card key={s.label} className="px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={cn("text-2xl font-bold tabular-nums", s.color)}>{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Exam list */}
        <Card>
          <CardHeader
            title="All Exams"
            actions={<Button size="xs" variant="secondary" onClick={() => setNewOpen(true)}>+ New</Button>}
          />
          {loading ? (
            <div className="p-8 flex justify-center">
              <svg className="animate-spin w-5 h-5 text-cobalt-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : exams.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-slate-500 text-sm">No exams yet.</p>
              <Button className="mt-3" onClick={() => setNewOpen(true)}>Create your first exam</Button>
            </div>
          ) : (
            exams.map((e) => <ExamRow key={e.id} exam={e} onClick={() => handleExamClick(e)} />)
          )}
        </Card>
      </div>

      <NewExamModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={handleCreated} />
    </AppShell>
  );
}
