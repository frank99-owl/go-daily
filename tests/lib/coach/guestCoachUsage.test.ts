// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

import { decrementGuestUsage, tryIncrementGuestUsage } from "@/lib/coach/guestCoachUsage";

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
