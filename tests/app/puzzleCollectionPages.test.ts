import { beforeEach, describe, expect, it, vi } from "vitest";

const getAllSummaries = vi.fn();

vi.mock("@/content/puzzles", () => ({
  getAllSummaries,
}));

describe("puzzle collection pages", () => {
  beforeEach(() => {
    vi.resetModules();
    getAllSummaries.mockReset();
    getAllSummaries.mockResolvedValue([
      {
        id: "cld-001",
        difficulty: 1,
        source: "Editorial",
        date: "2026-04-21",
        prompt: { zh: "黑先活", en: "Black to play and live", ja: "黒先活", ko: "흑선활" },
        isCurated: true,
        boardSize: 19,
        tag: "life-death",
      },
      {
        id: "lib-0317",
        difficulty: 4,
        source: "Library",
        date: "2026-04-22",
        prompt: {
          zh: "黑先官子",
          en: "Black to play — best endgame move",
          ja: "黒先ヨセ",
          ko: "흑선 끝내기",
        },
        isCurated: false,
        boardSize: 19,
        tag: "endgame",
      },
    ]);
  });

  it("builds static params and metadata for tag collections", async () => {
    const page = await import("@/app/[locale]/puzzles/tags/[tag]/page");

    await expect(page.generateStaticParams()).resolves.toEqual([
      { tag: "endgame" },
      { tag: "life-death" },
    ]);

    await expect(
      page.generateMetadata({
        params: Promise.resolve({ tag: "endgame", locale: "en" }),
      }),
    ).resolves.toMatchObject({
      title: "Endgame Go Puzzles — go-daily",
      alternates: { canonical: "/en/puzzles/tags/endgame" },
    });
  });

  it("builds static params and metadata for difficulty collections", async () => {
    const page = await import("@/app/[locale]/puzzles/difficulty/[level]/page");

    await expect(page.generateStaticParams()).resolves.toEqual([{ level: "1" }, { level: "4" }]);

    await expect(
      page.generateMetadata({
        params: Promise.resolve({ level: "4", locale: "en" }),
      }),
    ).resolves.toMatchObject({
      title: "Difficulty ★★★★☆ Go Puzzles — go-daily",
      alternates: { canonical: "/en/puzzles/difficulty/4" },
    });
  });
});
