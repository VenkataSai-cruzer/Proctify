// ============================================================
// SecureAssess Teacher Desktop — Live NOC Monitor
// Real-time system grid + CCTV PiP + violation feed + controls
// ============================================================

import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { SessionCard } from "../components/exam/SessionCard";
import { SessionDrawer } from "../components/exam/SessionDrawer";
import { CctvPip } from "../components/exam/CctvPip";
import { ViolationFeed } from "../components/exam/ViolationFeed";
import { useExamStore } from "../store/examStore";
import { useTeacherSocket } from "../hooks/useTeacherSocket";
import { EVENTS } from "@secureassess/shared";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";

function ExamControls() {
  const { socket }  = useTeacherSocket();
  const activeExam  = useExamStore((s) => s.activeExam);
  const navigate    = useNavigate();

  const emit = (event: string, payload: object, msg: string) => {
    if (!socket || !activeExam) return;
    socket.emit(event, { examId: activeExam.id, ...payload }, (resp: any) => {
      if (resp.success) toast.success(msg);
      else toast.error(resp.error ?? "Failed");
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="xs" variant="primary"
        onClick={() => emit(EVENTS.TEACHER_START_EXAM, {}, "Exam started for all students")}>
        ▶ Start All
      </Button>
      <Button size="xs" variant="warning"
        onClick={() => emit(EVENTS.TEACHER_PAUSE_EXAM, {}, "Exam paused")}>
        ⏸ Pause
      </Button>
      <Button size="xs" variant="success"
        onClick={() => emit(EVENTS.TEACHER_RESUME_EXAM, {}, "Exam resumed")}>
        ▶ Resume
      </Button>
      <Button size="xs" variant="secondary"
        onClick={() => navigate(`/projector`)}>
        📺 Projector
      </Button>
    </div>
  );
}

function StatsBar() {
  const sessions = useExamStore((s) => s.sessions);

  const stats = {
    total:        sessions.length,
    active:       sessions.filter((s) => s.status === "ACTIVE").length,
    submitted:    sessions.filter((s) => s.status === "SUBMITTED").length,
    flagged:      sessions.filter((s) => s.violationCount > 0 && s.status !== "DISQUALIFIED").length,
    disqualified: sessions.filter((s) => s.status === "DISQUALIFIED").length,
    avgScore:     sessions.length
      ? Math.round(sessions.reduce((acc, s) => acc + s.currentScore, 0) / sessions.length)
      : 0,
  };

  return (
    <div className="flex items-center gap-4 px-5 py-2 border-b border-[#1F2937] flex-shrink-0 overflow-x-auto">
      {[
        { label: "Students", value: stats.total, color: "text-white" },
        { label: "Active", value: stats.active, color: "text-emerald-400" },
        { label: "Submitted", value: stats.submitted, color: "text-cobalt-400" },
        { label: "Flagged", value: stats.flagged, color: "text-amber-400" },
        { label: "Disqualified", value: stats.disqualified, color: "text-red-400" },
        { label: "Avg Score", value: `${stats.avgScore} pts`, color: "text-slate-300" },
      ].map((s) => (
        <div key={s.label} className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-slate-500">{s.label}</span>
          <span className={cn("text-sm font-bold tabular-nums", s.color)}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function LiveMonitorPage() {
  const { id = "" } = useParams();
  const { socket }  = useTeacherSocket();
  const sessions    = useExamStore((s) => s.sessions);
  const setSessions = useExamStore((s) => s.setSessions);
  const selectedId  = useExamStore((s) => s.selectedSessionId);
  const setSelected = useExamStore((s) => s.setSelectedSession);

  // Request initial grid on mount
  useEffect(() => {
    if (!socket || !id) return;
    socket.emit(EVENTS.TEACHER_REQUEST_GRID, { examId: id }, (resp: any) => {
      if (resp.success) setSessions(resp.data.sessions);
    });
  }, [id, socket]);

  // Poll leaderboard every 15s for projector
  useEffect(() => {
    if (!socket || !id) return;
    const pollLeaderboard = () => {
      socket.emit(EVENTS.TEACHER_REQUEST_LEADERBOARD, { examId: id }, () => {});
    };
    pollLeaderboard();
    const t = setInterval(pollLeaderboard, 15_000);
    return () => clearInterval(t);
  }, [id, socket]);

  const sortedSessions = [...sessions].sort((a, b) => {
    // Active first, then by system number
    if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
    if (b.status === "ACTIVE" && a.status !== "ACTIVE") return 1;
    return a.systemNo.localeCompare(b.systemNo);
  });

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B1120] text-white">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex-shrink-0 h-12 border-b border-[#1F2937] flex items-center justify-between px-5 gap-4">
          <p className="text-sm font-semibold text-white">Live Monitor</p>
          <ExamControls />
        </div>

        <StatsBar />

        {/* Grid + right panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* System grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#1F2937] flex items-center justify-center">
                  <span className="text-2xl">🖥</span>
                </div>
                <p className="text-slate-500 text-sm">Waiting for students to log in…</p>
                <p className="text-slate-600 text-xs">Make sure the exam lobby is open and students can reach the server.</p>
              </div>
            ) : (
              <div className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                {sortedSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onClick={() => setSelected(selectedId === session.id ? null : session.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right sidebar: CCTV PiP + violation feed */}
          <div className="w-64 flex-shrink-0 border-l border-[#1F2937] flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#1F2937]">
              <CctvPip />
            </div>
            <div className="flex-1 overflow-hidden">
              <ViolationFeed />
            </div>
          </div>
        </div>
      </div>

      {/* Session detail drawer */}
      <SessionDrawer />
    </div>
  );
}
