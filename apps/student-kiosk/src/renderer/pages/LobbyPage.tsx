// ============================================================
// SecureAssess Student Kiosk — Lobby / Login Page
// ============================================================
// Students enter: Full Name, Register Number, Year
// The page discovers the exam via serverUrl, checks lobby open,
// then calls student:login via Socket.IO.
// ============================================================

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { useStudentStore } from "../store/studentStore";
import { useSocket } from "../hooks/useSocket";
import { EVENTS } from "@secureassess/shared";

// ── Form field definitions ────────────────────────────────────

interface FormState {
  fullName: string;
  registerNumber: string;
  year: string;
}

const YEAR_OPTIONS = ["I Year", "II Year", "III Year", "IV Year"];

// ── Waiting screen shown after login, before teacher starts ──

function WaitingRoom() {
  const studentName    = useStudentStore((s) => s.studentName);
  const systemNo       = useStudentStore((s) => s.systemNo);
  const seatAllocation = useStudentStore((s) => s.seatAllocation);
  const examTitle      = useStudentStore((s) => s.examTitle);
  const examSubject    = useStudentStore((s) => s.examSubject);
  const examDuration   = useStudentStore((s) => s.examDurationMinutes);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 gap-8"
    >
      {/* Identity card */}
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="bg-white rounded-2xl shadow-md border border-slate-200 p-8 w-full max-w-md"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-cobalt-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">
              {systemNo.replace("SYS-", "")}
            </span>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">System</p>
            <p className="font-bold text-slate-800">{seatAllocation?.systemNo ?? systemNo}</p>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Name</span>
            <span className="font-semibold text-slate-800">{studentName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Register No.</span>
            <span className="font-mono font-semibold text-slate-800">
              {seatAllocation?.registerNumber}
            </span>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-3">
            <span className="text-slate-500">Exam</span>
            <span className="font-semibold text-slate-800 text-right max-w-[180px]">{examTitle}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Subject</span>
            <span className="font-semibold text-slate-800">{examSubject}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Duration</span>
            <span className="font-semibold text-slate-800">{examDuration} minutes</span>
          </div>
        </div>
      </motion.div>

      {/* Waiting indicator */}
      <div className="text-center space-y-3">
        <div className="flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-cobalt-400"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
        <p className="text-slate-600 font-medium">
          Waiting for your teacher to start the exam…
        </p>
        <p className="text-slate-400 text-xs">
          Please remain at your seat. Keep the screen visible.
        </p>
      </div>

      {/* Rules reminder */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-amber-50 border border-amber-200 rounded-xl p-4 w-full max-w-md"
      >
        <p className="text-amber-700 font-semibold text-sm mb-2">Exam Rules</p>
        <ul className="text-amber-600 text-xs space-y-1">
          <li>• No mobile phones or personal devices</li>
          <li>• Do not switch tabs or minimize the window</li>
          <li>• CCTV is active — maintain normal posture</li>
          <li>• Violations are recorded and may lead to disqualification</li>
          <li>• This screen is monitored by your teacher</li>
        </ul>
      </motion.div>
    </motion.div>
  );
}

// ── Main Lobby / Login Form ───────────────────────────────────

export default function LobbyPage() {
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const store = useStudentStore.getState;

  const phase         = useStudentStore((s) => s.phase);
  const systemNo      = useStudentStore((s) => s.systemNo);
  const hardwareToken = useStudentStore((s) => s.hardwareToken);
  const clientMode    = useStudentStore((s) => s.clientMode);
  const examId        = useStudentStore((s) => s.examId);
  const loginError    = useStudentStore((s) => s.loginError);
  const seatMismatch  = useStudentStore((s) => s.seatMismatchSystemNo);

  const [form, setForm] = useState<FormState>({
    fullName: "",
    registerNumber: "",
    year: YEAR_OPTIONS[0]!,
  });
  const [loading, setLoading]     = useState(false);
  const [localError, setLocalError] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);

  // Load machine info from Electron kiosk API (or fallback to env)
  useEffect(() => {
    const init = async () => {
      let serverUrl = "http://secureassess-lab.local:3000";
      let hwToken   = "browser-fallback-token";
      let sysNo     = "SYS-01";
      let mode: "KIOSK" | "BROWSER" = "BROWSER";

      // Try Electron kiosk API
      if (window.kioskAPI) {
        [serverUrl, hwToken, sysNo] = await Promise.all([
          window.kioskAPI.getServerUrl(),
          window.kioskAPI.getHardwareToken(),
          window.kioskAPI.getSystemNo(),
        ]);
        mode = "KIOSK";
      } else {        // Browser fallback: read from URL params or localStorage
        const params = new URLSearchParams(window.location.search);
        serverUrl = params.get("server") ?? localStorage.getItem("sa_server") ?? serverUrl;
        hwToken   = params.get("token")  ?? localStorage.getItem("sa_token")  ?? hwToken;
        sysNo     = params.get("sys")    ?? localStorage.getItem("sa_sys")    ?? sysNo;
      }

      store().setMachineInfo(serverUrl, hwToken, sysNo, mode);
    };
    init();
    nameRef.current?.focus();
  }, []);

  // If phase advanced to WAITING, switch to waiting room
  useEffect(() => {
    if (phase === "WAITING") return; // already there
    if (phase === "ACTIVE" || phase === "COUNTDOWN") navigate("/exam");
  }, [phase]);

  const validate = (): string | null => {
    if (!form.fullName.trim()) return "Please enter your full name.";
    if (form.fullName.trim().length < 2) return "Name must be at least 2 characters.";
    if (!form.registerNumber.trim()) return "Please enter your register number.";
    if (!/^[A-Za-z0-9]+$/.test(form.registerNumber.trim()))
      return "Register number must contain only letters and numbers.";
    if (!examId) return "No exam found on this server. Ask your teacher to open the lobby.";
    return null;
  };

  const handleLogin = async () => {
    setLocalError("");
    store().setLoginError(null);
    store().setSeatMismatch(null);

    const err = validate();
    if (err) { setLocalError(err); return; }

    setLoading(true);

    socket.emit(
      EVENTS.STUDENT_LOGIN,
      {
        examId: examId!,
        fullName: form.fullName.trim(),
        registerNumber: form.registerNumber.trim().toUpperCase(),
        year: form.year,
        systemNo,
        hardwareToken,
        clientMode,
      },
      (resp: any) => {
        setLoading(false);
        if (!resp.success) {
          setLocalError(resp.error ?? "Login failed. Please try again.");
          return;
        }
        const { sessionId, seatAllocation, sessionSecret } = resp.data;
        store().setSessionSecret(sessionSecret ?? "");
        store().setSession(
          sessionId,
          seatAllocation,
          form.fullName.trim(),
          form.registerNumber.trim().toUpperCase(),
          form.year
        );
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  // Show waiting room once logged in
  if (phase === "WAITING") return <WaitingRoom />;

  const error = localError || loginError || "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 flex flex-col items-center overflow-y-auto px-4 py-8">
      {/* Logo & title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cobalt-500 shadow-lg shadow-blue-500/20 mb-4">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Proctify</h1>
        <p className="text-slate-500 text-sm mt-1">Examination System</p>
      </motion.div>

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 w-full max-w-sm"
      >
        {/* System indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div className={clsx(
            "w-2 h-2 rounded-full",
            connected ? "bg-emerald-500" : "bg-amber-400 animate-pulse"
          )} />
          <span className="text-xs text-slate-400">
            {connected ? `Connected — ${systemNo}` : "Connecting to lab server…"}
          </span>
        </div>

        <h2 className="text-lg font-bold text-slate-800 mb-5">
          Student Sign In
        </h2>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4"
            >
              <p className="text-red-600 text-sm font-medium">{error}</p>
              {seatMismatch && (
                <p className="text-red-500 text-xs mt-1">
                  Assigned seat: <strong>{seatMismatch}</strong>
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-4" onKeyDown={handleKeyDown}>
          {/* Full Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Full Name
            </label>
            <input
              ref={nameRef}
              type="text"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              className={clsx(
                "w-full px-4 py-2.5 rounded-xl border text-sm bg-slate-50",
                "focus:outline-none focus:ring-2 focus:ring-cobalt-400 focus:border-cobalt-400",
                "placeholder:text-slate-300 text-slate-800",
                error && !form.fullName.trim()
                  ? "border-red-300 bg-red-50"
                  : "border-slate-200"
              )}
              placeholder="Enter your full name"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Register Number */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Register / Roll Number
            </label>
            <input
              type="text"
              value={form.registerNumber}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  registerNumber: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                }))
              }
              className={clsx(
                "w-full px-4 py-2.5 rounded-xl border text-sm bg-slate-50 font-mono",
                "focus:outline-none focus:ring-2 focus:ring-cobalt-400 focus:border-cobalt-400",
                "placeholder:text-slate-300 text-slate-800 uppercase",
                error && !form.registerNumber.trim()
                  ? "border-red-300 bg-red-50"
                  : "border-slate-200"
              )}
              placeholder="e.g. 21A91A0501"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Year */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Year / Course
            </label>
            <div className="grid grid-cols-4 gap-2">
              {YEAR_OPTIONS.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, year: y }))}
                  className={clsx(
                    "py-2 rounded-lg text-xs font-semibold border transition-all",
                    form.year === y
                      ? "bg-cobalt-500 text-white border-cobalt-500"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:border-cobalt-300 hover:bg-blue-50"
                  )}
                >
                  {y.replace(" Year", "")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submit */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleLogin}
          disabled={loading || !connected}
          className={clsx(
            "w-full mt-6 py-3 rounded-xl font-semibold text-sm transition-all",
            loading || !connected
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-cobalt-500 text-white hover:bg-cobalt-600 shadow-md shadow-blue-500/20 active:shadow-sm"
          )}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Verifying…
            </span>
          ) : (
            "Enter Exam Lobby"
          )}
        </motion.button>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-400 mt-4">
          {systemNo} &nbsp;·&nbsp; Secure Examination Environment
        </p>
      </motion.div>

      {/* No exam open notice */}
      {!examId && connected && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="mt-4 text-xs text-slate-400 text-center"
        >
          No exam lobby is currently open on this server.
          <br />Ask your teacher to open the exam lobby.
        </motion.p>
      )}
    </div>
  );
}
