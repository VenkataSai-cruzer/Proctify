// ============================================================
// SecureAssess — Dual-Mode PDF-to-MCQ Generator
// Online: OpenAI / Groq / Gemini
// Offline: Ollama (local LLM, e.g. qwen3:8b, llama3.2)
// ============================================================

import OpenAI from "openai";
import { LLMGeneratedMCQArraySchema } from "@secureassess/shared";
import type { z } from "zod";

type MCQArray = z.infer<typeof LLMGeneratedMCQArraySchema>;

// ── System prompt template ────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert academic question designer. 
Generate high-quality multiple-choice questions from the provided text.
Return ONLY valid JSON — a JSON array of question objects with no additional prose.
Each object must have exactly these fields:
{
  "questionText": "string (clear, unambiguous question)",
  "options": [
    {"index": 0, "text": "option A"},
    {"index": 1, "text": "option B"},
    {"index": 2, "text": "option C"},
    {"index": 3, "text": "option D"}
  ],
  "correctIndex": <0|1|2|3>,
  "difficulty": <"EASY"|"MEDIUM"|"HARD">,
  "topicTag": "short topic label"
}
Rules:
- Never repeat questions.
- Distribute difficulty as instructed.
- Options must be plausible distractors — no obviously wrong answers.
- correctIndex must match the genuinely correct option.`;

function buildUserPrompt(
  text: string,
  count: number,
  dist: { easy: number; medium: number; hard: number }
): string {
  return `Generate exactly ${count} MCQ questions from the following text.
Difficulty distribution: ${dist.easy}% EASY, ${dist.medium}% MEDIUM, ${dist.hard}% HARD.
(EASY = recall/definition, MEDIUM = application, HARD = analysis/inference)

--- SOURCE TEXT ---
${text.slice(0, 12000)}
--- END TEXT ---

Return a JSON array only.`;
}

function parseAndValidateLLMResponse(raw: string): MCQArray {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

  // Find JSON array bounds
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON array found in LLM response");

  const json = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(json);
  const result = LLMGeneratedMCQArraySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Schema validation failed: ${result.error.issues.map((i) => i.message).join(", ")}`);
  }
  return result.data;
}

// ── Cosine-similarity deduplication ──────────────────────────

function tokenize(text: string): Map<string, number> {
  const tokens = text.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/);
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  return freq;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, normA = 0, normB = 0;
  for (const [k, v] of a) { dot += v * (b.get(k) ?? 0); normA += v * v; }
  for (const [, v] of b) normB += v * v;
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function deduplicateMCQs(questions: MCQArray, threshold = 0.85): { deduped: MCQArray; removed: number } {
  const unique: MCQArray = [];
  const vectors = questions.map((q) => tokenize(q.questionText));

  for (let i = 0; i < questions.length; i++) {
    let isDuplicate = false;
    for (let j = 0; j < unique.length; j++) {
      const sim = cosineSimilarity(vectors[i]!, tokenize(unique[j]!.questionText));
      if (sim >= threshold) { isDuplicate = true; break; }
    }
    if (!isDuplicate) unique.push(questions[i]!);
  }

  return { deduped: unique, removed: questions.length - unique.length };
}

// ── Online Mode ───────────────────────────────────────────────

export async function generateOnline(params: {
  pdfText: string;
  targetCount: number;
  provider: "openai" | "groq" | "gemini";
  apiKey: string;
  difficultyDistribution: { easy: number; medium: number; hard: number };
}): Promise<MCQArray> {
  const baseURLMap: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    groq:   "https://api.groq.com/openai/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  };
  const modelMap: Record<string, string> = {
    openai: "gpt-4o-mini",
    groq:   "llama-3.1-8b-instant",
    gemini: "gemini-1.5-flash",
  };

  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: baseURLMap[params.provider],
  });

  const response = await client.chat.completions.create({
    model: modelMap[params.provider]!,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: buildUserPrompt(params.pdfText, params.targetCount, params.difficultyDistribution) },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message.content ?? "[]";
  return parseAndValidateLLMResponse(raw);
}

// ── Offline Mode (Ollama) ─────────────────────────────────────

export async function generateOffline(params: {
  pdfText: string;
  targetCount: number;
  model: string;
  difficultyDistribution: { easy: number; medium: number; hard: number };
}): Promise<MCQArray> {
  const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";

  const body = {
    model: params.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: buildUserPrompt(params.pdfText, params.targetCount, params.difficultyDistribution) },
    ],
    stream: false,
    format: "json",
    options: { temperature: 0.7, num_predict: 4096 },
  };

  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { message: { content: string } };
  return parseAndValidateLLMResponse(data.message.content);
}
