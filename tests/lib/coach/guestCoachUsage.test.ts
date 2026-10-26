// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

import {
  decrementGuestUsage,
  getGuestUsage,
  tryIncrementGuestUsage,
} from "@/lib/coach/guestCoachUsage";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("guestCoachUsage atomic helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T12:00:00Z"));
    mocks.createServiceClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({
      data: {
        allowed: true,
        reason: null,
        dailyUsed: 1,
        monthlyUsed: 1,
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the quota-aware guest RPC with the current guest window", async () => {
    const today = todayUtc();

    const result = await tryIncrementGuestUsage("guest-1", null);

    expect(result).toEqual({
      allowed: true,
      reason: null,
      dailyUsed: 1,
      monthlyUsed: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("try_increment_guest_coach_usage", {
      p_device_id: "guest-1",
      p_day: today,
      p_month_start: `${today.slice(0, 7)}-01`,
      p_daily_limit: 3,
      p_monthly_limit: 5,
    });
  });

  it("calls the atomic guest decrement RPC", async () => {
    const today = todayUtc();

    await decrementGuestUsage("guest-1", null);

    expect(mocks.rpc).toHaveBeenCalledWith("decrement_guest_coach_usage", {
      p_device_id: "guest-1",
      p_day: today,
    });
  });
});

describe("tryIncrementGuestUsage result", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createServiceClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it.each(["daily_limit_reached", "monthly_limit_reached"])(
    "passes the %s reason through",
    async (reason) => {
      mocks.rpc.mockResolvedValue({
        data: { allowed: false, reason, dailyUsed: 3, monthlyUsed: 5 },
        error: null,
      });

      expect(await tryIncrementGuestUsage("guest-1", null)).toEqual({
        allowed: false,
        reason,
        dailyUsed: 3,
        monthlyUsed: 5,
      });
    },
  );

  it("refuses unless the database said allowed: true, and drops unknown reasons", async () => {
    mocks.rpc.mockResolvedValue({
      data: { allowed: "true", reason: "maintenance", dailyUsed: "2", monthlyUsed: null },
      error: null,
    });

    expect(await tryIncrementGuestUsage("guest-1", null)).toEqual({
      allowed: false,
      reason: null,
      dailyUsed: 2,
      monthlyUsed: 0,
    });
  });

  it("refuses when the database returns nothing usable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    expect(await tryIncrementGuestUsage("guest-1", null)).toEqual({
      allowed: false,
      reason: null,
      dailyUsed: 0,
      monthlyUsed: 0,
    });
  });

  it("throws when the RPC fails rather than letting the call through", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(tryIncrementGuestUsage("guest-1", null)).rejects.toThrow(
      /failed to increment guest usage: permission denied/,
    );
  });

  it("throws when the refund RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(decrementGuestUsage("guest-1", null)).rejects.toThrow(
      /failed to decrement guest usage: permission denied/,
    );
  });
});

/**
 * A guest_coach_usage table whose select chain filters real rows, so the test
 * checks which rows the query asks for and not just which methods it calls.
 */
function guestUsageTable(
  rows: { device_id: string; day: string; count: number }[],
  error?: string,
) {
  return {
    from: (table: string) => {
      if (table !== "guest_coach_usage") throw new Error(`unexpected table ${table}`);
      const filters: ((row: (typeof rows)[number]) => boolean)[] = [];
      const field = (name: string) => (row: (typeof rows)[number]) =>
        (row as Record<string, unknown>)[name] as string;
      const query = {
        select: () => query,
        eq: (name: string, value: string) => (filters.push((r) => field(name)(r) === value), query),
        gte: (name: string, value: string) => (filters.push((r) => field(name)(r) >= value), query),
        lte: (name: string, value: string) => (filters.push((r) => field(name)(r) <= value), query),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(
            error
              ? { data: null, error: { message: error } }
              : { data: rows.filter((r) => filters.every((f) => f(r))), error: null },
          ).then(resolve),
      };
      return query;
    },
  };
}

describe("getGuestUsage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts this device's calls today and this month", async () => {
    mocks.createServiceClient.mockReturnValue(
      guestUsageTable([
        { device_id: "guest-1", day: "2026-04-30", count: 3 },
        { device_id: "guest-1", day: "2026-05-01", count: 1 },
        { device_id: "guest-1", day: "2026-05-12", count: 2 },
        { device_id: "guest-1", day: "2026-05-13", count: 3 },
        { device_id: "guest-2", day: "2026-05-12", count: 3 },
      ]),
    );

    expect(await getGuestUsage("guest-1", null)).toEqual({
      dailyLimit: 3,
      monthlyLimit: 5,
      dailyUsed: 2,
      monthlyUsed: 3,
      dailyRemaining: 1,
      monthlyRemaining: 2,
    });
  });

  it("reports zero remaining, never a negative number, once a limit is passed", async () => {
    mocks.createServiceClient.mockReturnValue(
      guestUsageTable([
        { device_id: "guest-1", day: "2026-05-02", count: 4 },
        { device_id: "guest-1", day: "2026-05-12", count: 4 },
      ]),
    );

    const usage = await getGuestUsage("guest-1", null);
    expect(usage).toMatchObject({
      dailyUsed: 4,
      monthlyUsed: 8,
      dailyRemaining: 0,
      monthlyRemaining: 0,
    });
  });

  it("reports a device with no rows as unused", async () => {
    mocks.createServiceClient.mockReturnValue(guestUsageTable([]));

    expect(await getGuestUsage("guest-1", null)).toMatchObject({
      dailyUsed: 0,
      monthlyUsed: 0,
      dailyRemaining: 3,
      monthlyRemaining: 5,
    });
  });

  it("uses the guest's own timezone for today and the month", async () => {
    // 01:00 on 1 June in Tokyo, still 31 May in UTC.
    vi.setSystemTime(new Date("2026-05-31T16:00:00Z"));
    mocks.createServiceClient.mockReturnValue(
      guestUsageTable([
        { device_id: "guest-1", day: "2026-05-31", count: 3 },
        { device_id: "guest-1", day: "2026-06-01", count: 1 },
      ]),
    );

    expect(await getGuestUsage("guest-1", "JP")).toMatchObject({ dailyUsed: 1, monthlyUsed: 1 });
    expect(await getGuestUsage("guest-1", null)).toMatchObject({ dailyUsed: 3, monthlyUsed: 3 });
  });

  it("throws when the usage cannot be read", async () => {
    mocks.createServiceClient.mockReturnValue(guestUsageTable([], "timeout"));

    await expect(getGuestUsage("guest-1", null)).rejects.toThrow(
      /failed to read guest coach usage: timeout/,
    );
  });
});
