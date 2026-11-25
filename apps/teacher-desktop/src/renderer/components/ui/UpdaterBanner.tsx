// ============================================================
// SecureAssess — Auto-Updater Status Banner
// ============================================================

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";

interface UpdaterStatus {
  stage: "checking" | "available" | "current" | "downloading" | "ready" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

export function UpdaterBanner() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.onUpdaterStatus((data) => {
      setStatus(data as UpdaterStatus);
      // Auto-clear "current" and "checking" after 4s
      if (data.stage === "current" || data.stage === "checking") {
        setTimeout(() => setStatus(null), 4000);
      }
    });
    return () => window.electronAPI?.removeAllListeners("updater:status");
  }, []);

  const handleDownload = () => window.electronAPI?.downloadUpdate();
  const handleInstall  = () => window.electronAPI?.installUpdate();

  if (!status || status.stage === "current") return null;

  const bgClass =
    status.stage === "ready"       ? "bg-emerald-500" :
    status.stage === "downloading" ? "bg-cobalt-500"  :
    status.stage === "available"   ? "bg-amber-500"   :
    status.stage === "error"       ? "bg-red-500/80"  : "bg-[#1F2937]";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 32, opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className={cn("flex items-center justify-between px-4 text-xs font-medium text-white overflow-hidden flex-shrink-0", bgClass)}
      >
        <span>
          {status.stage === "checking"    && "Checking for updates…"}
          {status.stage === "available"   && `Update v${status.version} available`}
          {status.stage === "downloading" && `Downloading update… ${status.percent ?? 0}%`}
          {status.stage === "ready"       && `Update v${status.version} ready to install`}
          {status.stage === "error"       && `Updater: ${status.message ?? "error"}`}
        </span>
        <div className="flex gap-2">
          {status.stage === "available" && (
            <button onClick={handleDownload} className="underline hover:no-underline">Download</button>
          )}
          {status.stage === "ready" && (
            <button onClick={handleInstall} className="underline hover:no-underline font-bold">Restart & Install</button>
          )}
          <button onClick={() => setStatus(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
