// ============================================================
// SecureAssess Student Kiosk — Submitted / Disqualified Page
// ============================================================
// Students see ONLY "Exam Submitted Successfully" — no scores,
// no answers, no hints. This is a strict spec requirement.
// ============================================================

import { motion } from "framer-motion";
import { useStudentStore } from "../store/studentStore";

export default function SubmittedPage() {
  const disqualified   = useStudentStore((s) => s.disqualified);
  const studentName    = useStudentStore((s) => s.studentName);
  const registerNumber = useStudentStore((s) => s.registerNumber);
  const systemNo       = useStudentStore((s) => s.systemNo);
  const examTitle      = useStudentStore((s) => s.examTitle);

  if (disqualified) {
    return <DisqualifiedScreen
      studentName={studentName}
      registerNumber={registerNumber}
      systemNo={systemNo}
    />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="bg-white rounded-2xl shadow-xl border border-slate-200 p-10 max-w-md w-full text-center"
      >
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 mb-6 mx-auto"
        >
          <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            Exam Submitted!
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Your answers have been recorded successfully.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-6 py-4 px-5 bg-slate-50 rounded-xl border border-slate-100 text-left space-y-2"
        >
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Name</span>
            <span className="font-semibold text-slate-800">{studentName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Register No.</span>
            <span className="font-mono font-semibold text-slate-800">{registerNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">System</span>
            <span className="font-semibold text-slate-800">{systemNo}</span>
          </div>
          {examTitle && (
            <div className="flex justify-between text-sm border-t border-slate-100 pt-2">
              <span className="text-slate-500">Exam</span>
              <span className="font-semibold text-slate-800 text-right max-w-[180px]">{examTitle}</span>
            </div>
          )}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 text-xs text-slate-400 leading-relaxed"
        >
          Your teacher will announce results at the end of the session.
          <br />
          Please remain at your seat until dismissed.
        </motion.p>

        {/* Animated idle rings to keep kiosk visually active */}
        <div className="mt-8 flex justify-center">
          <div className="relative w-12 h-12">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute inset-0 rounded-full border-2 border-emerald-300"
                animate={{ scale: [1, 1.8, 1.8], opacity: [0.6, 0, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8 }}
              />
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Disqualified Screen ───────────────────────────────────────

function DisqualifiedScreen({
  studentName,
  registerNumber,
  systemNo,
}: {
  studentName: string;
  registerNumber: string;
  systemNo: string;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-slate-100 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="bg-white rounded-2xl shadow-xl border border-red-100 p-10 max-w-md w-full text-center"
      >
        {/* Disqualified icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-6 mx-auto">
          <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-800 mb-2">
          Exam Session Ended
        </h1>
        <p className="text-slate-500 text-sm leading-relaxed">
          Your exam session was terminated due to repeated integrity violations.
        </p>

        <div className="mt-6 py-4 px-5 bg-red-50 rounded-xl border border-red-100 text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Name</span>
            <span className="font-semibold text-slate-800">{studentName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Register No.</span>
            <span className="font-mono font-semibold text-slate-800">{registerNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">System</span>
            <span className="font-semibold text-slate-800">{systemNo}</span>
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-400 leading-relaxed">
          Please remain at your seat and wait for your teacher.
          <br />
          Your teacher may review and restore your session if the violations were false positives.
        </p>
      </motion.div>
    </div>
  );
}
