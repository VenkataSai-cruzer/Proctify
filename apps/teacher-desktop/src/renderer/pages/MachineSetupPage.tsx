// ============================================================
// SecureAssess Teacher Desktop — Lab Machine Registration
// ============================================================

import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";

interface Machine {
  id: string; systemNo: string; machineName: string;
  macAddress: string; ipAddress: string; hardwareToken: string;
  isActive: boolean; row: number; col: number;
}

interface Subnet { id: string; cidr: string; label: string; }

export default function MachineSetupPage() {
  const [machines, setMachines]   = useState<Machine[]>([]);
  const [subnets, setSubnets]     = useState<Subnet[]>([]);
  const [loading, setLoading]     = useState(true);
  const [addOpen, setAddOpen]     = useState(false);
  const [subnetOpen, setSubnetOpen] = useState(false);

  const [form, setForm] = useState({
    systemNo: "", machineName: "", macAddress: "",
    ipAddress: "", row: 0, col: 0,
  });
  const [cidr, setCidr]   = useState("");
  const [label, setLabel] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [mRes, sRes] = await Promise.all([
        api.get<{ machines: Machine[] }>("/api/machine"),
        api.get<{ subnets: Subnet[] }>("/api/machine/subnets"),
      ]);
      setMachines(mRes.machines);
      setSubnets(sRes.subnets);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAddMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/machine", form);
      toast.success(`${form.systemNo} registered`);
      setAddOpen(false);
      setForm({ systemNo: "", machineName: "", macAddress: "", ipAddress: "", row: 0, col: 0 });
      await load();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleToggle = async (machine: Machine) => {
    try {
      await api.patch(`/api/machine/${machine.systemNo}`, { isActive: !machine.isActive });
      setMachines((ms) => ms.map((m) => m.systemNo === machine.systemNo ? { ...m, isActive: !m.isActive } : m));
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (systemNo: string) => {
    if (!confirm(`Delete ${systemNo}?`)) return;
    await api.delete(`/api/machine/${systemNo}`);
    setMachines((ms) => ms.filter((m) => m.systemNo !== systemNo));
    toast.success(`${systemNo} deleted`);
  };

  const handleAddSubnet = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/machine/subnets", { cidr, label });
      toast.success("Subnet added");
      setSubnetOpen(false);
      setCidr(""); setLabel("");
      await load();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteSubnet = async (id: string) => {
    await api.delete(`/api/machine/subnets/${id}`);
    setSubnets((ss) => ss.filter((s) => s.id !== id));
  };

  return (
    <AppShell title="Lab Machine Setup" subtitle="Register machines and configure network allowlist"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setSubnetOpen(true)}>+ Subnet</Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>+ Machine</Button>
        </div>
      }
    >
      <div className="p-5 space-y-5">
        {/* Subnet allowlist */}
        <Card>
          <CardHeader title="Allowed Subnets" subtitle="Only devices on these subnets can access the student exam" />
          <div className="p-4 flex flex-wrap gap-2">
            {subnets.map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-[#1F2937] rounded-lg px-3 py-1.5">
                <span className="text-xs font-mono text-slate-300">{s.cidr}</span>
                {s.label && <span className="text-[10px] text-slate-500">{s.label}</span>}
                <button onClick={() => handleDeleteSubnet(s.id)} className="text-red-500 hover:text-red-400 text-xs ml-1">✕</button>
              </div>
            ))}
            {subnets.length === 0 && <p className="text-xs text-slate-600 italic">No subnets — all LAN devices allowed (dev mode)</p>}
          </div>
        </Card>

        {/* Machine grid */}
        <Card>
          <CardHeader title={`Registered Machines (${machines.length})`} />
          {loading ? (
            <div className="p-8 flex justify-center"><svg className="animate-spin w-5 h-5 text-cobalt-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1F2937]">
                    {["System", "Machine Name", "IP Address", "MAC", "Token", "Row/Col", "Status", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {machines.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-6 text-slate-600 italic">No machines registered</td></tr>
                  ) : machines.map((m) => (
                    <tr key={m.id} className="border-b border-[#1F2937]/50 hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 font-mono font-semibold text-cobalt-400">{m.systemNo}</td>
                      <td className="px-4 py-2.5 text-white">{m.machineName}</td>
                      <td className="px-4 py-2.5 text-slate-300 font-mono">{m.ipAddress}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-[10px]">{m.macAddress}</td>
                      <td className="px-4 py-2.5 text-slate-600 font-mono text-[10px]">{m.hardwareToken.slice(0, 12)}…</td>
                      <td className="px-4 py-2.5 text-slate-400">{m.row}/{m.col}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => handleToggle(m)}
                          className={cn("text-[9px] font-semibold px-2 py-0.5 rounded",
                            m.isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400")}>
                          {m.isActive ? "ACTIVE" : "INACTIVE"}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => handleDelete(m.systemNo)} className="text-red-500 hover:text-red-400 text-xs">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Add machine modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Register Lab Machine">
        <form onSubmit={handleAddMachine} className="space-y-3">
          {[
            { key: "systemNo", label: "System No", placeholder: "SYS-01" },
            { key: "machineName", label: "Machine Name", placeholder: "Lab PC 1" },
            { key: "macAddress", label: "MAC Address", placeholder: "00:11:22:33:44:55" },
            { key: "ipAddress", label: "IP Address", placeholder: "192.168.1.101" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-xs text-slate-400 mb-1 block">{label}</label>
              <input type="text" placeholder={placeholder}
                value={(form as any)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-cobalt-500" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Row</label>
              <input type="number" value={form.row} onChange={(e) => setForm((f) => ({ ...f, row: Number(e.target.value) }))}
                className="w-full bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cobalt-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Column</label>
              <input type="number" value={form.col} onChange={(e) => setForm((f) => ({ ...f, col: Number(e.target.value) }))}
                className="w-full bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cobalt-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit">Register</Button>
          </div>
        </form>
      </Modal>

      {/* Add subnet modal */}
      <Modal open={subnetOpen} onClose={() => setSubnetOpen(false)} title="Add Allowed Subnet" size="sm">
        <form onSubmit={handleAddSubnet} className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">CIDR Notation</label>
            <input type="text" value={cidr} onChange={(e) => setCidr(e.target.value)}
              className="w-full bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-cobalt-500"
              placeholder="192.168.1.0/24" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Label (optional)</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cobalt-500"
              placeholder="Lab A Network" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setSubnetOpen(false)}>Cancel</Button>
            <Button type="submit">Add</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
