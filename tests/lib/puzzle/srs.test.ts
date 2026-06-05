import { describe, expect, it } from "vitest";

import {
  MIN_EASE_FACTOR,
  nextEaseFactor,
  nextSrsCardForAttempt,
  qualityFromAttempt,
  qualityFromAttemptWithReason,
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

describe("qualityFromAttempt", () => {
  it("returns 5 for correct and 2 for incorrect", () => {
    expect(qualityFromAttempt(true)).toBe(5);
    expect(qualityFromAttempt(false)).toBe(2);
  });
});

describe("qualityFromAttemptWithReason", () => {
  it("returns 5 for correct regardless of mistake reason", () => {
    expect(qualityFromAttemptWithReason(true)).toBe(5);
    expect(qualityFromAttemptWithReason(true, "shape-reading")).toBe(5);
    expect(qualityFromAttemptWithReason(true, null)).toBe(5);
  });

  it("returns 3 for missed-vital-point (near-miss, mild penalty)", () => {
    expect(qualityFromAttemptWithReason(false, "missed-vital-point")).toBe(3);
  });

  it("returns 1 for shape-reading (core calculation error, aggressive penalty)", () => {
    expect(qualityFromAttemptWithReason(false, "shape-reading")).toBe(1);
  });

  it("returns 1 for liberty-counting (core calculation error, aggressive penalty)", () => {
    expect(qualityFromAttemptWithReason(false, "liberty-counting")).toBe(1);
  });

  it("returns 2 for endgame-value (standard penalty)", () => {
    expect(qualityFromAttemptWithReason(false, "endgame-value")).toBe(2);
  });

  it("returns 2 for opening-direction (standard penalty)", () => {
    expect(qualityFromAttemptWithReason(false, "opening-direction")).toBe(2);
  });

  it("returns 2 when no mistake reason is provided (backward compatible)", () => {
    expect(qualityFromAttemptWithReason(false)).toBe(2);
    expect(qualityFromAttemptWithReason(false, null)).toBe(2);
  });
});

describe("nextSrsCardForAttempt with mistakeReasonId", () => {
  it("uses aggressive penalty for shape-reading errors (quality 1)", () => {
    const card = nextSrsCardForAttempt({
      card: null,
      correct: false,
      solvedAt: new Date("2026-04-24T03:30:00.000Z"),
      timeZone: "UTC",
      mistakeReasonId: "shape-reading",
    });

    expect(card).not.toBeNull();
    expect(card?.intervalDays).toBe(0);
    // quality 1 → ease factor drops more aggressively than quality 2
    expect(card?.easeFactor).toBeLessThan(2.18);
  });

  it("uses mild penalty for missed-vital-point errors (quality 3)", () => {
    const card = nextSrsCardForAttempt({
      card: null,
      correct: false,
      solvedAt: new Date("2026-04-24T03:30:00.000Z"),
      timeZone: "UTC",
      mistakeReasonId: "missed-vital-point",
    });

    expect(card).not.toBeNull();
    // quality 3 >= 3, so SM-2 treats it as a "pass" with interval 1
    expect(card?.intervalDays).toBe(1);
    // quality 3 → ease factor drops less than quality 2
    expect(card?.easeFactor).toBeGreaterThan(2.18);
  });

  it("uses standard penalty when no mistake reason is provided", () => {
    const card = nextSrsCardForAttempt({
      card: null,
      correct: false,
      solvedAt: new Date("2026-04-24T03:30:00.000Z"),
      timeZone: "UTC",
    });

    expect(card).not.toBeNull();
    expect(card?.easeFactor).toBe(2.18);
  });
});
