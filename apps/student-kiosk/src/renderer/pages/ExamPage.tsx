// ============================================================
// SecureAssess Student Kiosk — Exam Page
// ============================================================
// Single-question focus layout.
// Handles: question display, option selection, answer submission,
//          feedback flash, next question fetch, timer ticking,
//          pause/resume overlay, tier-up badge, time-up auto-submit
// ============================================================

import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { useStudentStore } from "../store/studentStore";
import { useSocket }       from "../hooks/useSocket";
import { EVENTS }          from "@secureassess/shared";

import { ExamHeader }        from "../components/ExamHeader";
import { ViolationToast }    from "../components/ViolationToast";
import { PauseOverlay }      from "../components/PauseOverlay";
import { TierUpBadge }       from "../components/TierUpBadge";
import { ConnectionBanner }  from "../components/ConnectionBanner";
import { CountdownOverlay }  from "../components/CountdownOverlay";
import { OptionButton }      from "../components/OptionButton";

const HEARTBEAT_INTERVAL  = 10_000;

export default function ExamPage() {
  const navigate = useNavigate();
  const { socket, connected } = useSocket();

  // Store subscriptions
  const phase             = useStudentStore((s) => s.phase);
  const sessionId         = useStudentStore((s) => s.sessionId);
  const currentQuestion   = useStudentStore((s) => s.currentQuestion);
  const selectedOption    = useStudentStore((s) => s.selectedOptionIndex);
  const adaptiveState     = useStudentStore((s) => s.adaptiveState);
  const timeRemaining     = useStudentStore((s) => s.timeRemainingSeconds);
  const clientMode        = useStudentStore((s) => s.clientMode);

  const store = useStudentStore.getState;

  // ── Redirect guards ───────────────────────────────────────
  useEffect(() => {
    if (!sessionId) navigate("/", { replace: true });
  }, [sessionId]);

  useEffect(() => {
    if (phase === "SUBMITTED" || phase === "DISQUALIFIED") {
      navigate("/", { replace: true }); // App.tsx intercepts and shows SubmittedPage
    }
  }, [phase]);

  // ── Timer tick ────────────────────────────────────────────
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (phase !== "ACTIVE" && phase !== "REVIEW") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      store().tickTimer();
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── Time-up: auto-submit ──────────────────────────────────
  useEffect(() => {
    if (timeRemaining === 0 && sessionId && phase === "ACTIVE") {
      handleSubmitExam();
    }
    // 5-min and 1-min warnings are emitted by the server via EXAM_TIME_WARNING
  }, [timeRemaining]);

  // ── Heartbeat ─────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    const hb = setInterval(() => {
      socket.emit(EVENTS.STUDENT_HEARTBEAT, {
        sessionId,
        timestamp: new Date().toISOString(),
      });
    }, HEARTBEAT_INTERVAL);
    return () => clearInterval(hb);
  }, [sessionId]);

  // ── Request first question on mount ──────────────────────
  useEffect(() => {
    if (!sessionId || currentQuestion) return;
    if (phase === "ACTIVE" || phase === "COUNTDOWN") {
      requestNextQuestion();
    }
  }, [sessionId, phase]);

  // ── Countdown → Active transition ────────────────────────
  useEffect(() => {
    if (phase !== "COUNTDOWN") return;
    // When countdown hits 0 the server will emit exam:statusChanged ACTIVE
    // We also watch our countdown seconds
    if (store().countdownSeconds <= 0) {
      store().setPhase("ACTIVE");
      requestNextQuestion();
    }
  }, [phase, useStudentStore((s) => s.countdownSeconds)]);

  // ── Feedback auto-advance is REMOVED (zero-leak mode) ────
  // The server never sends isCorrect/correctIndex back to the client.
  // After submission we immediately request the next question.

  // ── Core actions ──────────────────────────────────────────

  const requestNextQuestion = useCallback(() => {
    if (!sessionId) return;
    socket.emit(
      EVENTS.STUDENT_REQUEST_NEXT_QUESTION,
      { sessionId },
      (resp: any) => {
        if (resp?.success && resp.data) {
          store().setQuestion(resp.data);
        } else if (!resp?.success) {
          handleSubmitExam();
        }
      }
    );
  }, [sessionId, socket]);

  const handleSelectOption = (index: number) => {
    if (phase !== "ACTIVE") return;
    store().setSelectedOption(index);
    store().setPendingAnswer({
      questionId: currentQuestion!.question.id,
      chosenIndex: index,
    });
  };

  const handleSubmitAnswer = useCallback(async () => {
    if (!sessionId || selectedOption === null || !currentQuestion) return;
    if (phase !== "ACTIVE") return;

    const { question } = currentQuestion;
    const questionId   = question.id;
    const chosenIndex  = selectedOption;

    // ── Compute HMAC with SubtleCrypto (browser-native) ────
    // seq is managed in the store to survive renders
    const seq = (store().pendingAnswerSeq ?? 0) + 1;
    store().setPendingAnswerSeq(seq);

    let packetHmac = "";
    const secret = store().sessionSecret;
    if (secret) {
      try {
        const enc     = new TextEncoder();
        const keyData = enc.encode(secret);
        const payload = enc.encode(`${sessionId}|${questionId}|${chosenIndex}|${seq}`);
        const cryptoKey = await crypto.subtle.importKey(
          "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const sig = await crypto.subtle.sign("HMAC", cryptoKey, payload);
        packetHmac = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
      } catch { /* non-fatal — server accepts missing HMAC during dev */ }
    }

    // Record start time for timeSpentMs (stored in store when question was set)
    const timeSpentMs = store().currentQuestionStartedAt
      ? Date.now() - store().currentQuestionStartedAt!
      : 0;

    store().setPendingAnswer({ questionId, chosenIndex });
    // Set phase to loading so the UI shows "submitting" immediately
    store().setPhase("ACTIVE"); // stays ACTIVE — no REVIEW phase

    socket.emit(
      EVENTS.STUDENT_SUBMIT_ANSWER,
      { sessionId, questionId, chosenIndex, seq, timeSpentMs, packetHmac },
      (resp: any) => {
        store().setPendingAnswer(null);
        if (resp?.success) {
          // Update difficulty tier if changed (only info returned from server)
          if (resp.data?.difficultyChanged && resp.data?.newDifficulty) {
            store().setAdaptiveState({
              ...(store().adaptiveState ?? {
                currentDifficulty: "EASY",
                consecutiveCorrect: 0,
                currentScore: store().adaptiveState?.currentScore ?? 0,
                highestTierReached: "EASY",
                questionsAnswered: 0,
                totalQuestions: 0,
              }),
              currentDifficulty: resp.data.newDifficulty,
              highestTierReached:
                ["EASY","MEDIUM","HARD"].indexOf(resp.data.newDifficulty) >
                ["EASY","MEDIUM","HARD"].indexOf(store().adaptiveState?.highestTierReached ?? "EASY")
                  ? resp.data.newDifficulty
                  : (store().adaptiveState?.highestTierReached ?? "EASY"),
              questionsAnswered: resp.data.questionsAnswered ?? 0,
              totalQuestions: resp.data.totalQuestions ?? 0,
            });
          }
          // Advance to next question immediately — no feedback pause
          requestNextQuestion();
        } else {
          // Server rejected — keep question visible for retry
          store().setSelectedOption(null);
        }
      }
    );
  }, [sessionId, selectedOption, currentQuestion, phase, socket]);

  const handleSubmitExam = useCallback(() => {
    if (!sessionId) return;
    socket.emit(EVENTS.STUDENT_SUBMIT_EXAM, { sessionId }, () => {
      store().setSubmitted();
    });
  }, [sessionId, socket]);

  // ── Keyboard: Space/Enter to confirm selection ────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (phase === "ACTIVE" && selectedOption !== null) {
          handleSubmitAnswer();
        }
      }
      if (["1", "2", "3", "4"].includes(e.key) && phase === "ACTIVE") {
        handleSelectOption(parseInt(e.key, 10) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, selectedOption, handleSubmitAnswer]);

  // ── Render helpers ────────────────────────────────────────
  // ZERO-LEAK: No getOptionFeedback — the client never knows correct/incorrect.

  const question = currentQuestion?.question;
  const options  = question ? [...(question.options ?? [])].sort((a, b) => a.index - b.index) : [];

  // ── Loading / no question state ───────────────────────────
  if (!question) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <ConnectionBanner />
        <ViolationToast />
        <PauseOverlay />
        <CountdownOverlay />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 rounded-full border-4 border-cobalt-200 border-t-cobalt-500 animate-spin" />
          <p className="text-slate-500 text-sm">Loading your question…</p>
        </div>
      </div>
    );
  }

  const difficultyLabel = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };
  const difficultyColor = {
    EASY:   "bg-emerald-100 text-emerald-700",
    MEDIUM: "bg-amber-100   text-amber-700",
    HARD:   "bg-red-100     text-red-700",
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col select-none">
      {/* Overlays */}
      <ViolationToast />
      <ConnectionBanner />
      <PauseOverlay />
      <CountdownOverlay />
      <TierUpBadge />

      {/* Header */}
      <ExamHeader />

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-start py-8 px-4">
        <div className="w-full max-w-2xl space-y-6">

          {/* Question card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={question.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            >
              {/* Question header strip */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">
                    Q{(adaptiveState?.questionsAnswered ?? 0) + 1}
                    {adaptiveState?.totalQuestions
                      ? ` of ${adaptiveState.totalQuestions}`
                      : ""}
                  </span>
                  {question.topicTag && (
                    <>
                      <span className="text-slate-200">·</span>
                      <span className="text-xs text-slate-400 italic truncate max-w-[180px]">
                        {question.topicTag}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    "text-xs font-semibold px-2.5 py-0.5 rounded-full",
                    difficultyColor[question.difficulty]
                  )}>
                    {difficultyLabel[question.difficulty]}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {question.points} pts
                  </span>
                </div>
              </div>

              {/* Question text */}
              <div className="px-6 py-6">
                <p className="text-slate-800 text-base leading-relaxed font-medium">
                  {question.questionText}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Options */}
          <AnimatePresence mode="wait">
            <motion.div
              key={question.id + "-options"}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.08, duration: 0.22 }}
              className="space-y-3"
            >
              {options.map((opt) => (
                <OptionButton
                  key={opt.index}
                  index={opt.index}
                  text={opt.text}
                  selected={selectedOption === opt.index}
                  feedback={null}
                  disabled={phase !== "ACTIVE"}
                  onClick={() => handleSelectOption(opt.index)}
                />
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Submit button — shown when option is selected */}
          <AnimatePresence>
            {selectedOption !== null && phase === "ACTIVE" && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
              >
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmitAnswer}
                  className="w-full py-3.5 rounded-xl bg-cobalt-500 text-white font-semibold text-sm
                             hover:bg-cobalt-600 transition-colors shadow-md shadow-blue-500/20"
                >
                  Confirm Answer
                  <span className="ml-2 opacity-50 text-xs font-normal">(Enter)</span>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Keyboard hint */}
          {phase === "ACTIVE" && selectedOption === null && (
            <p className="text-center text-xs text-slate-300">
              Press <kbd className="bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 text-[10px] font-mono">1</kbd>–
              <kbd className="bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 text-[10px] font-mono">4</kbd> to select · 
              <kbd className="bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 text-[10px] font-mono ml-1">Enter</kbd> to confirm
            </p>
          )}
        </div>
      </main>

      {/* Bottom status bar */}
      <footer className="border-t border-slate-200 bg-white px-6 py-2.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className={clsx(
              "w-1.5 h-1.5 rounded-full",
              connected ? "bg-emerald-500" : "bg-red-400 animate-pulse"
            )} />
            {connected ? "Secure connection active" : "Reconnecting…"}
          </span>
          <span>
            {clientMode === "KIOSK"
              ? "🔒 Kiosk Mode"
              : "🌐 Browser Mode"}
          </span>
          <span className="tabular-nums">
            {adaptiveState
              ? `Score: ${adaptiveState.currentScore} pts`
              : ""}
          </span>
        </div>
      </footer>
    </div>
  );
}
