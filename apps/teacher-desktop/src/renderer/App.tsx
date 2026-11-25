// ============================================================
// SecureAssess Teacher Desktop — Root App Router
// ============================================================

import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";

// Pages
import LoginPage         from "./pages/LoginPage";
import DashboardPage     from "./pages/DashboardPage";
import ExamBuilderPage   from "./pages/ExamBuilderPage";
import MCQGeneratorPage  from "./pages/MCQGeneratorPage";
import RosterPage        from "./pages/RosterPage";
import SeatingPage       from "./pages/SeatingPage";
import MachineSetupPage  from "./pages/MachineSetupPage";
import CCTVCalibratePage from "./pages/CCTVCalibratePage";
import LiveMonitorPage   from "./pages/LiveMonitorPage";
import ForensicPage      from "./pages/ForensicPage";
import ProjectorPage     from "./pages/ProjectorPage";
import SettingsPage      from "./pages/SettingsPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthed = useAuthStore((s) => !!s.token);
  return isAuthed ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/projector" element={<ProjectorPage />} />

      <Route path="/*" element={
        <RequireAuth>
          <Routes>
            <Route path="/"                element={<DashboardPage />} />
            <Route path="/exam/:id"        element={<ExamBuilderPage />} />
            <Route path="/exam/:id/mcq"    element={<MCQGeneratorPage />} />
            <Route path="/exam/:id/roster" element={<RosterPage />} />
            <Route path="/exam/:id/seating" element={<SeatingPage />} />
            <Route path="/exam/:id/live"   element={<LiveMonitorPage />} />
            <Route path="/exam/:id/forensic" element={<ForensicPage />} />
            <Route path="/exam/:id/cctv"   element={<CCTVCalibratePage />} />
            <Route path="/machines"        element={<MachineSetupPage />} />
            <Route path="/settings"        element={<SettingsPage />} />
            <Route path="*"                element={<Navigate to="/" replace />} />
          </Routes>
        </RequireAuth>
      } />
    </Routes>
  );
}
