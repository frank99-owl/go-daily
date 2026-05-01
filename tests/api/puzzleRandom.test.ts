/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/puzzle/random/route";
import type { PuzzleSummary } from "@/types";

const getAllSummariesMock = vi.hoisted(() => vi.fn());

vi.mock("@/content/puzzles", () => ({
  getAllSummaries: getAllSummariesMock,
}));

const summaries: PuzzleSummary[] = [
  {
    id: "p-00001",
    difficulty: 1,
    source: "Classical",
    date: "2026-04-18",
    prompt: { zh: "黑先", en: "Black to play", ja: "黒番", ko: "흑 차례" },
    boardSize: 19,
    tag: "life-death",
  },
  {
    id: "p-00002",
    difficulty: 2,
    source: "Classical",
    date: "2026-04-19",
    prompt: { zh: "白先", en: "White to play", ja: "白番", ko: "백 차례" },
    boardSize: 9,
    tag: "tesuji",
  },
];

let ipCounter = 0;

function request(headers?: HeadersInit): Request {
  ipCounter += 1;
  return new Request("http://localhost/api/puzzle/random", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "x-forwarded-for": `10.1.0.${ipCounter}`,
      ...(headers ?? {}),
    },
  });
}

describe("/api/puzzle/random", () => {
  beforeEach(() => {
    getAllSummariesMock.mockReset();
    getAllSummariesMock.mockResolvedValue(summaries);
  });

  it("returns one puzzle id without returning the full id list", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.75);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ puzzleId: "p-00002" });
    expect(body).not.toHaveProperty("puzzleIds");
  });

  it("rejects cross-origin random requests", async () => {
    const response = await POST(request({ origin: "https://evil.example" }));

    expect(response.status).toBe(403);
  });

  it("returns 404 when there are no puzzles", async () => {
    getAllSummariesMock.mockResolvedValue([]);

    const response = await POST(request());

    expect(response.status).toBe(404);
  });
});
