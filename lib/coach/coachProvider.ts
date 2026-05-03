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

export interface CoachProviderResult {
  content: string;
  usage: CoachProviderUsage;
  model: string;
  provider: string;
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
  createReply(messages: CoachProviderMessage[]): Promise<CoachProviderResult>;
  createReplyStream(messages: CoachProviderMessage[]): AsyncIterable<CoachStreamChunk>;
}

export class ManagedOpenAICompatibleCoachProvider implements CoachProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly baseURL: string;

  constructor({
    apiKey,
    baseURL,
    model,
    timeout,
  }: {
    apiKey: string;
    baseURL: string;
    model: string;
    timeout: number;
  }) {
    this.client = new OpenAI({
      apiKey,
      baseURL,
      timeout,
      maxRetries: 1,
    });
    this.model = model;
    this.baseURL = baseURL;
  }

  async createReply(messages: CoachProviderMessage[]): Promise<CoachProviderResult> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.6,
      max_tokens: 400,
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    const raw = completion.usage;

    const usage: CoachProviderUsage = {
      inputTokens: raw?.prompt_tokens ?? null,
      outputTokens: raw?.completion_tokens ?? null,
      totalTokens: raw?.total_tokens ?? null,
      usageAvailable: raw != null,
    };

    return {
      content,
      usage,
      model: completion.model ?? this.model,
      provider: this.baseURL,
    };
  }

  async *createReplyStream(messages: CoachProviderMessage[]): AsyncIterable<CoachStreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.6,
      max_tokens: 400,
      stream: true,
      stream_options: { include_usage: true },
    });

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

  async createReply(messages: CoachProviderMessage[]): Promise<CoachProviderResult> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.createReply(messages);
      } catch (error) {
        console.warn(
          "[CoachProvider] API call failed, attempting fallback if available...",
          error instanceof Error ? error.message : error,
        );
        lastError = error;
      }
    }
    throw lastError; // All providers failed
  }

  async *createReplyStream(messages: CoachProviderMessage[]): AsyncIterable<CoachStreamChunk> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        yield* provider.createReplyStream(messages);
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

  const primaryProvider = new ManagedOpenAICompatibleCoachProvider({
    apiKey,
    baseURL: primaryUrl,
    model,
    timeout,
  });

  if (!fallbackUrl) {
    return primaryProvider;
  }

  const secondaryProvider = new ManagedOpenAICompatibleCoachProvider({
    apiKey: fallbackApiKey,
    baseURL: fallbackUrl,
    model: fallbackModel,
    timeout,
  });

  return new FallbackCoachProvider([primaryProvider, secondaryProvider]);
}
