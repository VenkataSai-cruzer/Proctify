// ============================================================
// SecureAssess Student Kiosk — Student State Store
// ============================================================

import { create } from "zustand";
import type { NextQuestionPayload, AdaptiveState, SeatAllocation } from "@secureassess/shared";

export type ExamPhase =
  | "INIT"          // machine info not yet loaded
  | "LOBBY"         // waiting for exam to open / filling login form
  | "WAITING"       // logged in, waiting for teacher to start
  | "COUNTDOWN"     // 10-second countdown before questions
  | "ACTIVE"        // answering questions
  | "PAUSED"        // teacher paused the exam
  | "REVIEW"        // answer result shown (brief feedback window)
  | "SUBMITTED"     // exam completed normally
  | "DISQUALIFIED"; // kicked due to violations

interface ViolationWarning {
  id: string;
  message: string;
  count: number;
  remaining: number;
  timestamp: string;
}

interface AnswerFeedback {
  questionId: string;
  chosenIndex: number;
  isCorrect: boolean;
  correctIndex: number;
  pointsAwarded: number;
}

interface StudentState {
  // ── Machine / connection ───────────────────────────────
  serverUrl: string;
  hardwareToken: string;
  systemNo: string;
  clientMode: "KIOSK" | "BROWSER";
  lockdownMode: "KIOSK" | "WINDOWED";
  connected: boolean;

  // ── Exam join ─────────────────────────────────────────
  examId: string | null;
  examTitle: string;
  examSubject: string;
  examDurationMinutes: number;
  strictSeatBinding: boolean;

  // ── Session ────────────────────────────────────────────
  sessionId: string | null;
  seatAllocation: SeatAllocation | null;
  studentName: string;
  registerNumber: string;
  year: string;

  // ── Exam flow ─────────────────────────────────────────
  phase: ExamPhase;
  currentQuestion: NextQuestionPayload | null;
  adaptiveState: AdaptiveState | null;
  selectedOptionIndex: number | null;
  answerFeedback: AnswerFeedback | null;
  timeRemainingSeconds: number;
  countdownSeconds: number;

  // ── Anti-cheat ────────────────────────────────────────
  violationCount: number;
  disqualifyThreshold: number;
  violationWarning: ViolationWarning | null;
  pendingAnswer: { questionId: string; chosenIndex: number } | null;

  // ── Zero-leak packet signing ──────────────────────────
  sessionSecret: string;              // per-session HMAC secret from server
  pendingAnswerSeq: number;           // monotonic seq for anti-replay
  currentQuestionStartedAt: number | null; // ms timestamp when question was displayed

  // ── UI helpers ────────────────────────────────────────
  submitted: boolean;
  disqualified: boolean;
  pauseReason: string;
  seatMismatchSystemNo: string | null;
  loginError: string | null;

  // ── Actions ───────────────────────────────────────────
  setMachineInfo: (
    serverUrl: string,
    hardwareToken: string,
    systemNo: string,
    clientMode: "KIOSK" | "BROWSER",
    lockdownMode?: "KIOSK" | "WINDOWED"
  ) => void;
  setConnected: (connected: boolean) => void;
  setExamInfo: (info: {
    examId: string;
    examTitle: string;
    examSubject: string;
    examDurationMinutes: number;
    strictSeatBinding: boolean;
    lockdownMode: "KIOSK" | "WINDOWED";
    disqualifyThreshold: number;
  }) => void;
  setSession: (
    sessionId: string,
    seatAllocation: SeatAllocation,
    studentName: string,
    registerNumber: string,
    year: string
  ) => void;
  setPhase: (phase: ExamPhase) => void;
  setCountdown: (seconds: number) => void;
  setQuestion: (payload: NextQuestionPayload) => void;
  setSelectedOption: (index: number | null) => void;
  setAnswerFeedback: (feedback: AnswerFeedback | null) => void;
  setAdaptiveState: (state: AdaptiveState) => void;
  tickTimer: () => void;
  setTimeRemaining: (seconds: number) => void;
  addTimeExtension: (minutes: number) => void;
  setViolationWarning: (warning: ViolationWarning | null) => void;
  incrementViolation: () => void;
  setPendingAnswer: (answer: StudentState["pendingAnswer"]) => void;
  setSessionSecret: (secret: string) => void;
  setPendingAnswerSeq: (seq: number) => void;
  setCurrentQuestionStartedAt: (ts: number | null) => void;
  setSubmitted: () => void;
  setDisqualified: () => void;
  setPauseReason: (reason: string) => void;
  setSeatMismatch: (systemNo: string | null) => void;
  setLoginError: (error: string | null) => void;
  reset: () => void;
}

