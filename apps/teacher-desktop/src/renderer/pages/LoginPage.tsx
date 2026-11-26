// ============================================================
// SecureAssess Teacher Desktop — Login / Register Page
// ============================================================
//
// Three modes (determined by GET /api/auth/setup-status):
//
//   1. LOGIN (default)
//      Standard email + password sign-in.
//      "Create Account" link visible unless on a student kiosk.
//
//   2. REGISTER — First-run (Teacher table is EMPTY)
//      "Become Lab Host" form: name, email, password, NEW PIN.
//      The first teacher sets the faculty registration PIN.
//      Shown with a yellow "Lab Host Setup" banner.
//
//   3. REGISTER — Subsequent faculty
//      name, email, password + existing Faculty Registration PIN.
//      Students cannot complete this without the PIN.
//
// ============================================================

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "../store/authStore";
import { useExamStore } from "../store/examStore";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";

type Mode = "login" | "register";

interface SetupStatus {
  firstRun: boolean;
  pinRequired: boolean;
  teacherCount: number;
  labName: string;
}

const INPUT_CLS = `w-full bg-[#0B1120] border border-[#374151] rounded-xl px-3 py-2.5
  text-sm text-white placeholder-slate-600
  focus:outline-none focus:ring-1 focus:ring-cobalt-500 focus:border-cobalt-500
  transition-colors`;

