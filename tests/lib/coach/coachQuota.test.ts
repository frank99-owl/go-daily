import { describe, expect, it } from "vitest";

import {
  formatDateInTimeZone,
  getAnchorDayFromFirstPaidAt,
  getBillingAnchoredMonthWindow,
  getNaturalMonthWindow,
} from "@/lib/coach/coachQuota";

describe("getNaturalMonthWindow", () => {
  it("returns the full calendar month for a typical date in UTC", () => {
    const window = getNaturalMonthWindow({
      now: new Date("2026-04-15T12:00:00Z"),
      timeZone: "UTC",
    });
    expect(window).toEqual({ startDay: "2026-04-01", endDay: "2026-04-30" });
  });

  it("handles 31-day months correctly", () => {
    const window = getNaturalMonthWindow({
      now: new Date("2026-05-10T00:00:00Z"),
      timeZone: "UTC",
    });
    expect(window).toEqual({ startDay: "2026-05-01", endDay: "2026-05-31" });
  });

  it("handles non-leap February (28 days)", () => {
    const window = getNaturalMonthWindow({
      now: new Date("2026-02-15T00:00:00Z"),
      timeZone: "UTC",
    });
    expect(window).toEqual({ startDay: "2026-02-01", endDay: "2026-02-28" });
  });

  it("handles leap February (29 days)", () => {
    const window = getNaturalMonthWindow({
      now: new Date("2024-02-15T00:00:00Z"),
      timeZone: "UTC",
    });
    expect(window).toEqual({ startDay: "2024-02-01", endDay: "2024-02-29" });
  });

  it("handles December → January year boundaries", () => {
    const december = getNaturalMonthWindow({
      now: new Date("2025-12-20T00:00:00Z"),
      timeZone: "UTC",
    });
    expect(december).toEqual({ startDay: "2025-12-01", endDay: "2025-12-31" });

    const january = getNaturalMonthWindow({
      now: new Date("2026-01-05T00:00:00Z"),
      timeZone: "UTC",
    });
    expect(january).toEqual({ startDay: "2026-01-01", endDay: "2026-01-31" });
  });

  it("shifts the month when the local date crosses a boundary vs UTC", () => {
    // 2026-04-30 23:30 UTC is already 2026-05-01 07:30 in Asia/Shanghai
    const nowAtMonthEndUtc = new Date("2026-04-30T23:30:00Z");

    const utcWindow = getNaturalMonthWindow({
      now: nowAtMonthEndUtc,
      timeZone: "UTC",
    });
    expect(utcWindow).toEqual({ startDay: "2026-04-01", endDay: "2026-04-30" });

    const shanghaiWindow = getNaturalMonthWindow({
      now: nowAtMonthEndUtc,
      timeZone: "Asia/Shanghai",
    });
    expect(shanghaiWindow).toEqual({ startDay: "2026-05-01", endDay: "2026-05-31" });
  });

  it("shifts the month backwards for timezones west of UTC", () => {
    // 2026-05-01 03:00 UTC is still 2026-04-30 23:00 in America/New_York (UTC-4)
    const earlyMay = new Date("2026-05-01T03:00:00Z");

    const utcWindow = getNaturalMonthWindow({
      now: earlyMay,
      timeZone: "UTC",
    });
    expect(utcWindow).toEqual({ startDay: "2026-05-01", endDay: "2026-05-31" });

    const newYorkWindow = getNaturalMonthWindow({
      now: earlyMay,
      timeZone: "America/New_York",
    });
    expect(newYorkWindow).toEqual({ startDay: "2026-04-01", endDay: "2026-04-30" });
  });
});

