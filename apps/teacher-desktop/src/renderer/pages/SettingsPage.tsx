// ============================================================
// SecureAssess Teacher Desktop — Settings
// ============================================================

import { useState, useEffect } from "react";
import { AppShell } from "../components/layout/AppShell";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { useAuthStore } from "../store/authStore";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const { serverUrl, labMode, setServerUrl, setLabMode, teacher } = useAuthStore();
  const [server, setServer] = useState(serverUrl);
  const [checking, setChecking] = useState(false);
  const [healthy, setHealthy]   = useState<boolean | null>(null);
  const [userDataPath, setUserDataPath] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [exportingDx, setExportingDx] = useState(false);

  // PIN change modal state
  const [pinModalOpen, setPinModalOpen]   = useState(false);
  const [currentPin, setCurrentPin]       = useState("");
  const [newPinA, setNewPinA]             = useState("");
  const [newPinB, setNewPinB]             = useState("");
  const [changingPin, setChangingPin]     = useState(false);

  useEffect(() => {
    window.electronAPI?.getUserDataPath().then((p) => setUserDataPath(String(p)));
  }, []);

  const handleChangePIN = async () => {
    if (!currentPin || !newPinA || !newPinB) { toast.error("All PIN fields are required"); return; }
    if (newPinA.length < 4) { toast.error("New PIN must be at least 4 characters"); return; }
    if (newPinA !== newPinB) { toast.error("New PINs do not match"); return; }
    setChangingPin(true);
    try {
      await api.post("/api/auth/change-pin", { currentPin, newPin: newPinA });
      toast.success("Faculty registration PIN updated");
      setPinModalOpen(false);
      setCurrentPin(""); setNewPinA(""); setNewPinB("");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Failed to change PIN");
    } finally { setChangingPin(false); }
  };

  const handleCheckHealth = async () => {
    setChecking(true);
    setHealthy(null);
    try {
      const res = await fetch(`${server}/health`);
      const data = await res.json();
      setHealthy(true);
      toast.success(`Connected: ${data.labName ?? "SecureAssess Server"}`);
    } catch {
      setHealthy(false);
      toast.error("Cannot reach server");
    } finally { setChecking(false); }
  };

  const handleSaveServer = () => {
    setServerUrl(server.trim());
    toast.success("Server URL saved");
  };

  return (
    <AppShell title="Settings">
      <div className="p-5 space-y-5 max-w-2xl">
        {/* Connection */}
        <Card>
          <CardHeader title="Server Connection" />
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Server URL</label>
              <div className="flex gap-2">
                <input value={server} onChange={(e) => setServer(e.target.value)}
                  className="flex-1 bg-[#0B1120] border border-[#374151] rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-cobalt-500"
                  placeholder="http://localhost:3000" />
                <Button size="sm" variant="secondary" loading={checking} onClick={handleCheckHealth}>Test</Button>
                <Button size="sm" onClick={handleSaveServer}>Save</Button>
              </div>
              {healthy !== null && (
                <p className={cn("text-xs mt-1.5", healthy ? "text-emerald-400" : "text-red-400")}>
                  {healthy ? "✓ Server reachable" : "✗ Server unreachable"}
                </p>
              )}
            </div>

            {/* Lab mode */}
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Mode</label>
              <div className="flex gap-2">
                {(["HOME", "LAB_SERVER", "LAB_CLIENT"] as const).map((m) => (
                  <button key={m} onClick={() => setLabMode(m)}
                    className={cn("flex-1 py-2 rounded-lg text-xs font-semibold transition-all",
                      labMode === m ? "bg-cobalt-500 text-white" : "bg-[#1F2937] text-slate-400 hover:text-white")}>
                    {m === "HOME" ? "🏠 Home" : m === "LAB_SERVER" ? "🖥 Lab Server" : "💻 Lab Client"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5">
                {labMode === "HOME" ? "Offline mode — uses embedded SQLite, no network required."
                 : labMode === "LAB_SERVER" ? "This machine is the lab server. mDNS broadcasts on the LAN."
                 : "Connect to a lab server discovered via mDNS or entered manually."}
              </p>
            </div>
          </div>
        </Card>

        {/* Data & Storage */}
        <Card>
          <CardHeader title="Data & Storage" />
          <div className="p-4 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-500 text-xs flex-shrink-0">Data directory</span>
              <span className="text-xs font-mono text-slate-300 text-right break-all">
                {userDataPath || "—"}
              </span>
            </div>
            <p className="text-[10px] text-slate-600">
              SQLite database, backups, logs, and exported PDFs are stored here.
              Backups are created automatically on every startup (last 10 kept).
            </p>
            <Button
              size="sm" variant="secondary"
              onClick={() => userDataPath && window.electronAPI?.openPath(userDataPath)}
              disabled={!userDataPath}
            >
              Open Folder
            </Button>
          </div>
        </Card>

        {/* Faculty Registration PIN (Lab Host only) */}
        {teacher?.isLabHost && (
          <Card>
            <CardHeader
              title="Faculty Registration PIN"
              subtitle="Controls who can create new teacher accounts on this server"
            />
            <div className="p-4 space-y-2">
              <p className="text-xs text-slate-400 leading-relaxed">
                This PIN is required when any new teacher registers.
                It prevents students from creating teacher accounts on shared lab PCs.
                Only the Lab Host (you) can change it.
              </p>
              <Button size="sm" variant="secondary" onClick={() => setPinModalOpen(true)}>
                🔑 Change Faculty Registration PIN
              </Button>
            </div>
          </Card>
        )}

        {/* Updates */}
        {window.electronAPI && (
          <Card>
            <CardHeader title="Application Updates" />
            <div className="p-4 flex gap-2">
              <Button
                size="sm" variant="secondary"
                loading={checkingUpdate}
                onClick={async () => {
                  setCheckingUpdate(true);
                  await window.electronAPI?.checkForUpdates().catch(() => null);
                  setCheckingUpdate(false);
                  toast.success("Update check triggered");
                }}
              >
                Check for Updates
              </Button>
            </div>
          </Card>
        )}

        {/* Diagnostics */}
        {window.electronAPI && (
          <Card>
            <CardHeader title="Diagnostics" subtitle="Export a ZIP with logs, crash dumps, DB info & system summary for debugging" />
            <div className="p-4">
              <Button
                size="sm" variant="secondary"
                loading={exportingDx}
                onClick={async () => {
                  setExportingDx(true);
                  try {
                    const result = await window.electronAPI?.exportDiagnostics();
                    if (result?.saved) {
                      toast.success(`Diagnostics saved: ${result.path?.split(/[\\/]/).pop()}`);
                    } else if (result?.error) {
                      toast.error(result.error);
                    }
                  } catch (err: unknown) {
                    toast.error((err as Error).message ?? "Export failed");
                  } finally { setExportingDx(false); }
                }}
                icon={<span>🔍</span>}
              >
                Export Diagnostics ZIP
              </Button>
            </div>
          </Card>
        )}
        <Card>
          <CardHeader title="About" />
          <div className="p-4 space-y-2 text-sm">
            {[
              ["Application", "SecureAssess Teacher Desktop"],
              ["Version", "1.0.0"],
              ["Build", "Production"],
              ["Platform", navigator.platform],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-1.5 border-b border-[#1F2937]">
                <span className="text-slate-500">{k}</span>
                <span className="text-white font-mono text-xs">{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>

    {/* PIN Change Modal */}
    <Modal open={pinModalOpen} onClose={() => { setPinModalOpen(false); setCurrentPin(""); setNewPinA(""); setNewPinB(""); }}
      title="Change Faculty Registration PIN" size="sm">
      <div className="space-y-3">
        <p className="text-xs text-slate-400">
          After changing, give the new PIN to faculty members who need to create accounts.
        </p>
        {[
          { label: "Current PIN", value: currentPin, setter: setCurrentPin, placeholder: "••••" },
          { label: "New PIN (min 4 chars)", value: newPinA, setter: setNewPinA, placeholder: "New PIN" },
          { label: "Confirm New PIN", value: newPinB, setter: setNewPinB, placeholder: "Repeat new PIN" },
        ].map(({ label, value, setter, placeholder }) => (
          <div key={label}>
            <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
            <input type="password" value={value} onChange={(e) => setter(e.target.value)}
              placeholder={placeholder} autoComplete="off"
              className="w-full bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cobalt-500" />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={() => setPinModalOpen(false)}>Cancel</Button>
          <Button size="sm" loading={changingPin} onClick={handleChangePIN}>Update PIN</Button>
        </div>
      </div>
    </Modal>
    </>
  );
}
