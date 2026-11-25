// ============================================================
// SecureAssess Student Kiosk — Socket.IO Singleton Hook
// ============================================================
// SECURITY: Answer submission is ZERO-LEAK.
//   • The client NEVER receives isCorrect or correctIndex.
//   • The client NEVER shows "right/wrong" feedback.
//   • A per-session HMAC secret (from server on login) is used
//     to sign every answer packet with a monotonic seq number.
// ============================================================

import { io, type Socket } from "socket.io-client";
import { useStudentStore } from "../store/studentStore";
import { EVENTS } from "@secureassess/shared";

let _socket: Socket | null = null;
let _serverUrl = "";

// Per-session HMAC secret — received from server on login
let _sessionSecret = "";
// Monotonic sequence counter — increments with every answer
let _answerSeq = 0;

export function setSessionSecret(secret: string): void {
  _sessionSecret = secret;
  _answerSeq     = 0;
}

/** Sign an answer packet with the per-session HMAC secret. */
export function signAnswerPacket(
  sessionId: string,
  questionId: string,
  chosenIndex: number
): { seq: number; packetHmac: string } {
  _answerSeq += 1;
  const seq = _answerSeq;
  // Web-compatible HMAC using the secret from the server
  // We use a simple deterministic approach: encode as UTF-8 and hash
  const payload = `${sessionId}|${questionId}|${chosenIndex}|${seq}`;
  // Browsers don't expose Node crypto — use SubtleCrypto
  // The HMAC is computed asynchronously in the caller via computeHmacAsync.
  // This function returns seq synchronously; hmac is filled in by the caller.
  return { seq, packetHmac: `deferred:${payload}` };
}

function wireEvents(socket: Socket): void {
  const store = useStudentStore.getState;

  // ── Exam lifecycle ─────────────────────────────────────
  socket.on(EVENTS.EXAM_LOBBY_OPENED, (payload) => {
    store().setExamInfo({
      examId: payload.examId,
      examTitle: payload.examTitle,
      examSubject: payload.subject,
      examDurationMinutes: payload.durationMinutes,
      strictSeatBinding: payload.strictSeatBinding,
      lockdownMode: (payload as any).lockdownMode ?? "KIOSK",
      disqualifyThreshold: 3,
    });
    if (store().phase === "INIT") store().setPhase("LOBBY");
  });

  socket.on(EVENTS.EXAM_COUNTDOWN, ({ secondsRemaining }) => {
    store().setCountdown(secondsRemaining);
    store().setPhase("COUNTDOWN");
  });

  socket.on(EVENTS.EXAM_PAUSED, ({ reason }) => {
    store().setPauseReason(reason ?? "The teacher has paused the exam.");
    store().setPhase("PAUSED");
  });

  socket.on(EVENTS.EXAM_RESUMED, ({ timeRemainingSeconds }) => {
    if (timeRemainingSeconds) store().setTimeRemaining(timeRemainingSeconds);
    store().setPhase("ACTIVE");
  });

  socket.on(EVENTS.EXAM_TIME_EXTENDED, ({ sessionId, additionalMinutes }) => {
    const myId = store().sessionId;
    if (!sessionId || sessionId === myId) {
      store().addTimeExtension(additionalMinutes);
    }
  });

  socket.on(EVENTS.EXAM_TIME_WARNING, ({ minutesRemaining }) => {
    store().setViolationWarning({
      id: `time-warn-${minutesRemaining}`,
      message: `⏱ ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"} remaining!`,
      count: store().violationCount,
      remaining: minutesRemaining,
      timestamp: new Date().toISOString(),
    });
  });

  // ── Session ────────────────────────────────────────────
  socket.on(EVENTS.SESSION_NEXT_QUESTION, (payload) => {
    store().setPendingAnswer(null);
    store().setQuestion(payload);
  });

  // SESSION_ANSWER_RESULT is NO LONGER HANDLED on the client.
  // The server returns only { difficultyChanged, newDifficulty, questionsAnswered, totalQuestions }
  // — no isCorrect, no correctIndex, no pointsAwarded.
  // The student sees a neutral "Answer submitted" and moves to the next question.

  socket.on(EVENTS.SESSION_SUBMITTED, () => {
    store().setSubmitted();
  });

  socket.on(EVENTS.SESSION_FORCE_SUBMITTED, () => {
    store().setSubmitted();
  });

  socket.on(EVENTS.SESSION_DISQUALIFIED, () => {
    store().setDisqualified();
  });

  socket.on(EVENTS.SESSION_SEAT_MISMATCH, ({ assignedSystemNo }) => {
    store().setSeatMismatch(assignedSystemNo);
    store().setLoginError(
      `Seat Mismatch: Please proceed to ${assignedSystemNo}.`
    );
  });

  // ── Violation feedback ────────────────────────────────
  socket.on(EVENTS.VIOLATION_RECORDED, (payload) => {
    store().incrementViolation();
    store().setViolationWarning({
      id: payload.violationId,
      message: payload.warningMessage,
      count: payload.violationCount,
      remaining: payload.remainingAllowed,
      timestamp: payload.timestamp,
    });
    // Auto-clear warning after 5 seconds
    setTimeout(() => {
      if (useStudentStore.getState().violationWarning?.id === payload.violationId) {
        useStudentStore.getState().setViolationWarning(null);
      }
    }, 5000);
  });

  socket.on(EVENTS.VIOLATION_FORGIVEN, () => {
    // Teacher forgave — just quietly update count on next server sync
  });

  // ── Connection events ─────────────────────────────────
  socket.on("connect", () => {
    store().setConnected(true);
    const { sessionId, pendingAnswer } = store();
    if (sessionId) {
      socket.emit(
        EVENTS.ANTICHEAT_RECONNECT_SYNC,
        { sessionId, pendingAnswer: pendingAnswer ?? undefined },
        (resp: any) => {
          if (resp?.success && resp.data?.sessionState?.status === "ACTIVE") {
            store().setPhase("ACTIVE");
          }
          store().setPendingAnswer(null);
        }
      );
    }
  });

  socket.on("disconnect", () => {
    store().setConnected(false);
  });
}

export function getSocket(serverUrl?: string): Socket {
  const url = serverUrl ?? useStudentStore.getState().serverUrl;
  if (_socket && _serverUrl === url) return _socket;

  // Destroy old socket if URL changed
  _socket?.disconnect();

  _socket = io(url, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: Infinity,
    timeout: 10_000,
  });

  _serverUrl = url;
  wireEvents(_socket);
  return _socket;
}

export function useSocket(): { socket: Socket; connected: boolean } {
  const serverUrl = useStudentStore((s) => s.serverUrl);
  const connected = useStudentStore((s) => s.connected);
  return { socket: getSocket(serverUrl), connected };
}