describe("getBillingAnchoredMonthWindow", () => {
  it("returns a typical mid-month anchor window (5/12 → 6/11)", () => {
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2026-05-20T12:00:00Z"),
      timeZone: "UTC",
      anchorDay: 12,
    });
    expect(window).toEqual({ startDay: "2026-05-12", endDay: "2026-06-11" });
  });

  it("starts the window on the anchor day itself (day === anchorDay)", () => {
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2026-05-12T00:00:00Z"),
      timeZone: "UTC",
      anchorDay: 12,
    });
    expect(window).toEqual({ startDay: "2026-05-12", endDay: "2026-06-11" });
  });

  it("rolls backward when today is before the anchor day (day < anchorDay)", () => {
    // Today is 5/10, anchor is 12 → previous window started 4/12
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2026-05-10T12:00:00Z"),
      timeZone: "UTC",
      anchorDay: 12,
    });
    expect(window).toEqual({ startDay: "2026-04-12", endDay: "2026-05-11" });
  });

  it("rolls 31-day anchor back to last day of short April (30 days)", () => {
    // Anchor 31 in April → currentStartDay = min(31, 30) = April 30
    // Next month start: min(31, 31 days in May) = May 31
    // So window: 2026-04-30 to 2026-05-30
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2026-04-30T12:00:00Z"),
      timeZone: "UTC",
      anchorDay: 31,
    });
    expect(window).toEqual({ startDay: "2026-04-30", endDay: "2026-05-30" });
  });

  it("rolls 31-day anchor back to last day of short June (30 days)", () => {
    // Anchor 31 in June → currentStartDay = min(31, 30) = June 30
    // Next month July has 31 days → next start July 31
    // Window: 2026-06-30 to 2026-07-30
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2026-06-30T00:00:00Z"),
      timeZone: "UTC",
      anchorDay: 31,
    });
    expect(window).toEqual({ startDay: "2026-06-30", endDay: "2026-07-30" });
  });

  it("rolls 31-day anchor down in non-leap February (28 days)", () => {
    // Anchor 31 in February 2026 → currentStartDay = min(31, 28) = Feb 28
    // Next month March: min(31, 31) = March 31
    // Window: 2026-02-28 to 2026-03-30
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2026-02-28T12:00:00Z"),
      timeZone: "UTC",
      anchorDay: 31,
    });
    expect(window).toEqual({ startDay: "2026-02-28", endDay: "2026-03-30" });
  });

  it("rolls 31-day anchor down in leap February (29 days)", () => {
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2024-02-29T12:00:00Z"),
      timeZone: "UTC",
      anchorDay: 31,
    });
    expect(window).toEqual({ startDay: "2024-02-29", endDay: "2024-03-30" });
  });

  it("rolls 31-day anchor down in September (30 days)", () => {
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2026-09-30T00:00:00Z"),
      timeZone: "UTC",
      anchorDay: 31,
    });
    expect(window).toEqual({ startDay: "2026-09-30", endDay: "2026-10-30" });
  });

  it("rolls 31-day anchor down in November (30 days)", () => {
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2026-11-15T00:00:00Z"),
      timeZone: "UTC",
      anchorDay: 31,
    });
    // Nov has 30 days → currentStartDay = Nov 30 which is > day=15, so we roll backward
    // Prev month Oct has 31 days → prev start Oct 31
    // Window: 2025-10-31 to 2025-11-29 ... wait need to check shiftMonth(-1) from 2026-11 → 2026-10
    expect(window).toEqual({ startDay: "2026-10-31", endDay: "2026-11-29" });
  });

  it("rolls 31-day anchor backward when mid-month (day before short-month end)", () => {
    // Today April 15, anchor 31. April has 30 days → currentStart = April 30, which is > 15.
    // So roll backward: previous month March, currentStartDay = min(31, 31) = March 31.
    // Window: 2026-03-31 to 2026-04-29
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2026-04-15T12:00:00Z"),
      timeZone: "UTC",
      anchorDay: 31,
    });
    expect(window).toEqual({ startDay: "2026-03-31", endDay: "2026-04-29" });
  });

  it("handles year boundary anchor (Dec → Jan)", () => {
    // Today Jan 5, anchor 20 → current start Jan 20 > 5 → roll backward to Dec 20
    // Window: 2025-12-20 to 2026-01-19
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2026-01-05T12:00:00Z"),
      timeZone: "UTC",
      anchorDay: 20,
    });
    expect(window).toEqual({ startDay: "2025-12-20", endDay: "2026-01-19" });
  });

  it("handles year boundary forward (Dec → Jan)", () => {
    // Today Dec 25, anchor 20 → current start Dec 20 ≤ 25 → roll forward to Jan 20
    // Window: 2025-12-20 to 2026-01-19
    const window = getBillingAnchoredMonthWindow({
      now: new Date("2025-12-25T12:00:00Z"),
      timeZone: "UTC",
      anchorDay: 20,
    });
    expect(window).toEqual({ startDay: "2025-12-20", endDay: "2026-01-19" });
  });
});

describe("getAnchorDayFromFirstPaidAt", () => {
  it("extracts the day-of-month in the given timezone", () => {
    expect(getAnchorDayFromFirstPaidAt("2026-05-12T10:00:00Z", "UTC")).toBe(12);
  });

  it("respects the timezone when the instant falls on a different day locally", () => {
    // 2026-05-12 23:30 UTC is 2026-05-13 07:30 in Asia/Shanghai
    expect(getAnchorDayFromFirstPaidAt("2026-05-12T23:30:00Z", "Asia/Shanghai")).toBe(13);
    expect(getAnchorDayFromFirstPaidAt("2026-05-12T23:30:00Z", "UTC")).toBe(12);
  });

  it("returns null for null, undefined, empty, or unparseable input", () => {
    expect(getAnchorDayFromFirstPaidAt(null, "UTC")).toBeNull();
    expect(getAnchorDayFromFirstPaidAt(undefined, "UTC")).toBeNull();
    expect(getAnchorDayFromFirstPaidAt("", "UTC")).toBeNull();
    expect(getAnchorDayFromFirstPaidAt("not-a-date", "UTC")).toBeNull();
  });
});

describe("formatDateInTimeZone", () => {
  it("returns YYYY-MM-DD in the target timezone", () => {
    expect(formatDateInTimeZone(new Date("2026-05-12T10:00:00Z"), "UTC")).toBe("2026-05-12");
    expect(formatDateInTimeZone(new Date("2026-05-12T23:30:00Z"), "Asia/Shanghai")).toBe(
      "2026-05-13",
    );
  });
});
