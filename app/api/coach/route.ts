import { NextResponse } from "next/server";
import OpenAI from "openai";

import { getPuzzle } from "@/content/puzzles";
import { buildSystemPrompt } from "@/lib/coachPrompt";
import { createRateLimiter } from "@/lib/rateLimit";
import type { CoachMessage } from "@/types";
import { CoachRequestSchema } from "@/types/schemas";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024; // 8 KB
const MAX_HISTORY = 6;

const rateLimiter = createRateLimiter();

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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
  if (rateLimiter.isLimited(ip)) {
    return badRequest("Too many requests, slow down.", 429);
  }

  // Parse
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return badRequest("Invalid JSON.");
  }

  const parseResult = CoachRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const first = parseResult.error.issues[0];
    return badRequest(first.message);
  }

  const { puzzleId, locale, userMove, isCorrect, history } = parseResult.data;

  const puzzle = await getPuzzle(puzzleId);
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

  // Keep only the last MAX_HISTORY turns.
  const trimmedHistory: CoachMessage[] = history
    .slice(-MAX_HISTORY)
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
