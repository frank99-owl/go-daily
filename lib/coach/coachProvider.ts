import OpenAI from "openai";

import { getCoachEnv } from "@/lib/env";

export interface CoachProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CoachProviderUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usageAvailable: boolean;
}

export interface CoachStreamChunk {
  /** Token text — empty string for the final usage-only chunk. */
  delta: string;
  /** Populated on the last chunk when stream_options.include_usage is set. */
  usage: CoachProviderUsage | null;
  /** Model name (available on first chunk). */
  model: string | null;
  /** True when this is the final chunk. */
  done: boolean;
}

export interface CoachProvider {
  createReplyStream(
    messages: CoachProviderMessage[],
    options?: { signal?: AbortSignal },
  ): AsyncIterable<CoachStreamChunk>;
}

/**
 * Sampling temperature for every coach reply. Exported so `evals/coach/run.ts`
 * samples exactly as production does — an eval that copied this number by
 * hand would silently stop measuring the real coach the first time it changed.
 */
export const COACH_TEMPERATURE = 0.6;

export type CoachThinking = "enabled" | "disabled";

/**
 * DeepSeek's thinking switch as a request-body extension, or nothing at all.
 * Returned as a spread so an unset value adds no key — an OpenAI-compatible
 * endpoint that is not DeepSeek must never receive a parameter it does not know.
 */
export function thinkingParam(thinking: CoachThinking | undefined): {
  thinking?: { type: CoachThinking };
} {
  return thinking ? { thinking: { type: thinking } } : {};
}

/**
 * The thinking switch an endpoint actually receives: the explicit setting when
 * there is one, otherwise "disabled" for DeepSeek's own API and nothing for
 * anyone else.
 *
 * Why default to disabled on DeepSeek. Verified against api.deepseek.com on
 * 2026-09-16: `deepseek-v4-flash`, `deepseek-reasoner` and `deepseek-flash`
 * all resolve to `deepseek-flash` with thinking ON by default, while
 * `deepseek-chat` resolves to the same model with it OFF — and all four accept
 * `thinking: { type: "disabled" }`. So whichever of those names COACH_MODEL
 * holds, disabling is accepted and gives the coach the behavior the eval
 * passes 16/16 with. Leaving it to the model name meant one config value
 * silently decided between a 2-second answer and an empty reply.
 *
 * Why only on DeepSeek. The default is keyed to the endpoint host, not the
 * model name, so a fallback on another vendor never receives a parameter it
 * does not know — that would fail exactly the request the fallback exists
 * to save.
 */
export function resolveThinking(
  explicit: CoachThinking | undefined,
  baseURL: string,
): CoachThinking | undefined {
  if (explicit) return explicit;
  try {
    return new URL(baseURL).hostname === "api.deepseek.com" ? "disabled" : undefined;
  } catch {
    return undefined;
  }
}

export class ManagedOpenAICompatibleCoachProvider implements CoachProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly baseURL: string;
  private readonly maxTokens: number;
  private readonly thinking: CoachThinking | undefined;

  constructor({
    apiKey,
    baseURL,
    model,
    timeout,
    maxTokens,
    thinking,
  }: {
    apiKey: string;
    baseURL: string;
    model: string;
    timeout: number;
    /** Reasoning + answer budget — see COACH_MAX_TOKENS in lib/env.ts. */
    maxTokens: number;
    /** DeepSeek thinking switch; undefined sends no parameter. */
    thinking?: CoachThinking;
  }) {
    this.client = new OpenAI({
      apiKey,
      baseURL,
      timeout,
      maxRetries: 1,
    });
    this.model = model;
    this.baseURL = baseURL;
    this.maxTokens = maxTokens;
    this.thinking = thinking;
  }

  async *createReplyStream(
    messages: CoachProviderMessage[],
    options?: { signal?: AbortSignal },
  ): AsyncIterable<CoachStreamChunk> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages,
        temperature: COACH_TEMPERATURE,
        max_tokens: this.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        // Not in the OpenAI SDK's types; the SDK forwards the body as given.
        ...(thinkingParam(this.thinking) as Record<string, never>),
      },
      { signal: options?.signal },
    );

    let model: string | null = null;
    for await (const chunk of stream) {
      if (chunk.model) model = chunk.model;
      const delta = chunk.choices[0]?.delta?.content ?? "";
      const raw = chunk.usage;
      const isLast = chunk.choices.length === 0 && raw != null;
      yield {
        delta,
        usage: raw
          ? {
              inputTokens: raw.prompt_tokens ?? null,
              outputTokens: raw.completion_tokens ?? null,
              totalTokens: raw.total_tokens ?? null,
              usageAvailable: true,
            }
          : null,
        model,
        done: isLast || chunk.choices[0]?.finish_reason != null,
      };
    }
  }
}

export class FallbackCoachProvider implements CoachProvider {
  constructor(private readonly providers: CoachProvider[]) {
    if (providers.length === 0) {
      throw new Error("FallbackCoachProvider requires at least one provider");
    }
  }

  async *createReplyStream(
    messages: CoachProviderMessage[],
    options?: { signal?: AbortSignal },
  ): AsyncIterable<CoachStreamChunk> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        const iterator = provider.createReplyStream(messages, options)[Symbol.asyncIterator]();
        const first = await iterator.next();

        async function* wrappedStream() {
          if (!first.done) yield first.value;
          yield* {
            [Symbol.asyncIterator]() {
              return iterator;
            },
          };
        }

        yield* wrappedStream();
        return;
      } catch (error) {
        console.warn(
          "[CoachProvider] stream failed, attempting fallback if available...",
          error instanceof Error ? error.message : error,
        );
        lastError = error;
      }
    }
    throw lastError;
  }
}

function parseThinking(raw: string | undefined): CoachThinking | undefined {
  return raw === "enabled" || raw === "disabled" ? raw : undefined;
}

export function createManagedCoachProvider({
  apiKey,
  timeout,
}: {
  apiKey: string;
  timeout: number;
}): CoachProvider {
  const env = getCoachEnv();
  const model = env.COACH_MODEL;
  const primaryUrl = env.COACH_API_URL;
  const fallbackUrl = process.env.COACH_FALLBACK_API_URL;
  const fallbackApiKey = process.env.COACH_FALLBACK_API_KEY || apiKey;
  const fallbackModel = process.env.COACH_FALLBACK_MODEL || model;
  // Not inherited from COACH_THINKING: the fallback may be a different vendor.
  // resolveThinking applies the host-based default to it independently.
  const fallbackThinking = parseThinking(process.env.COACH_FALLBACK_THINKING);

  const maxTokens = env.COACH_MAX_TOKENS;

  const primaryProvider = new ManagedOpenAICompatibleCoachProvider({
    apiKey,
    baseURL: primaryUrl,
    model,
    timeout,
    maxTokens,
    thinking: resolveThinking(env.COACH_THINKING, primaryUrl),
  });

  if (!fallbackUrl) {
    return primaryProvider;
  }

  const secondaryProvider = new ManagedOpenAICompatibleCoachProvider({
    apiKey: fallbackApiKey,
    baseURL: fallbackUrl,
    model: fallbackModel,
    timeout,
    maxTokens,
    thinking: resolveThinking(fallbackThinking, fallbackUrl),
  });

  return new FallbackCoachProvider([primaryProvider, secondaryProvider]);
}