export default function LoginPage() {
  const navigate     = useNavigate();
  const setAuth      = useAuthStore((s) => s.setAuth);
  const setServerUrl = useAuthStore((s) => s.setServerUrl);
  const setLabMode   = useAuthStore((s) => s.setLabMode);
  const serverUrl    = useAuthStore((s) => s.serverUrl);
  const token        = useAuthStore((s) => s.token);
  const setExams     = useExamStore((s) => s.setExams);

  const [mode, setMode]           = useState<Mode>("login");
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [server, setServer]       = useState(serverUrl);
  const [showServer, setShowServer] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  // Login fields
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");

  // Register fields
  const [regName, setRegName]     = useState("");
  const [regEmail, setRegEmail]   = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");
  const [regPin, setRegPin]       = useState("");  // existing PIN (subsequent registrations)
  const [newPin, setNewPin]       = useState("");  // first-run PIN to SET
  const [newPin2, setNewPin2]     = useState("");

  // Redirect if already authenticated
  useEffect(() => {
    if (token) navigate("/", { replace: true });
  }, [token]);

  // mDNS lab server discovery
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onDiscoveryServerFound((data: any) => {
        const url = `http://${data.host}:${data.port}`;
        setServer(url);
        toast.success(`Lab server found: ${data.labName}`, { duration: 4000 });
      });
      return () => window.electronAPI?.removeAllListeners("discovery:serverFound");
    }
  }, []);

  // Fetch setup status whenever server URL changes (or on mount)
  useEffect(() => {
    fetchSetupStatus();
  }, [server]);

  const fetchSetupStatus = async () => {
    if (!server) return;
    try {
      const status = await fetch(`${server.trim()}/api/auth/setup-status`)
        .then((r) => r.json() as Promise<SetupStatus>)
        .catch(() => null);
      setSetupStatus(status);
      if (status?.firstRun) setMode("register");
    } catch { /* non-fatal */ }
  };

  // ── Login ──────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Email and password are required."); return; }

    setLoading(true);
    try {
      setServerUrl(server.trim());
      const result = await api.post<{ token: string; teacher: { id: string; name: string; email: string; isLabHost: boolean } }>(
        "/api/auth/login",
        { email: email.trim(), password }
      );
      setAuth(result.token, result.teacher);
      setLabMode(
        server.includes("localhost") || server.includes("127.0.0.1") ? "HOME" : "LAB_CLIENT"
      );
      const examsResult = await api.get<{ exams: any[] }>("/api/exam");
      setExams(examsResult.exams);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  // ── Register ───────────────────────────────────────────────

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!regName.trim())         { setError("Full name is required."); return; }
    if (!regEmail.trim())        { setError("Email is required."); return; }
    if (regPassword.length < 8)  { setError("Password must be at least 8 characters."); return; }
    if (regPassword !== regPassword2) { setError("Passwords do not match."); return; }

    const isFirst = setupStatus?.firstRun ?? false;

    if (isFirst) {
      if (newPin.length < 4)     { setError("Faculty Registration PIN must be at least 4 characters."); return; }
      if (newPin !== newPin2)    { setError("PINs do not match."); return; }
    } else {
      if (!regPin.trim())        { setError("Faculty Registration PIN is required."); return; }
    }

    setLoading(true);
    try {
      setServerUrl(server.trim());
      const body: Record<string, string> = {
        name:     regName.trim(),
        email:    regEmail.trim(),
        password: regPassword,
        ...(isFirst
          ? { newPin: newPin.trim() }
          : { registrationPin: regPin.trim() }
        ),
      };
      const result = await api.post<{
        teacher: { id: string; name: string; email: string; isLabHost: boolean };
        message?: string;
      }>("/api/auth/register", body);

      toast.success(
        isFirst
          ? `Welcome, Lab Host ${result.teacher.name}! Account created.`
          : `Account created. Welcome, ${result.teacher.name}!`
      );
      if (result.message) toast(result.message, { icon: "ℹ️", duration: 8000 });

      // Auto-login after registration
      const loginResult = await api.post<{ token: string; teacher: { id: string; name: string; email: string; isLabHost: boolean } }>(
        "/api/auth/login",
        { email: regEmail.trim(), password: regPassword }
      );
      setAuth(loginResult.token, loginResult.teacher);
      setLabMode(
        server.includes("localhost") || server.includes("127.0.0.1") ? "HOME" : "LAB_CLIENT"
      );
      const examsResult = await api.get<{ exams: any[] }>("/api/exam");
      setExams(examsResult.exams);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  const isFirst     = setupStatus?.firstRun ?? false;

  return (
    /* flex-col + m-auto: centred when it fits, scrolls from the top when the
       window is shorter than the form (e.g. 1366x768 laptops) instead of
       clipping the logo/banner. */
    <div className="min-h-screen bg-[#0B1120] flex flex-col items-center overflow-y-auto px-4 py-8">
      <div className="w-full max-w-sm m-auto">

        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cobalt-500 shadow-lg shadow-blue-500/20 mb-3">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Proctify</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {setupStatus?.labName ?? "Teacher Console"}
          </p>
        </motion.div>

        {/* First-run banner */}
        <AnimatePresence>
          {isFirst && mode === "register" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4"
            >
              <p className="text-amber-400 text-xs font-semibold mb-1">First-Run: Lab Host Setup</p>
              <p className="text-amber-300/70 text-[11px] leading-relaxed">
                No teacher accounts exist yet. The first account you create becomes the
                <strong className="text-amber-300"> Lab Host</strong>.
                You will set a Faculty Registration PIN — required for all future teacher accounts.
                This prevents students from self-registering.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mode tabs */}
        {!isFirst && (
          <div className="flex gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-xl mb-4">
            {(["login", "register"] as Mode[]).map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all",
                  mode === m ? "bg-cobalt-500 text-white" : "text-slate-400 hover:text-white"
                )}>
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>
        )}

        {/* Card */}
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111827] border border-[#1F2937] rounded-2xl p-6"
        >
          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 mb-4"
              >
                <p className="text-red-400 text-xs">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── LOGIN FORM ─────────────────────────────────────── */}
          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className={INPUT_CLS} placeholder="teacher@school.edu" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className={INPUT_CLS} placeholder="••••••••" />
              </div>
              <ServerUrlToggle server={server} setServer={setServer} showServer={showServer} setShowServer={setShowServer} />
              <button type="submit" disabled={loading}
                className="w-full py-2.5 bg-cobalt-500 hover:bg-cobalt-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shadow-md shadow-blue-500/20">
                {loading ? <Spinner label="Signing in…" /> : "Sign In"}
              </button>
            </form>
          )}

          {/* ── REGISTER FORM ──────────────────────────────────── */}
          {mode === "register" && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name</label>
                <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)}
                  className={INPUT_CLS} placeholder="Dr. Jane Smith" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                  className={INPUT_CLS} placeholder="teacher@school.edu" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                <input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
                  className={INPUT_CLS} placeholder="At least 8 characters" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm Password</label>
                <input type="password" value={regPassword2} onChange={(e) => setRegPassword2(e.target.value)}
                  className={INPUT_CLS} placeholder="Repeat password" />
              </div>

              {/* PIN field — different for first-run vs subsequent */}
              {isFirst ? (
                <>
                  <div className="border-t border-[#1F2937] pt-3">
                    <p className="text-xs text-amber-400 font-semibold mb-2">Set Faculty Registration PIN</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">New PIN</label>
                        <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)}
                          className={INPUT_CLS} placeholder="Min 4 characters"
                          autoComplete="new-password" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm PIN</label>
                        <input type="password" value={newPin2} onChange={(e) => setNewPin2(e.target.value)}
                          className={INPUT_CLS} placeholder="Repeat PIN"
                          autoComplete="new-password" />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1.5">
                      Share this PIN only with faculty. Students cannot register without it.
                    </p>
                  </div>
                </>
              ) : (
                <div className="border-t border-[#1F2937] pt-3">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Faculty Registration PIN
                  </label>
                  <input type="password" value={regPin} onChange={(e) => setRegPin(e.target.value)}
                    className={INPUT_CLS} placeholder="Provided by your Lab Host"
                    autoComplete="off" />
                  <p className="text-[10px] text-slate-600 mt-1">
                    Contact your Lab Host for the PIN. This prevents student account creation.
                  </p>
                </div>
              )}

              <ServerUrlToggle server={server} setServer={setServer} showServer={showServer} setShowServer={setShowServer} />

              <button type="submit" disabled={loading}
                className={cn(
                  "w-full py-2.5 text-white text-sm font-semibold rounded-xl transition-colors shadow-md mt-1",
                  isFirst
                    ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20"
                    : "bg-cobalt-500 hover:bg-cobalt-600 shadow-blue-500/20",
                  "disabled:opacity-50"
                )}>
                {loading
                  ? <Spinner label="Creating account…" />
                  : isFirst ? "Become Lab Host" : "Create Teacher Account"}
              </button>
            </form>
          )}
        </motion.div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-4">
          Proctify v1.2 · Teacher Console
          {setupStatus && (
            <span className="ml-1 text-slate-700">
              · {setupStatus.teacherCount} teacher{setupStatus.teacherCount !== 1 ? "s" : ""} registered
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function ServerUrlToggle({ server, setServer, showServer, setShowServer }: {
  server: string; setServer: (v: string) => void;
  showServer: boolean; setShowServer: (v: boolean) => void;
}) {
  return (
    <div>
      <button type="button" onClick={() => setShowServer(!showServer)}
        className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
        {showServer ? "▲ Hide" : "▼"} Server URL
      </button>
      <AnimatePresence>
        {showServer && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-2">
            <input type="text" value={server} onChange={(e) => setServer(e.target.value)}
              className="w-full bg-[#0B1120] border border-[#374151] rounded-xl px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-cobalt-500 transition-colors"
              placeholder="http://secureassess-lab.local:3000" />
            <p className="text-[10px] text-slate-600 mt-1">
              Defaults to localhost. Lab servers are discovered automatically via mDNS.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label}
    </span>
  );
}
