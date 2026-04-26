import { describe, expect, it } from "vitest";

import { getPuzzleForDate, todayLocalKey } from "./puzzleOfTheDay";

describe("getPuzzleForDate", () => {
  it("rotates through curated-only daily puzzles", async () => {
    expect((await getPuzzleForDate("2026-04-18")).id).toBe("cld-001");
    expect((await getPuzzleForDate("2026-04-19")).id).toBe("cld-002");
    expect((await getPuzzleForDate("2026-05-01")).id).toBe("cld-014");
    expect((await getPuzzleForDate("2026-05-02")).id).toBe("cld-015");
    expect((await getPuzzleForDate("2026-06-16")).id).toBe("cld-060");
  });
});

describe("todayLocalKey", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(todayLocalKey(new Date(2026, 3, 20))).toBe("2026-04-20");
  });
});
