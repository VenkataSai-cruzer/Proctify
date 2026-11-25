// ============================================================
// SecureAssess Teacher Desktop — Roster Upload Page
// ============================================================

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Card, CardHeader } from "../components/ui/Card";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";

interface RosterEntry { id: string; fullName: string; registerNumber: string; year: string; }

export default function RosterPage() {
  const { id = "" }   = useParams();
  const [roster, setRoster]     = useState<RosterEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch]     = useState("");

  const loadRoster = async () => {
    setLoading(true);
    try {
      const { roster } = await api.get<{ roster: RosterEntry[] }>(`/api/roster/${id}`);
      setRoster(roster);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadRoster(); }, [id]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("roster", file);
      const { count } = await api.upload<{ count: number }>(`/api/roster/${id}/upload`, form);
      toast.success(`${count} students imported`);
      await loadRoster();
    } catch (err: any) { toast.error(err.message); }
    finally { setUploading(false); }
  };

  const filtered = roster.filter((r) =>
    r.fullName.toLowerCase().includes(search.toLowerCase()) ||
    r.registerNumber.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell title="Student Roster" subtitle={`${roster.length} students`}>
      <div className="p-5 space-y-4">
        <Card>
          <CardHeader title="Upload Roster" subtitle="CSV or XLSX with columns: Full Name, Register Number, Year" />
          <div className="p-4">
            <label className={cn(
              "flex items-center justify-center gap-3 border-2 border-dashed rounded-xl px-6 py-5 cursor-pointer transition-colors",
              uploading ? "border-cobalt-500/50 bg-cobalt-500/5" : "border-[#374151] hover:border-cobalt-500/40"
            )}>
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
              {uploading ? (
                <><svg className="animate-spin w-5 h-5 text-cobalt-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg><span className="text-sm text-cobalt-400">Uploading…</span></>
              ) : (
                <><span className="text-2xl">📄</span>
                  <div>
                    <p className="text-sm text-slate-300 font-medium">Drop CSV / XLSX here</p>
                    <p className="text-xs text-slate-500 mt-0.5">Columns: Full Name, Register Number, Year</p>
                  </div></>
              )}
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title={`Students (${filtered.length})`}
            actions={
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                className="bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cobalt-500 w-44"
                placeholder="Search…" />
            }
          />
          {loading ? (
            <div className="p-8 flex justify-center"><svg className="animate-spin w-5 h-5 text-cobalt-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1F2937]">
                    {["#", "Name", "Register Number", "Year"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-6 text-slate-600 italic">No students found</td></tr>
                  ) : filtered.map((r, i) => (
                    <tr key={r.id} className="border-b border-[#1F2937]/50 hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-slate-600 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-2.5 text-white font-medium">{r.fullName}</td>
                      <td className="px-4 py-2.5 text-slate-300 font-mono">{r.registerNumber}</td>
                      <td className="px-4 py-2.5 text-slate-400">{r.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
