// ============================================================
// SecureAssess Teacher Desktop — Forensic Report Page
// Per-student incident timeline + exports
// ============================================================

import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { useExamStore } from "../store/examStore";
import { api } from "../lib/api";
import { cn, statusBadge, formatDateTime } from "../lib/utils";
import toast from "react-hot-toast";
import type { ViolationEvent } from "@secureassess/shared";

export default function ForensicPage() {
  const { id = "" } = useParams();
  const sessions  = useExamStore((s) => s.sessions);
  const violations = useExamStore((s) => s.violations);
  const [exporting, setExporting] = useState<"marksheet" | "forensic" | "certs" | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const handleExport = async (type: "marksheet" | "forensic" | "certs") => {
    setExporting(type);
    try {
      if (type === "marksheet") {
        const r = await api.post<{ pdf: string; csv: string }>(`/api/export/${id}/marksheet`);
        toast.success("Marksheet ready");
        window.open(useAuthStoreUrl() + r.pdf);
      } else if (type === "forensic") {
        const r = await api.post<{ pdf: string }>(`/api/export/${id}/forensic`);
        toast.success("Forensic report ready");
        window.open(useAuthStoreUrl() + r.pdf);
      } else {
        await api.post<{ url: string }>(`/api/export/${id}/certificates`);
        toast.success("Certificates ready for download");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Export failed");
    } finally { setExporting(null); }
  };

  const selectedViolations = selectedStudent
    ? violations.filter((v) => v.sessionId === selectedStudent)
    : violations;

  const selectedSession = sessions.find((s) => s.id === selectedStudent);

  return (
    <AppShell title="Forensic Report" subtitle="Per-student incident timeline with CCTV evidence"
      actions={
        <div className="flex gap-2">
          <Button size="xs" variant="secondary" loading={exporting === "marksheet"} onClick={() => handleExport("marksheet")}>
            📊 Marksheet
          </Button>
          <Button size="xs" variant="secondary" loading={exporting === "forensic"} onClick={() => handleExport("forensic")}>
            🔍 Audit PDF
          </Button>
          <Button size="xs" loading={exporting === "certs"} onClick={() => handleExport("certs")}>
            🏅 Certificates
          </Button>
        </div>
      }
    >
      <div className="p-5 grid grid-cols-3 gap-5">
        {/* Student selector */}
        <div className="col-span-1">
          <Card>
            <CardHeader title="Students" subtitle={`${sessions.length} total`} />
            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto divide-y divide-[#1F2937]">
              <div
                onClick={() => setSelectedStudent(null)}
                className={cn("px-4 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors text-xs",
                  !selectedStudent && "bg-cobalt-500/10 text-cobalt-400 font-semibold")}
              >
                All Students ({violations.length} violations)
              </div>
              {sessions.map((s) => {
                const vCount = violations.filter((v) => v.sessionId === s.id).length;
                return (
                  <div key={s.id}
                    onClick={() => setSelectedStudent(s.id)}
                    className={cn(
                      "flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors",
                      selectedStudent === s.id && "bg-cobalt-500/10"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{s.fullName}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{s.registerNumber} · {s.systemNo}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {vCount > 0 && (
                        <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                          {vCount}
                        </span>
                      )}
                      <Badge className={cn("text-[9px]", statusBadge(s.status))}>{s.status}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Timeline */}
        <div className="col-span-2">
          <Card>
            <CardHeader
              title={selectedSession ? `${selectedSession.fullName} — Timeline` : "All Violations Timeline"}
              subtitle={selectedStudent
                ? `Score: ${selectedSession?.currentScore} pts · Violations: ${selectedViolations.length}`
                : `${violations.length} total violations`}
            />
            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto divide-y divide-[#1F2937]">
              {selectedViolations.length === 0 ? (
                <p className="text-xs text-slate-600 italic text-center p-8">No violations recorded</p>
              ) : selectedViolations.map((v) => (
                <ViolationRow key={v.id} v={v} sessions={sessions} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function ViolationRow({ v, sessions }: { v: ViolationEvent; sessions: any[] }) {
  const session = sessions.find((s) => s.id === v.sessionId);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("px-4 py-3 hover:bg-white/[0.02] transition-colors", v.forgiven && "opacity-50")}>
      <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        {/* Source icon */}
        <span className="text-base flex-shrink-0 mt-0.5">{v.source === "CCTV" ? "📷" : "🖥"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={cn("text-xs font-semibold", v.forgiven ? "text-slate-500" : "text-amber-400")}>
              {v.violationType.replace(/_/g, " ")}
            </p>
            <span className="text-[10px] text-slate-600">{v.source}</span>
            {v.confidence < 1 && (
              <span className="text-[10px] text-slate-600">{Math.round(v.confidence * 100)}%</span>
            )}
            {v.forgiven && <span className="text-[9px] text-emerald-500 italic">· Forgiven</span>}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            {session && <span>{session.systemNo} · {session.fullName}</span>}
            <span className="font-mono">{formatDateTime(v.timestamp)}</span>
          </div>
        </div>
        <span className="text-slate-600 text-xs">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && v.snapshotBase64 && (
        <div className="mt-2 ml-9">
          <img
            src={`data:image/jpeg;base64,${v.snapshotBase64}`}
            alt="CCTV snapshot"
            className="rounded-lg max-h-40 object-cover"
          />
        </div>
      )}
    </div>
  );
}

function useAuthStoreUrl(): string {
  try {
    const stored = localStorage.getItem("secureassess-auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.serverUrl ?? "http://localhost:3000";
    }
  } catch {}
  return "http://localhost:3000";
}
