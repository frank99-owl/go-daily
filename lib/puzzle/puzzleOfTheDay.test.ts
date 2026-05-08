import { describe, expect, it } from "vitest";

import { getPuzzleForDate, todayLocalKey } from "./puzzleOfTheDay";

describe("getPuzzleForDate", () => {
  it("rotates through all puzzles daily", async () => {
    expect((await getPuzzleForDate("2026-04-18")).id).toBe("p-00001");
    expect((await getPuzzleForDate("2026-04-19")).id).toBe("p-00002");
    expect((await getPuzzleForDate("2026-05-01")).id).toBe("p-00014");
    expect((await getPuzzleForDate("2026-05-02")).id).toBe("p-00015");
    expect((await getPuzzleForDate("2026-06-16")).id).toBe("p-00060");
  });

  it("uses the onboarding level as the daily puzzle pool", async () => {
    expect(
      (await getPuzzleForDate("2026-04-18", { level: "beginner", viewerKey: "u1" })).difficulty,
    ).toBe(1);
    expect(
      [2, 3].includes(
        (await getPuzzleForDate("2026-04-18", { level: "intermediate", viewerKey: "u1" }))
          .difficulty,
      ),
    ).toBe(true);
    expect(
      [4, 5].includes(
        (await getPuzzleForDate("2026-04-18", { level: "advanced", viewerKey: "u1" })).difficulty,
      ),
    ).toBe(true);
  });

  it("keeps a user's daily puzzle stable for the same date and level", async () => {
    const first = await getPuzzleForDate("2026-05-08", {
      level: "advanced",
      viewerKey: "user-1",
    });
    const second = await getPuzzleForDate("2026-05-08", {
      level: "advanced",
      viewerKey: "user-1",
    });

    expect(second.id).toBe(first.id);
  });
});

describe("todayLocalKey", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(todayLocalKey(new Date(2026, 3, 20))).toBe("2026-04-20");
  });
});
