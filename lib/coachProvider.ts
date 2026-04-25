import OpenAI from "openai";

export interface CoachProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CoachProvider {
  createReply(messages: CoachProviderMessage[]): Promise<string>;
}

class ManagedOpenAICompatibleCoachProvider implements CoachProvider {
  private readonly client: OpenAI;
  private readonly model: string;

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
  }

  async createReply(messages: CoachProviderMessage[]): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.6,
      max_tokens: 400,
    });
    return completion.choices[0]?.message?.content?.trim() ?? "";
  }
}

export function createManagedCoachProvider({
  apiKey,
  timeout,
}: {
  apiKey: string;
  timeout: number;
}): CoachProvider {
  return new ManagedOpenAICompatibleCoachProvider({
    apiKey,
    baseURL: "https://api.deepseek.com",
    model: process.env.COACH_MODEL || "deepseek-chat",
    timeout,
  });
}
