// ============================================================
// SecureAssess Student Kiosk — Root App
// ============================================================
// Phase-driven routing:
//   INIT/LOBBY/WAITING → LobbyPage
//   COUNTDOWN/ACTIVE/REVIEW/PAUSED → ExamPage
//   SUBMITTED/DISQUALIFIED → SubmittedPage
// ============================================================

import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useStudentStore } from "./store/studentStore";
import LobbyPage       from "./pages/LobbyPage";
import ExamPage        from "./pages/ExamPage";
import SubmittedPage   from "./pages/SubmittedPage";
import { AntiCheatGuard } from "./components/AntiCheatGuard";
import { getSocket }   from "./hooks/useSocket";

// Eagerly initialize the socket so events arrive even before
// any page component mounts.
getSocket();

function PhaseRouter() {
  const phase    = useStudentStore((s) => s.phase);
  const navigate = useNavigate();

  useEffect(() => {
    if (["SUBMITTED", "DISQUALIFIED"].includes(phase)) {
      navigate("/submitted", { replace: true });
    } else if (["ACTIVE", "COUNTDOWN", "REVIEW", "PAUSED"].includes(phase)) {
      navigate("/exam", { replace: true });
    } else {
      // INIT / LOBBY / WAITING
      navigate("/", { replace: true });
    }
  }, [phase]);

  return null;
}

export default function App() {
  return (
    <AntiCheatGuard>
      <PhaseRouter />
      <Routes>
        <Route path="/"          element={<LobbyPage />} />
        <Route path="/exam"      element={<ExamPage />} />
        <Route path="/submitted" element={<SubmittedPage />} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </AntiCheatGuard>
  );
}
