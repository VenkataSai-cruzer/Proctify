// ============================================================
// SecureAssess Student Kiosk — Browser-Level Anti-Cheat Guard
// ============================================================
// Active ONLY when phase ∈ {ACTIVE, REVIEW, PAUSED, COUNTDOWN}
// Covers: tab switch, window blur, DevTools (2 methods),
//         multi-tab BroadcastChannel, PrintScreen/clipboard,
//         fullscreen enforcement, context menu block
// ============================================================

import { useEffect, useRef, type ReactNode } from "react";
import { useStudentStore } from "../store/studentStore";
import { getSocket } from "../hooks/useSocket";
import { EVENTS } from "@secureassess/shared";

interface Props { children: ReactNode; }

const BC_CHANNEL = "secureassess-exam";

const EXAM_PHASES = new Set(["ACTIVE", "REVIEW", "PAUSED", "COUNTDOWN"]);

export function AntiCheatGuard({ children }: Props) {
  const phase       = useStudentStore((s) => s.phase);
  const sessionId   = useStudentStore((s) => s.sessionId);
  const clientMode  = useStudentStore((s) => s.clientMode);
  const lockdownMode = useStudentStore((s) => s.lockdownMode);
  const devtoolsRef = useRef<NodeJS.Timeout | null>(null);

  const reportViolation = (type: string, metadata?: Record<string, unknown>) => {
    const sid = useStudentStore.getState().sessionId;
    if (!sid) return;
    useStudentStore.getState().incrementViolation();
    getSocket().emit(EVENTS.ANTICHEAT_VIOLATION, {
      sessionId: sid,
      violationType: type,
      metadata,
      timestamp: new Date().toISOString(),
    });
  };

  useEffect(() => {
    // Skip in KIOSK mode (OS handles lockdown) or non-exam phases
    if (clientMode === "KIOSK" || !EXAM_PHASES.has(phase)) return;

    // ── WINDOWED Electron mode: hook OS-level blur from main process ──
    if (window.kioskAPI && lockdownMode === "WINDOWED") {
      const onBlur  = () => reportViolation("WINDOW_BLUR", { source: "electron-main" });
      window.kioskAPI.onWindowBlur(onBlur);
      return () => { window.kioskAPI?.removeAllListeners("kiosk:windowBlur"); };
    }

    // ── BroadcastChannel multi-tab block ─────────────────
    const bc = new BroadcastChannel(BC_CHANNEL);
    bc.postMessage("exam-open");
    bc.onmessage = (e) => {
      if (e.data === "exam-open") {
        reportViolation("MULTI_TAB_DETECTED");
        bc.postMessage("close-duplicate");
      }
    };

    // ── Tab / window visibility ───────────────────────────
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") reportViolation("TAB_SWITCH");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // ── Window blur ───────────────────────────────────────
    const onBlur = () => reportViolation("WINDOW_BLUR");
    window.addEventListener("blur", onBlur);

    // ── Fullscreen enforcement ────────────────────────────
    const requestFs = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => null);
      }
    };
    requestFs();
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        reportViolation("FULLSCREEN_EXIT");
        setTimeout(requestFs, 400);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);

    // ── DevTools: window size delta ───────────────────────
    const checkDevtools = () => {
      const wDiff = window.outerWidth  - window.innerWidth;
      const hDiff = window.outerHeight - window.innerHeight;
      if (wDiff > 160 || hDiff > 160) {
        reportViolation("DEVTOOLS_DETECTED", { method: "window-delta", wDiff, hDiff });
        return;
      }
      // Debugger timing (pauses when DevTools is open)
      const t0 = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      if (performance.now() - t0 > 100) {
        reportViolation("DEVTOOLS_DETECTED", { method: "debugger-timing" });
      }
    };
    devtoolsRef.current = setInterval(checkDevtools, 1200);

    // ── Keyboard block ────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      // PrintScreen
      if (e.key === "PrintScreen") {
        reportViolation("PRINT_SCREEN");
        setTimeout(() => navigator.clipboard.writeText("").catch(() => null), 50);
        return;
      }
      // DevTools shortcuts
      if (e.key === "F12") {
        e.preventDefault();
        reportViolation("DEVTOOLS_DETECTED", { method: "F12" });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        reportViolation("DEVTOOLS_DETECTED", { method: "keyboard-shortcut", key: e.key });
        return;
      }
      // Clipboard shortcuts
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "a", "u", "p", "s"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "v") {
          reportViolation("CLIPBOARD_ACCESS", { key: e.key });
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // ── Clipboard copy block ──────────────────────────────
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation("CLIPBOARD_ACCESS", { method: "copy-event" });
    };
    document.addEventListener("copy", onCopy);

    // ── Context menu block ────────────────────────────────
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      bc.close();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("contextmenu", onContextMenu);
      if (devtoolsRef.current) clearInterval(devtoolsRef.current);
    };
  }, [phase, clientMode]);

  return <>{children}</>;
}
