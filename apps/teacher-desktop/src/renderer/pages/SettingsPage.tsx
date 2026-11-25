// ============================================================
// SecureAssess Teacher Desktop — Settings
// ============================================================

import { useState, useEffect } from "react";
import { AppShell } from "../components/layout/AppShell";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useAuthStore } from "../store/authStore";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const { serverUrl, labMode, setServerUrl, setLabMode } = useAuthStore();
  const [server, setServer] = useState(serverUrl);
  const [checking, setChecking] = useState(false);
  const [healthy, setHealthy]   = useState<boolean | null>(null);
  const [userDataPath, setUserDataPath] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [exportingDx, setExportingDx] = useState(false);

  useEffect(() => {
    window.electronAPI?.getUserDataPath().then((p) => setUserDataPath(String(p)));
  }, []);

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
  );
}
