import { describe, expect, it } from "vitest";

import {
  MIN_EASE_FACTOR,
  nextEaseFactor,
  nextSrsCardForAttempt,
  reviewSrsCard,
} from "@/lib/puzzle/srs";

describe("SRS scheduling", () => {
  it("creates an immediately due card for a wrong attempt", () => {
    const card = nextSrsCardForAttempt({
      card: null,
      correct: false,
      solvedAt: new Date("2026-04-24T03:30:00.000Z"),
      timeZone: "UTC",
    });

    expect(card).toMatchObject({
      intervalDays: 0,
      dueDate: "2026-04-24",
    });
    expect(card?.easeFactor).toBe(2.18);
    expect(card?.lastReviewedAt).toBe("2026-04-24T03:30:00.000Z");
  });

  it("does not create a card for a first-time correct attempt", () => {
    const card = nextSrsCardForAttempt({
      card: null,
      correct: true,
      solvedAt: new Date("2026-04-24T03:30:00.000Z"),
      timeZone: "UTC",
    });

    expect(card).toBeNull();
  });

  it("advances a due card through SM-2 intervals after correct reviews", () => {
    const first = reviewSrsCard({
      card: { easeFactor: 2.18, intervalDays: 0 },
      quality: 5,
      reviewedAt: new Date("2026-04-24T00:00:00.000Z"),
      timeZone: "UTC",
    });
    const second = reviewSrsCard({
      card: first,
      quality: 5,
      reviewedAt: new Date("2026-04-25T00:00:00.000Z"),
      timeZone: "UTC",
    });
    const third = reviewSrsCard({
      card: second,
      quality: 5,
      reviewedAt: new Date("2026-05-01T00:00:00.000Z"),
      timeZone: "UTC",
    });

    expect(first.intervalDays).toBe(1);
    expect(first.dueDate).toBe("2026-04-25");
    expect(second.intervalDays).toBe(6);
    expect(second.dueDate).toBe("2026-05-01");
    expect(third.intervalDays).toBe(15);
    expect(third.dueDate).toBe("2026-05-16");
  });

  it("respects the user's timezone when choosing the review day", () => {
    const card = nextSrsCardForAttempt({
      card: null,
      correct: false,
      solvedAt: new Date("2026-04-24T16:30:00.000Z"),
      timeZone: "Asia/Shanghai",
    });

    expect(card?.dueDate).toBe("2026-04-25");
  });

  it("never drops ease factor below the SM-2 floor", () => {
    const ease = Array.from({ length: 10 }).reduce<number>(
      (current) => nextEaseFactor(current, 0),
      1.31,
    );

    expect(ease).toBe(MIN_EASE_FACTOR);
  });
});
