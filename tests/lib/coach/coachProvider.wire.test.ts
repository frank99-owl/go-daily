// @vitest-environment node
/**
 * The coach provider against the real OpenAI SDK, over real HTTP.
 *
 * `coachProvider.test.ts` mocks the `openai` module to test fallback and
 * configuration, so nothing there exercises what the SDK actually puts on the
 * wire or how it parses a streamed reply. Those are exactly what a major SDK
 * upgrade can change — openai 6 → 7 in 2026-10 — and a mocked suite stays
 * green through it. This file runs the unmodified SDK against a local server
 * that speaks DeepSeek's streaming chat-completions format.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  COACH_TEMPERATURE,
  ManagedOpenAICompatibleCoachProvider,
  type CoachStreamChunk,
} from "@/lib/coach/coachProvider";

interface SeenRequest {
  path: string | undefined;
  authorization: string | undefined;
  body: Record<string, unknown>;
}

const BASE_CHUNK = {
  id: "c1",
  object: "chat.completion.chunk",
  created: 1,
  model: "deepseek-fake",
};

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

let server: http.Server | null = null;

/** Starts a fake endpoint that streams `parts`, then a stop chunk, then usage. */
async function fakeDeepSeek(parts: string[]): Promise<{ baseURL: string; seen: SeenRequest[] }> {
  const seen: SeenRequest[] = [];
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      seen.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const content of parts) {
        res.write(
          sse({ ...BASE_CHUNK, choices: [{ index: 0, delta: { content }, finish_reason: null }] }),
        );
      }
      res.write(sse({ ...BASE_CHUNK, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }));
      res.write(
        sse({
          ...BASE_CHUNK,
          choices: [],
          usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
        }),
      );
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { baseURL: `http://127.0.0.1:${port}`, seen };
}

async function collect(stream: AsyncIterable<CoachStreamChunk>): Promise<CoachStreamChunk[]> {
  const chunks: CoachStreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

describe("coach provider on the wire", () => {
  it("sends the request DeepSeek expects", async () => {
    const { baseURL, seen } = await fakeDeepSeek(["ok"]);
    const provider = new ManagedOpenAICompatibleCoachProvider({
      apiKey: "wire-key",
      baseURL,
      model: "deepseek-fake",
      timeout: 5000,
      maxTokens: 2000,
      thinking: "disabled",
    });

    await collect(provider.createReplyStream([{ role: "user", content: "hi" }]));

    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe("/chat/completions");
    expect(seen[0].authorization).toBe("Bearer wire-key");
    expect(seen[0].body).toMatchObject({
      model: "deepseek-fake",
      messages: [{ role: "user", content: "hi" }],
      temperature: COACH_TEMPERATURE,
      max_tokens: 2000,
      stream: true,
      stream_options: { include_usage: true },
      // Not in the SDK's types: the provider relies on the SDK forwarding it.
      thinking: { type: "disabled" },
    });
  });

  it("omits the thinking switch when none is configured", async () => {
    const { baseURL, seen } = await fakeDeepSeek(["ok"]);
    const provider = new ManagedOpenAICompatibleCoachProvider({
      apiKey: "wire-key",
      baseURL,
      model: "deepseek-fake",
      timeout: 5000,
      maxTokens: 2000,
    });

    await collect(provider.createReplyStream([{ role: "user", content: "hi" }]));

    expect(seen[0].body).not.toHaveProperty("thinking");
  });

  it("parses the streamed reply, the stop chunk and the usage chunk", async () => {
    const { baseURL } = await fakeDeepSeek(["Take ", "the vital ", "point."]);
    const provider = new ManagedOpenAICompatibleCoachProvider({
      apiKey: "wire-key",
      baseURL,
      model: "deepseek-fake",
      timeout: 5000,
      maxTokens: 2000,
    });

    const chunks = await collect(provider.createReplyStream([{ role: "user", content: "hi" }]));

    expect(chunks.map((chunk) => chunk.delta).join("")).toBe("Take the vital point.");
    expect(chunks.filter((chunk) => chunk.done)).toHaveLength(2);
    expect(chunks.at(-1)).toMatchObject({
      delta: "",
      done: true,
      model: "deepseek-fake",
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18, usageAvailable: true },
    });
  });
});
