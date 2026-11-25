// ============================================================
// SecureAssess Teacher Desktop — MCQ Generator Page
// PDF upload → AI generation (online/offline) → review/edit
// ============================================================

import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { useExamStore } from "../store/examStore";
import { useTeacherSocket } from "../hooks/useTeacherSocket";
import { api } from "../lib/api";
import { cn, difficultyBg } from "../lib/utils";
import { EVENTS } from "@secureassess/shared";
import toast from "react-hot-toast";
import type { MCQQuestion } from "@secureassess/shared";

type Mode = "online" | "offline";
type Provider = "openai" | "groq" | "gemini";

export default function MCQGeneratorPage() {
  const { id = "" } = useParams();
  const { socket } = useTeacherSocket();
  const genProgress = useExamStore((s) => s.mcqGenProgress);
  const generatedQs = useExamStore((s) => s.generatedQuestions);
  const clearQs     = useExamStore((s) => s.clearGeneratedQuestions);

  // Existing questions
  const [existingQs, setExistingQs] = useState<MCQQuestion[]>([]);
  const [loadedExisting, setLoadedExisting] = useState(false);

  // PDF
  const [pdfText, setPdfText]       = useState("");
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Gen config
  const [mode, setMode]             = useState<Mode>("offline");
  const [provider, setProvider]     = useState<Provider>("groq");
  const [apiKey, setApiKey]         = useState("");
  const [offlineModel, setOfflineModel] = useState("qwen3:8b");
  const [targetCount, setTargetCount]   = useState(30);
  const [dist, setDist]             = useState({ easy: 40, medium: 40, hard: 20 });
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting]   = useState(false);

  const handlePdfUpload = async (file: File) => {
    if (!file) return;
    setExtracting(true);
    try {
      const form = new FormData();
      form.append("pdf", file);
      const result = await api.upload<{ text: string; pages: number; wordCount: number }>(
        `/api/mcq/${id}/extract-pdf`, form
      );
      setPdfText(result.text);
      toast.success(`Extracted ${result.wordCount.toLocaleString()} words from ${result.pages} pages`);
    } catch (err: any) {
      toast.error(err.message ?? "PDF extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerate = () => {
    if (!pdfText) { toast.error("Extract text from a PDF first"); return; }
    if (!socket) { toast.error("Not connected to server"); return; }
    if (mode === "online" && !apiKey) { toast.error("API key required for online mode"); return; }
    if (dist.easy + dist.medium + dist.hard !== 100) { toast.error("Difficulty distribution must sum to 100%"); return; }

    setGenerating(true);
    clearQs();

    socket.emit(EVENTS.MCQ_GENERATE, {
      examId: id, pdfText, targetCount, mode,
      onlineProvider: mode === "online" ? provider : undefined,
      apiKey: mode === "online" ? apiKey : undefined,
      offlineModel: mode === "offline" ? offlineModel : undefined,
      difficultyDistribution: dist,
    }, (resp: any) => {
      if (!resp.success) {
        setGenerating(false);
        toast.error(resp.error ?? "Generation failed");
      }
      // Progress/completion handled via socket events in useTeacherSocket
    });
  };

  // Auto-stop generating when complete
  if (genProgress?.stage === "COMPLETE" || genProgress?.stage === "ERROR") {
    setGenerating(false);
  }

  const handleImportAll = async () => {
    if (generatedQs.length === 0) return;
    setImporting(true);
    try {
      const { imported, totalQuestions } = await api.post<{ imported: number; totalQuestions: number }>(
        `/api/mcq/${id}/bulk-import`, { questions: generatedQs }
      );
      toast.success(`Imported ${imported} questions (total: ${totalQuestions})`);
      clearQs();
      loadExisting();
    } catch (err: any) {
      toast.error(err.message ?? "Import failed");
    } finally {
      setImporting(false); }
  };

  const loadExisting = async () => {
    setLoadedExisting(false);
    const { questions } = await api.get<{ questions: MCQQuestion[] }>(`/api/mcq/${id}`);
    setExistingQs(questions);
    setLoadedExisting(true);
  };

  const handleDeleteQuestion = async (qId: string) => {
    await api.delete(`/api/mcq/${id}/${qId}`);
    setExistingQs((qs) => qs.filter((q) => q.id !== qId));
    toast.success("Question deleted");
  };

  return (
    <AppShell title="MCQ Generator" subtitle="AI-powered question generation from PDF">
      <div className="p-5 grid grid-cols-5 gap-5 h-[calc(100vh-7rem)] overflow-hidden">

        {/* Left panel: config */}
        <div className="col-span-2 flex flex-col gap-4 overflow-y-auto">
          {/* PDF Upload */}
          <Card>
            <CardHeader title="1. Source PDF" />
            <div className="p-4 space-y-3">
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-[#374151] rounded-xl p-6 text-center cursor-pointer hover:border-cobalt-500/50 transition-colors"
              >
                <p className="text-sm text-slate-400">Drop PDF here or click to browse</p>
                <p className="text-xs text-slate-600 mt-1">Max 50 MB</p>
              </div>
              <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                onChange={(e) => e.target.files?.[0] && handlePdfUpload(e.target.files[0])} />
              {extracting && <p className="text-xs text-cobalt-400 animate-pulse">Extracting text…</p>}
              {pdfText && (
                <div className="bg-[#0B1120] rounded-lg p-2.5 max-h-28 overflow-y-auto">
                  <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
                    {pdfText.slice(0, 400)}…
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Mode & Config */}
          <Card>
            <CardHeader title="2. AI Mode" />
            <div className="p-4 space-y-4">
              {/* Mode toggle */}
              <div className="flex gap-2">
                {(["online", "offline"] as Mode[]).map((m) => (
                  <button key={m} onClick={() => setMode(m)}
                    className={cn("flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all",
                      mode === m ? "bg-cobalt-500 text-white" : "bg-[#1F2937] text-slate-400 hover:text-white")}>
                    {m === "online" ? "☁ Online LLM" : "⚡ Offline (Ollama)"}
                  </button>
                ))}
              </div>

              {mode === "online" ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Provider</label>
                    <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}
                      className="w-full bg-[#0B1120] border border-[#374151] text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cobalt-500">
                      <option value="groq">Groq (llama-3.1-8b-instant)</option>
                      <option value="openai">OpenAI (gpt-4o-mini)</option>
                      <option value="gemini">Gemini (gemini-1.5-flash)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">API Key</label>
                    <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-[#0B1120] border border-[#374151] text-sm text-white rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-1 focus:ring-cobalt-500"
                      placeholder="sk-…" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Model</label>
                  <input value={offlineModel} onChange={(e) => setOfflineModel(e.target.value)}
                    className="w-full bg-[#0B1120] border border-[#374151] text-sm text-white rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-1 focus:ring-cobalt-500"
                    placeholder="qwen3:8b" />
                  <p className="text-[10px] text-slate-600 mt-1">Ollama must be running on localhost:11434</p>
                </div>
              )}

              {/* Count */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Target Count: {targetCount}</label>
                <input type="range" min={5} max={100} value={targetCount} onChange={(e) => setTargetCount(Number(e.target.value))}
                  className="w-full accent-cobalt-500" />
              </div>

              {/* Difficulty distribution */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 block">Difficulty Distribution</label>
                {(["easy", "medium", "hard"] as const).map((d) => (
                  <div key={d} className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-semibold w-12 capitalize", d === "easy" ? "text-emerald-400" : d === "medium" ? "text-amber-400" : "text-red-400")}>{d}</span>
                    <input type="range" min={0} max={100} value={dist[d]}
                      onChange={(e) => setDist((dd) => ({ ...dd, [d]: Number(e.target.value) }))}
                      className="flex-1 accent-cobalt-500" />
                    <span className="text-xs text-slate-400 tabular-nums w-8 text-right">{dist[d]}%</span>
                  </div>
                ))}
                <p className={cn("text-[10px]", dist.easy + dist.medium + dist.hard !== 100 ? "text-red-400" : "text-slate-600")}>
                  Total: {dist.easy + dist.medium + dist.hard}%
                </p>
              </div>

              <Button className="w-full" onClick={handleGenerate} loading={generating} disabled={!pdfText}>
                {generating ? "Generating…" : "Generate Questions"}
              </Button>

              {/* Progress */}
              {genProgress && generating && (
                <div className="bg-[#0B1120] rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{genProgress.stage}</span>
                    <span className="tabular-nums text-cobalt-400">{genProgress.generated}/{genProgress.target}</span>
                  </div>
                  <div className="h-1.5 bg-[#1F2937] rounded-full overflow-hidden">
                    <div className="h-full bg-cobalt-500 rounded-full transition-all duration-500"
                      style={{ width: `${(genProgress.generated / genProgress.target) * 100}%` }} />
                  </div>
                  {genProgress.currentTopic && <p className="text-[10px] text-slate-500 italic">{genProgress.currentTopic}</p>}
                  {genProgress.error && <p className="text-[10px] text-red-400">{genProgress.error}</p>}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right panel: generated + existing questions */}
        <div className="col-span-3 flex flex-col gap-4 overflow-y-auto">
          {/* Generated questions */}
          {generatedQs.length > 0 && (
            <Card>
              <CardHeader
                title={`Generated Questions (${generatedQs.length})`}
                subtitle="Review before importing"
                actions={
                  <Button size="xs" onClick={handleImportAll} loading={importing}>
                    Import All →
                  </Button>
                }
              />
              <div className="max-h-72 overflow-y-auto divide-y divide-[#1F2937]">
                {generatedQs.map((q, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-white leading-snug flex-1">{q.questionText}</p>
                      <Badge className={cn("text-[9px] flex-shrink-0", difficultyBg(q.difficulty))}>
                        {q.difficulty}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-1 mt-2">
                      {q.options.map((o) => (
                        <p key={o.index} className={cn(
                          "text-xs rounded px-2 py-1",
                          o.index === q.correctIndex ? "bg-emerald-500/15 text-emerald-400" : "text-slate-500"
                        )}>
                          {String.fromCharCode(65 + o.index)}. {o.text}
                        </p>
                      ))}
                    </div>
                    {q.topicTag && <p className="text-[10px] text-slate-600 mt-1 italic">{q.topicTag}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Existing questions */}
          <Card>
            <CardHeader
              title="Exam Questions"
              subtitle={loadedExisting ? `${existingQs.length} questions` : ""}
              actions={
                <Button size="xs" variant="secondary" onClick={loadExisting}>Refresh</Button>
              }
            />
            {!loadedExisting ? (
              <div className="p-6 text-center">
                <Button variant="ghost" size="sm" onClick={loadExisting}>Load Questions</Button>
              </div>
            ) : existingQs.length === 0 ? (
              <p className="text-xs text-slate-500 text-center p-6">No questions yet. Generate from a PDF above.</p>
            ) : (
              <div className="divide-y divide-[#1F2937] max-h-96 overflow-y-auto">
                {existingQs.map((q, i) => (
                  <div key={q.id} className="px-4 py-3 group">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-slate-600 tabular-nums w-5 flex-shrink-0 pt-0.5">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white leading-snug">{q.questionText}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={cn("text-[9px]", difficultyBg(q.difficulty))}>{q.difficulty}</Badge>
                          <span className="text-[10px] text-slate-500">{q.points} pts</span>
                          {q.topicTag && <span className="text-[10px] text-slate-600 italic">{q.topicTag}</span>}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteQuestion(q.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-400 p-1 text-xs">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
