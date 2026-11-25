// ============================================================
// SecureAssess Teacher Desktop — Exam & Dashboard Store
// ============================================================

import { create } from "zustand";
import type {
  Exam, StudentSession, ViolationEvent, LeaderboardEntry, MCQQuestion,
} from "@secureassess/shared";

interface McqGenProgress {
  examId: string;
  generated: number;
  target: number;
  currentTopic?: string;
  stage: "EXTRACTING" | "GENERATING" | "DEDUPLICATING" | "COMPLETE" | "ERROR";
  error?: string;
}

interface ExamStore {
  // ── Active exam ───────────────────────────────────────
  activeExam: Exam | null;
  exams: Exam[];

  // ── Live dashboard ────────────────────────────────────
  sessions: StudentSession[];
  violations: ViolationEvent[];
  leaderboard: LeaderboardEntry[];
  selectedSessionId: string | null;

  // ── CCTV ─────────────────────────────────────────────
  cctvConnected: boolean;
  cctvFrame: string | null;
  cctvPipVisible: boolean;

  // ── MCQ generation ────────────────────────────────────
  mcqGenProgress: McqGenProgress | null;
  generatedQuestions: MCQQuestion[];

  // ── Actions ───────────────────────────────────────────
  setActiveExam: (exam: Exam | null) => void;
  setExams: (exams: Exam[]) => void;
  upsertSession: (session: StudentSession) => void;
  setSessions: (sessions: StudentSession[]) => void;
  addViolation: (v: ViolationEvent) => void;
  forgivenViolation: (id: string) => void;
  setLeaderboard: (entries: LeaderboardEntry[]) => void;
  setSelectedSession: (id: string | null) => void;
  setCctvConnected: (connected: boolean) => void;
  setCctvFrame: (frame: string) => void;
  toggleCctvPip: () => void;
  setMcqGenProgress: (p: McqGenProgress | null) => void;
  setGeneratedQuestions: (qs: MCQQuestion[]) => void;
  clearGeneratedQuestions: () => void;
  reset: () => void;
}

export const useExamStore = create<ExamStore>((set) => ({
  activeExam: null,
  exams: [],
  sessions: [],
  violations: [],
  leaderboard: [],
  selectedSessionId: null,
  cctvConnected: false,
  cctvFrame: null,
  cctvPipVisible: true,
  mcqGenProgress: null,
  generatedQuestions: [],

  setActiveExam: (exam) => set({ activeExam: exam }),
  setExams: (exams) => set({ exams }),

  upsertSession: (session) =>
    set((state) => {
      const idx = state.sessions.findIndex((s) => s.id === session.id);
      if (idx === -1) return { sessions: [...state.sessions, session] };
      const updated = [...state.sessions];
      updated[idx] = session;
      return { sessions: updated };
    }),

  setSessions: (sessions) => set({ sessions }),

  addViolation: (v) =>
    set((state) => ({ violations: [v, ...state.violations].slice(0, 1000) })),

  forgivenViolation: (id) =>
    set((state) => ({
      violations: state.violations.map((v) =>
        v.id === id ? { ...v, forgiven: true } : v
      ),
    })),

  setLeaderboard: (leaderboard) => set({ leaderboard }),
  setSelectedSession: (selectedSessionId) => set({ selectedSessionId }),
  setCctvConnected: (cctvConnected) => set({ cctvConnected }),
  setCctvFrame: (cctvFrame) => set({ cctvFrame }),
  toggleCctvPip: () => set((s) => ({ cctvPipVisible: !s.cctvPipVisible })),
  setMcqGenProgress: (mcqGenProgress) => set({ mcqGenProgress }),
  setGeneratedQuestions: (generatedQuestions) => set({ generatedQuestions }),
  clearGeneratedQuestions: () => set({ generatedQuestions: [] }),
  reset: () => set({
    activeExam: null, sessions: [], violations: [], leaderboard: [],
    cctvFrame: null, cctvConnected: false, mcqGenProgress: null, generatedQuestions: [],
  }),
}));
