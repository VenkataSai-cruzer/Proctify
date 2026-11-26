// ============================================================
// Proctify — Auto-Updater Status Banner (teacher release channel)
// ============================================================

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";

type UpdaterStage =
  | "checking"
  | "available"
  | "not-available"
  | "progress"
  | "downloaded"
  | "error"
  | "disabled";

interface UpdaterStatus {
  stage: UpdaterStage;
  channel?: string;
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
      // Auto-clear transient stages after 4s
      if (data.stage === "not-available" || data.stage === "checking") {
        setTimeout(() => setStatus(null), 4000);
      }
    });
    return () => window.electronAPI?.removeAllListeners("updater:status");
  }, []);

  const handleDownload = () => window.electronAPI?.downloadUpdate();
  const handleInstall  = () => window.electronAPI?.installUpdate();

  if (!status || status.stage === "not-available" || status.stage === "disabled") return null;

  const bgClass =
    status.stage === "downloaded" ? "bg-emerald-500" :
    status.stage === "progress"   ? "bg-cobalt-500"  :
    status.stage === "available"  ? "bg-amber-500"   :
    status.stage === "error"      ? "bg-red-500/80"  : "bg-[#1F2937]";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 32, opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className={cn("flex items-center justify-between px-4 text-xs font-medium text-white overflow-hidden flex-shrink-0", bgClass)}
      >
        <span>
          {status.stage === "checking"   && "Checking for updates…"}
          {status.stage === "available"  && `Update v${status.version} available`}
          {status.stage === "progress"   && `Downloading update… ${status.percent ?? 0}%`}
          {status.stage === "downloaded" && `Update v${status.version} ready to install`}
          {status.stage === "error"      && `Updater: ${status.message ?? "error"}`}
        </span>
        <div className="flex gap-2">
          {status.stage === "available" && (
            <button onClick={handleDownload} className="underline hover:no-underline">Download</button>
          )}
          {status.stage === "downloaded" && (
            <button onClick={handleInstall} className="underline hover:no-underline font-bold">Restart &amp; Install</button>
          )}
          <button onClick={() => setStatus(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
