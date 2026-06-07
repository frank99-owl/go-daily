/**
 * SSE stream construction for the coach API.
 *
 * Encapsulates the ReadableStream wiring, first-token sanitisation,
 * error recovery (usage refund), and analytics emission so the route
 * handler stays a thin HTTP orchestrator.
 */
import { createManagedCoachProvider, type CoachProviderUsage } from "@/lib/coach/coachProvider";
import { classifySseError, refundUsage, getCoachModelInfo } from "@/lib/coach/coachRouteHelpers";
import { sanitizeInput } from "@/lib/promptGuard";
import type { CoachMessage } from "@/types";
import { captureCoachCompleted, captureCoachFailed } from "./coachAnalytics";

// ── Types ─────────────────────────────────────────────────────────────

export interface StreamContext {
  apiKey: string;
  upstreamTimeoutMs: number;
  openaiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  locale: string;
  personaId: string;
  plan: string;
  distinctId: string;
  isGuest: boolean;
  refundParams: {
    guestDeviceId: string;
    countryCode: string | null;
    userId: string;
    usageDay: string;
  };
  updatedUsage: unknown;
  signal?: AbortSignal;
}

// ── History trimming ──────────────────────────────────────────────────

export function trimHistory(
  history: Array<{ role: string; content: string }>,
  maxMessages: number,
  maxChars: number,
): CoachMessage[] {
  const sanitized = history.slice(-maxMessages).map((m) => ({
    role: m.role as "user" | "assistant",
    content: sanitizeInput([...m.content.normalize("NFKC")].slice(0, 2000).join("")),
    ts: 0,
  }));

  let charBudget = maxChars;
  const trimmed: CoachMessage[] = [];
  for (let i = sanitized.length - 1; i >= 0; i--) {
    const m = sanitized[i];
    if (m.content.length > charBudget && trimmed.length > 0) break;
    trimmed.unshift(m);
    charBudget -= m.content.length;
  }
  return trimmed;
}

// ── SSE response builder ──────────────────────────────────────────────

export function buildSseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ── SSE stream factory ────────────────────────────────────────────────

export function createCoachSseStream(ctx: StreamContext): ReadableStream {
  const startTime = performance.now();
  const encoder = new TextEncoder();
  const modelInfo = getCoachModelInfo();

  // Construct provider OUTSIDE the ReadableStream so that construction
  // failures (e.g. network errors creating the OpenAI client) propagate
  // as thrown exceptions to the caller, which can return a proper HTTP
  // error response.  Once the stream starts, errors become SSE events.
  const provider = createManagedCoachProvider({
    apiKey: ctx.apiKey,
    timeout: ctx.upstreamTimeoutMs,
  });

  return new ReadableStream({
    async start(controller) {
      try {
        const stream = provider.createReplyStream(ctx.openaiMessages, { signal: ctx.signal });

        let tokenUsage: CoachProviderUsage | null = null;
        let modelName: string | null = null;
        let firstToken = true;

        for await (const chunk of stream) {
          if (chunk.model) modelName = chunk.model;
          if (chunk.usage) tokenUsage = chunk.usage;

          if (chunk.delta) {
            if (firstToken) {
              firstToken = false;
              chunk.delta = chunk.delta.replace(/^(system|SYSTEM)\s*[:：]\s*/i, "");
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`),
            );
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, usage: ctx.updatedUsage })}\n\n`),
        );
        controller.close();

        captureCoachCompleted(ctx.distinctId, {
          locale: ctx.locale,
          personaId: ctx.personaId || "default",
          plan: ctx.plan,
          model: modelName ?? modelInfo.model,
          provider: modelInfo.provider,
          durationMs: Math.round(performance.now() - startTime),
          inputTokens: tokenUsage?.inputTokens ?? null,
          outputTokens: tokenUsage?.outputTokens ?? null,
          totalTokens: tokenUsage?.totalTokens ?? null,
          usageAvailable: tokenUsage?.usageAvailable ?? false,
        });
      } catch (err) {
        const error = err as Error;
        await refundUsage(ctx.isGuest, ctx.refundParams);
        const errorCode = classifySseError(error);

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorCode })}\n\n`));
        controller.close();

        captureCoachFailed(ctx.distinctId, {
          locale: ctx.locale,
          personaId: ctx.personaId || "default",
          plan: ctx.plan,
          model: modelInfo.model,
          provider: modelInfo.provider,
          durationMs: Math.round(performance.now() - startTime),
          errorCode,
          httpStatus: 0,
        });
      }
    },
    cancel(reason) {
      console.debug("[coach] SSE stream canceled by client. Reason:", reason);
    },
  });
}
