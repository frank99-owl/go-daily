import { describe, expect, it } from "vitest";

import { createAttemptRecord } from "./storage";

describe("createAttemptRecord", () => {
  it("defaults the attempt date to the actual local day", () => {
    const realDate = Date;

    class MockDate extends Date {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length > 0) {
          super(...args);
        } else {
          super("2026-04-20T10:11:12");
        }
      }

      static override now() {
        return new realDate("2026-04-20T10:11:12").getTime();
      }
    }

    globalThis.Date = MockDate as unknown as DateConstructor;

    try {
      const record = createAttemptRecord({
        puzzleId: "cld-001",
        userMove: { x: 18, y: 0 },
        correct: true,
      });

      expect(record.date).toBe("2026-04-20");
      expect(record.solvedAtMs).toBe(new realDate("2026-04-20T10:11:12").getTime());
    } finally {
      globalThis.Date = realDate;
    }
  });

  it("allows callers to override the date explicitly", () => {
    const record = createAttemptRecord({
      puzzleId: "cld-002",
      userMove: { x: 17, y: 0 },
      correct: false,
      date: "2026-04-21",
      solvedAtMs: 123,
    });

    expect(record.date).toBe("2026-04-21");
    expect(record.solvedAtMs).toBe(123);
  });
});
