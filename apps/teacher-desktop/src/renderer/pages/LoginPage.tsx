// ============================================================
// SecureAssess Teacher Desktop — Login Page
// ============================================================

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "../store/authStore";
import { useExamStore } from "../store/examStore";
import { api } from "../lib/api";
import toast from "react-hot-toast";

export default function LoginPage() {
  const navigate     = useNavigate();
  const setAuth      = useAuthStore((s) => s.setAuth);
  const setServerUrl = useAuthStore((s) => s.setServerUrl);
  const setLabMode   = useAuthStore((s) => s.setLabMode);
  const serverUrl    = useAuthStore((s) => s.serverUrl);
  const token        = useAuthStore((s) => s.token);
  const setExams     = useExamStore((s) => s.setExams);

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer]     = useState(serverUrl);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [showServer, setShowServer] = useState(false);

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (token) navigate("/", { replace: true });
  }, [token]);

  // Discover lab server via Electron IPC
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Email and password are required."); return; }

    setLoading(true);
    try {
      setServerUrl(server.trim());
      const result = await api.post<{ token: string; teacher: { id: string; name: string; email: string } }>(
        "/api/auth/login",
        { email: email.trim(), password }
      );
      setAuth(result.token, result.teacher);
      setLabMode(server.includes("localhost") || server.includes("127.0.0.1") ? "HOME" : "LAB_CLIENT");

      // Load exams
      const examsResult = await api.get<{ exams: any[] }>("/api/exam");
      setExams(examsResult.exams);

      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cobalt-500 shadow-lg shadow-blue-500/20 mb-4">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">SecureAssess</h1>
          <p className="text-slate-500 text-sm mt-1">Teacher Console</p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-[#111827] border border-[#1F2937] rounded-2xl p-6"
        >
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2"
                >
                  <p className="text-red-400 text-xs">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0B1120] border border-[#374151] rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cobalt-500 focus:border-cobalt-500 transition-colors"
                placeholder="teacher@school.edu"
                autoFocus
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0B1120] border border-[#374151] rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cobalt-500 focus:border-cobalt-500 transition-colors"
                placeholder="••••••••"
              />
            </div>

            {/* Server URL toggle */}
            <div>
              <button type="button" onClick={() => setShowServer((v) => !v)}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                {showServer ? "▲ Hide" : "▼"} Server URL
              </button>
              <AnimatePresence>
                {showServer && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-2">
                    <input
                      type="text" value={server} onChange={(e) => setServer(e.target.value)}
                      className="w-full bg-[#0B1120] border border-[#374151] rounded-xl px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-cobalt-500 transition-colors"
                      placeholder="http://secureassess-lab.local:3000"
                    />
                    <p className="text-[10px] text-slate-600 mt-1">
                      Leave blank to use localhost. Discovered lab servers populate automatically.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 bg-cobalt-500 hover:bg-cobalt-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shadow-md shadow-blue-500/20 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </span>
              ) : "Sign In"}
            </button>
          </form>
        </motion.div>

        <p className="text-center text-xs text-slate-600 mt-4">
          SecureAssess v1.0 · Teacher Console
        </p>
      </div>
    </div>
  );
}
