import { beforeEach, describe, expect, it, vi } from "vitest";

const getAllSummaries = vi.fn();

vi.mock("@/content/puzzles", () => ({
  getAllSummaries,
}));

describe("sitemap", () => {
  beforeEach(() => {
    vi.resetModules();
    getAllSummaries.mockReset();
  });

  it("includes tag and difficulty collection pages", async () => {
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

    const { default: sitemap } = await import("@/app/sitemap");
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    // Every static path is now emitted once per locale with hreflang alternates.
    for (const locale of ["zh", "en", "ja", "ko"]) {
      expect(urls).toContain(`https://go-daily.app/${locale}/puzzles/tags/life-death`);
      expect(urls).toContain(`https://go-daily.app/${locale}/puzzles/tags/endgame`);
      expect(urls).toContain(`https://go-daily.app/${locale}/puzzles/difficulty/1`);
      expect(urls).toContain(`https://go-daily.app/${locale}/puzzles/difficulty/4`);
    }

    const homeEntry = entries.find((e) => e.url === "https://go-daily.app/en");
    expect(homeEntry?.alternates?.languages).toMatchObject({
      zh: "https://go-daily.app/zh",
      en: "https://go-daily.app/en",
      ja: "https://go-daily.app/ja",
      ko: "https://go-daily.app/ko",
      "x-default": "https://go-daily.app/en",
    });
  });
});
