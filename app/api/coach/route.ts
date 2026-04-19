import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { CoachMessage, Coord, Locale } from "@/types";
import { PUZZLES } from "@/content/puzzles";
import { buildSystemPrompt } from "@/lib/coachPrompt";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024; // 8 KB
const MAX_HISTORY = 6;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;

type CoachRequest = {
  puzzleId: string;
  locale: Locale;
  userMove: Coord;
  isCorrect: boolean;
  history: CoachMessage[];
};

// Simple per-process in-memory rate limit. Not persistent, not perfect,
// but enough of a brake against an accidentally noisy client.
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const prev = (hits.get(ip) ?? []).filter((t) => t > windowStart);
  if (prev.length >= RATE_LIMIT_MAX) {
    hits.set(ip, prev);
    return true;
  }
  prev.push(now);
  hits.set(ip, prev);
  return false;
}

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isLocale(v: unknown): v is Locale {
  return v === "zh" || v === "en" || v === "ja" || v === "ko";
}

export async function POST(request: Request) {
  // Body size cap
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return badRequest("Request body too large.", 413);
  }

  // Rate limit
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  if (rateLimited(ip)) {
    return badRequest("Too many requests, slow down.", 429);
  }

  // Parse
  let body: Partial<CoachRequest>;
  try {
    body = (await request.json()) as Partial<CoachRequest>;
  } catch {
    return badRequest("Invalid JSON.");
  }

  const { puzzleId, locale, userMove, isCorrect, history } = body;

  if (typeof puzzleId !== "string" || !puzzleId) {
    return badRequest("Missing puzzleId.");
  }
  if (!isLocale(locale)) {
    return badRequest("Invalid locale.");
  }
  if (!userMove || typeof userMove.x !== "number" || typeof userMove.y !== "number") {
    return badRequest("Invalid userMove.");
  }
  if (typeof isCorrect !== "boolean") {
    return badRequest("Missing isCorrect.");
  }
  if (!Array.isArray(history) || history.length === 0) {
    return badRequest("History must contain at least the user's question.");
  }

  const puzzle = PUZZLES.find((p) => p.id === puzzleId);
  if (!puzzle) return badRequest("Unknown puzzleId.", 404);

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "The AI coach is not configured on the server (missing DEEPSEEK_API_KEY).",
      },
      { status: 500 },
    );
  }

  // Keep only the last MAX_HISTORY turns, and strip anything exotic.
  const trimmedHistory: CoachMessage[] = history
    .slice(-MAX_HISTORY)
    .filter(
      (m): m is CoachMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000), ts: 0 }));

  const systemPrompt = buildSystemPrompt(puzzle, locale, userMove, isCorrect);

  const openaiMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [{ role: "system", content: systemPrompt }];

  for (const m of trimmedHistory) {
    openaiMessages.push({ role: m.role, content: m.content });
  }

  try {
    // DeepSeek is OpenAI-API compatible — we just swap the baseURL + model.
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com",
    });
    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: openaiMessages,
      temperature: 0.6,
      max_tokens: 400,
    });
    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!reply) {
      return NextResponse.json({ error: "Empty reply from the model." }, { status: 502 });
    }
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[coach] upstream error:", err);
    return NextResponse.json(
      { error: "Coach is temporarily unavailable. Please try again later." },
      { status: 502 },
    );
  }
}