const DEFAULT_STATE: Omit<StudentState,
  | "setMachineInfo" | "setConnected" | "setExamInfo" | "setSession"
  | "setPhase" | "setCountdown" | "setQuestion" | "setSelectedOption"
  | "setAnswerFeedback" | "setAdaptiveState" | "tickTimer" | "setTimeRemaining"
  | "addTimeExtension" | "setViolationWarning" | "incrementViolation"
  | "setPendingAnswer" | "setSubmitted" | "setDisqualified"
  | "setPauseReason" | "setSeatMismatch" | "setLoginError" | "reset"
  | "setSessionSecret" | "setPendingAnswerSeq" | "setCurrentQuestionStartedAt"
> = {
  serverUrl: "http://secureassess-lab.local:3000",
  hardwareToken: "",
  systemNo: "SYS-01",
  clientMode: "BROWSER",
  lockdownMode: "KIOSK",
  connected: false,
  examId: null,
  examTitle: "",
  examSubject: "",
  examDurationMinutes: 60,
  strictSeatBinding: true,
  sessionId: null,
  seatAllocation: null,
  studentName: "",
  registerNumber: "",
  year: "",
  phase: "INIT",
  currentQuestion: null,
  adaptiveState: null,
  selectedOptionIndex: null,
  answerFeedback: null,
  timeRemainingSeconds: 0,
  countdownSeconds: 10,
  violationCount: 0,
  disqualifyThreshold: 3,
  violationWarning: null,
  pendingAnswer: null,
  sessionSecret: "",
  pendingAnswerSeq: 0,
  currentQuestionStartedAt: null,
  submitted: false,
  disqualified: false,
  pauseReason: "",
  seatMismatchSystemNo: null,
  loginError: null,
};

export const useStudentStore = create<StudentState>((set, get) => ({
  ...DEFAULT_STATE,

  setMachineInfo: (serverUrl, hardwareToken, systemNo, clientMode, lockdownMode = "KIOSK") =>
    set({ serverUrl, hardwareToken, systemNo, clientMode, lockdownMode, phase: "LOBBY" }),

  setConnected: (connected) => set({ connected }),

  setExamInfo: (info) =>
    set({
      examId: info.examId,
      examTitle: info.examTitle,
      examSubject: info.examSubject,
      examDurationMinutes: info.examDurationMinutes,
      strictSeatBinding: info.strictSeatBinding,
      disqualifyThreshold: info.disqualifyThreshold,
      lockdownMode: info.lockdownMode,
    }),

  setSession: (sessionId, seatAllocation, studentName, registerNumber, year) =>
    set({ sessionId, seatAllocation, studentName, registerNumber, year, phase: "WAITING", loginError: null }),

  setPhase: (phase) => set({ phase }),

  setCountdown: (countdownSeconds) => set({ countdownSeconds }),

  setQuestion: (payload) =>
    set({
      currentQuestion: payload,
      selectedOptionIndex: null,
      answerFeedback: null,
      timeRemainingSeconds: payload.timeRemainingSeconds,
      adaptiveState: payload.adaptiveState,
      phase: "ACTIVE",
      currentQuestionStartedAt: Date.now(),
    }),

  setSelectedOption: (selectedOptionIndex) => set({ selectedOptionIndex }),

  setAnswerFeedback: (answerFeedback) => set({ answerFeedback, phase: answerFeedback ? "REVIEW" : "ACTIVE" }),

  setAdaptiveState: (adaptiveState) => set({ adaptiveState }),

  tickTimer: () =>
    set((s) => ({
      timeRemainingSeconds: Math.max(0, s.timeRemainingSeconds - 1),
    })),

  setTimeRemaining: (timeRemainingSeconds) => set({ timeRemainingSeconds }),

  addTimeExtension: (minutes) =>
    set((s) => ({ timeRemainingSeconds: s.timeRemainingSeconds + minutes * 60 })),

  setViolationWarning: (violationWarning) => set({ violationWarning }),

  incrementViolation: () =>
    set((s) => ({ violationCount: s.violationCount + 1 })),

  setPendingAnswer: (pendingAnswer) => set({ pendingAnswer }),

  setSessionSecret: (sessionSecret) => set({ sessionSecret, pendingAnswerSeq: 0 }),

  setPendingAnswerSeq: (pendingAnswerSeq) => set({ pendingAnswerSeq }),

  setCurrentQuestionStartedAt: (currentQuestionStartedAt) => set({ currentQuestionStartedAt }),

  setSubmitted: () =>
    set({ submitted: true, disqualified: false, phase: "SUBMITTED" }),

  setDisqualified: () =>
    set({ submitted: true, disqualified: true, phase: "DISQUALIFIED" }),

  setPauseReason: (pauseReason) => set({ pauseReason }),

  setSeatMismatch: (seatMismatchSystemNo) => set({ seatMismatchSystemNo }),

  setLoginError: (loginError) => set({ loginError }),

  reset: () => set({ ...DEFAULT_STATE, phase: "LOBBY" }),
}));
