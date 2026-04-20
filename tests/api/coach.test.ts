/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import { POST } from "@/app/api/coach/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/coach", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("400 — bad request", () => {
    it("returns 400 for missing puzzleId", async () => {
      const res = await POST(
        makeRequest({ locale: "zh", userMove: { x: 0, y: 0 }, isCorrect: true, history: [] }),
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error.toLowerCase()).toMatch(/expected string|puzzleid/);
    });

    it("returns 400 for empty puzzleId", async () => {
      const res = await POST(
        makeRequest({
          puzzleId: "",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid locale", async () => {
      const res = await POST(
        makeRequest({
          puzzleId: "test",
          locale: "fr",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error.toLowerCase()).toContain("zh");
    });

    it("returns 400 for non-integer userMove", async () => {
      const res = await POST(
        makeRequest({
          puzzleId: "test",
          locale: "zh",
          userMove: { x: 1.5, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty history", async () => {
      const res = await POST(
        makeRequest({
          puzzleId: "test",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [],
        }),
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error.toLowerCase()).toContain("history");
    });

    it("returns 400 for invalid JSON", async () => {
      const req = new Request("http://localhost/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("404 — unknown puzzle", () => {
    it("returns 404 for a puzzleId that does not exist", async () => {
      const res = await POST(
        makeRequest({
          puzzleId: "nonexistent-puzzle-99999",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [{ role: "user", content: "hi", ts: 0 }],
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("413 — body too large", () => {
    it("returns 413 when content-length exceeds 8KB", async () => {
      const req = new Request("http://localhost/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "9001" },
        body: JSON.stringify({
          puzzleId: "x",
          locale: "zh",
          userMove: { x: 0, y: 0 },
          isCorrect: true,
          history: [],
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(413);
    });
  });

  describe("429 — rate limit", () => {
    it("returns 429 after too many requests from the same IP", async () => {
      const body = {
        puzzleId: "nonexistent-429-test",
        locale: "zh" as const,
        userMove: { x: 0, y: 0 },
        isCorrect: true,
        history: [{ role: "user" as const, content: "hi", ts: 0 }],
      };

      // Same IP header for all requests
      const headers = { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" };

      let lastStatus = 0;
      for (let i = 0; i < 15; i++) {
        const req = new Request("http://localhost/api/coach", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const res = await POST(req);
        lastStatus = res.status;
        if (res.status === 429) break;
      }

      expect(lastStatus).toBe(429);
      // The first 10 should have been 404 (unknown puzzle), then 429.
    });
  });
});
