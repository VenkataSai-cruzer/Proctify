// ============================================================
// SecureAssess Teacher Desktop — Seating Allocation Page
// Anti-adjacency shuffle + visual grid + PDF export
// ============================================================

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";

interface Allocation {
  id: string;
  systemNo: string;
  roster: { fullName: string; registerNumber: string; year: string };
  machine: { row: number; col: number };
}

export default function SeatingPage() {
  const { id = "" } = useParams();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading]   = useState(true);
  const [shuffling, setShuffling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { allocations } = await api.get<{ allocations: Allocation[] }>(`/api/roster/${id}/allocations`);
      setAllocations(allocations);
    } catch { /* empty first time */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const handleShuffle = async () => {
    setShuffling(true);
    try {
      const { allocations } = await api.post<{ allocations: Allocation[] }>(`/api/roster/${id}/allocate`);
      setAllocations(allocations);
      toast.success(`${allocations.length} seats allocated with anti-adjacency constraint`);
    } catch (err: any) { toast.error(err.message); }
    finally { setShuffling(false); }
  };

  // Build a grid layout from row/col
  const maxRow = allocations.reduce((m, a) => Math.max(m, a.machine.row), 0);
  const maxCol = allocations.reduce((m, a) => Math.max(m, a.machine.col), 0);
  const grid: (Allocation | null)[][] = Array.from({ length: maxRow + 1 }, (_, r) =>
    Array.from({ length: maxCol + 1 }, (_, c) =>
      allocations.find((a) => a.machine.row === r && a.machine.col === c) ?? null
    )
  );

  return (
    <AppShell title="Seating Allocation"
      subtitle="Anti-adjacency constraint — consecutive register numbers are never placed adjacent"
      actions={
        <Button onClick={handleShuffle} loading={shuffling}>
          🔀 Shuffle Seats
        </Button>
      }
    >
      <div className="p-5 space-y-4">
        {loading ? (
          <div className="flex justify-center py-10"><svg className="animate-spin w-5 h-5 text-cobalt-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
        ) : allocations.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-slate-500 text-sm">No seating allocated yet.</p>
            <p className="text-slate-600 text-xs">Make sure you've uploaded a roster and registered lab machines first.</p>
            <Button onClick={handleShuffle} loading={shuffling}>Generate Seating Plan</Button>
          </div>
        ) : (
          <>
            {/* Visual grid */}
            <Card>
              <CardHeader title="Classroom Seating Map" subtitle={`${allocations.length} seats allocated`} />
              <div className="p-5 overflow-x-auto">
                <div className="inline-block">
                  {/* Teacher desk indicator */}
                  <div className="flex justify-center mb-4">
                    <div className="bg-cobalt-500/20 border border-cobalt-500/30 rounded-lg px-6 py-2 text-xs font-semibold text-cobalt-400">
                      TEACHER'S DESK
                    </div>
                  </div>
                  <div className="space-y-3">
                    {grid.map((row, ri) => (
                      <div key={ri} className="flex gap-3">
                        {row.map((cell, ci) => (
                          <div key={ci} className={cn(
                            "w-32 rounded-xl border p-2.5 flex flex-col gap-1 flex-shrink-0",
                            cell ? "bg-[#111827] border-[#374151]" : "bg-[#0B1120] border-[#1F2937] opacity-30"
                          )}>
                            <p className="text-[9px] font-mono font-bold text-slate-500">{cell?.systemNo ?? "EMPTY"}</p>
                            {cell && (
                              <>
                                <p className="text-xs font-medium text-white truncate leading-tight">{cell.roster.fullName}</p>
                                <p className="text-[9px] text-slate-500 font-mono">{cell.roster.registerNumber}</p>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Table view */}
            <Card>
              <CardHeader title="Allocation Table" />
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1F2937]">
                      {["System", "Name", "Register Number", "Year"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...allocations].sort((a, b) => a.systemNo.localeCompare(b.systemNo)).map((a) => (
                      <tr key={a.id} className="border-b border-[#1F2937]/50 hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 font-mono font-semibold text-cobalt-400">{a.systemNo}</td>
                        <td className="px-4 py-2.5 text-white font-medium">{a.roster.fullName}</td>
                        <td className="px-4 py-2.5 text-slate-300 font-mono">{a.roster.registerNumber}</td>
                        <td className="px-4 py-2.5 text-slate-400">{a.roster.year}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
