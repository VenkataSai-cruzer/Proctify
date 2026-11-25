// ============================================================
// SecureAssess Teacher Desktop — Socket.IO Hook
// Singleton socket for the teacher session. Wires all
// server→client events into the Zustand exam store.
// ============================================================

import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "../store/authStore";
import { useExamStore } from "../store/examStore";
import { EVENTS } from "@secureassess/shared";
import type { StudentSession, ViolationEvent, LeaderboardEntry } from "@secureassess/shared";

let _socket: Socket | null = null;
let _serverUrl = "";
let _token = "";

function wireEvents(socket: Socket): void {
  const exam = () => useExamStore.getState();

  socket.on("connect", () => {
    // Re-join exam room after reconnect
    const { activeExam } = exam();
    const { token } = useAuthStore.getState();
    if (activeExam && token) {
      socket.emit(EVENTS.AUTH_TEACHER_JOIN, { token, examId: activeExam.id }, () => {});
    }
  });

  socket.on(EVENTS.DASHBOARD_SESSION_GRID, ({ sessions }: { sessions: StudentSession[] }) => {
    exam().setSessions(sessions);
  });

  socket.on(EVENTS.DASHBOARD_SESSION_DELTA, ({ session }: { session: StudentSession }) => {
    exam().upsertSession(session);
  });

  socket.on(EVENTS.DASHBOARD_VIOLATION_ALERT, (v: ViolationEvent) => {
    exam().addViolation(v);
  });

  socket.on(EVENTS.DASHBOARD_LEADERBOARD, ({ entries }: { entries: LeaderboardEntry[] }) => {
    exam().setLeaderboard(entries);
  });

  socket.on(EVENTS.CCTV_LIVE_FRAME, ({ frameBase64 }: { frameBase64: string }) => {
    exam().setCctvFrame(frameBase64);
  });

  socket.on(EVENTS.CCTV_SERVICE_STATUS, ({ connected }: { connected: boolean }) => {
    exam().setCctvConnected(connected);
  });

  socket.on(EVENTS.EXAM_STATUS_CHANGED, ({ status }: { status: string }) => {
    const active = exam().activeExam;
    if (active) exam().setActiveExam({ ...active, status: status as any });
  });

  socket.on(EVENTS.MCQ_GENERATION_PROGRESS, (payload: any) => {
    exam().setMcqGenProgress(payload);
  });

  socket.on(EVENTS.MCQ_GENERATION_COMPLETE, (payload: any) => {
    exam().setMcqGenProgress(null);
    exam().setGeneratedQuestions(payload.questions);
  });
}

export function getTeacherSocket(): Socket | null {
  const { token, serverUrl } = useAuthStore.getState();
  if (!token || !serverUrl) return null;

  if (_socket && _serverUrl === serverUrl && _token === token) return _socket;

  _socket?.disconnect();

  _socket = io(serverUrl, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 2000,
  });

  _serverUrl = serverUrl;
  _token = token;
  wireEvents(_socket);

  // Authenticate immediately
  _socket.on("connect", () => {
    _socket!.emit(EVENTS.AUTH_TEACHER_JOIN, { token }, () => {});
  });

  return _socket;
}

export function useTeacherSocket(): { socket: Socket | null; connected: boolean } {
  const socket = getTeacherSocket();
  return { socket, connected: !!socket?.connected };
}
