import { describe, expect, it } from "vitest";

import {
  filterSummariesByDifficulty,
  filterSummariesByTag,
  getAvailableDifficulties,
  getAvailableTags,
  getDifficultyCollectionPath,
  getTagCollectionPath,
  isValidPuzzleDifficulty,
  isValidPuzzleTag,
} from "@/lib/puzzleCollections";
import type { PuzzleSummary } from "@/types";

const summaries: PuzzleSummary[] = [
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
];

describe("puzzleCollections", () => {
  it("derives available tags and difficulty bands", () => {
    expect(getAvailableTags(summaries)).toEqual(["endgame", "life-death"]);
    expect(getAvailableDifficulties(summaries)).toEqual([1, 4]);
  });

  it("filters summaries and builds collection paths", () => {
    expect(filterSummariesByTag(summaries, "endgame")).toHaveLength(1);
    expect(filterSummariesByDifficulty(summaries, 1)).toHaveLength(1);
    expect(getTagCollectionPath("endgame")).toBe("/puzzles/tags/endgame");
    expect(getDifficultyCollectionPath(4)).toBe("/puzzles/difficulty/4");
  });

  it("validates tag and difficulty params", () => {
    expect(isValidPuzzleTag("tesuji")).toBe(true);
    expect(isValidPuzzleTag("fuseki")).toBe(false);
    expect(isValidPuzzleDifficulty("3")).toBe(true);
    expect(isValidPuzzleDifficulty("9")).toBe(false);
  });
});
