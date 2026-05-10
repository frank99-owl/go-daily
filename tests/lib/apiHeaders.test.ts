/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";

import { parseMutationBody, readRequestBodyBytes } from "@/lib/apiHeaders";

function jsonRequest(body: string, headers: HeadersInit = {}): Request {
  return new Request("https://go-daily.app/api/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://go-daily.app",
      ...headers,
    },
    body,
  });
}

describe("apiHeaders", () => {
  it("rejects oversized JSON bodies even when Content-Length is absent", async () => {
    const request = jsonRequest(JSON.stringify({ value: "x".repeat(64) }));

    const result = await parseMutationBody(request, 16);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Request body too large." });
  });

  it("parses JSON bodies that stay within the byte ceiling", async () => {
    const result = await parseMutationBody(jsonRequest('{"ok":true}'), 64);

    expect(result).toEqual({ ok: true });
  });

  it("supports custom too-large errors for raw body readers", async () => {
    const request = jsonRequest("x".repeat(20));

    const result = await readRequestBodyBytes(request, 4, "payload_too_large");

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "payload_too_large" });
  });
});
