// @vitest-environment node
/**
 * The per-IP limit caps how many coach calls one address makes a day, whatever
 * device ids it sends. Until 2026-10 no test executed it — mutation testing
 * found every mutant in checkIpLimit / incrementIpCounter uncovered. The Redis
 * client and the in-memory counters live at module scope, so each test imports
 * a fresh copy of the module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  constructed: vi.fn(),
  get: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  exec: vi.fn(async () => []),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    get = redis.get;
    constructor(options: unknown) {
      redis.constructed(options);
    }
    pipeline() {
      return { incr: redis.incr, expire: redis.expire, exec: redis.exec };
    }
  },
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const IP_DAILY_LIMIT = 20;

async function freshModule() {
  vi.resetModules();
  return import("@/lib/coach/guestCoachUsage");
}

beforeEach(() => {
  vi.resetAllMocks();
  redis.exec.mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("per-IP guest limit without Redis", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  });

  it("gives a new address the full allowance", async () => {
    const { checkIpLimit } = await freshModule();
    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: true, remaining: IP_DAILY_LIMIT });
  });

  it("counts calls and refuses the address at the limit without going negative", async () => {
    const { checkIpLimit, incrementIpCounter } = await freshModule();

    for (let i = 0; i < IP_DAILY_LIMIT - 1; i++) await incrementIpCounter("1.1.1.1");
    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: true, remaining: 1 });

    await incrementIpCounter("1.1.1.1");
    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: false, remaining: 0 });

    await incrementIpCounter("1.1.1.1");
    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: false, remaining: 0 });
  });

  it("keeps each address's count separate", async () => {
    const { checkIpLimit, incrementIpCounter } = await freshModule();

    for (let i = 0; i < IP_DAILY_LIMIT; i++) await incrementIpCounter("1.1.1.1");

    expect(await checkIpLimit("2.2.2.2")).toEqual({ allowed: true, remaining: IP_DAILY_LIMIT });
  });

  it("starts a fresh allowance on the next UTC day", async () => {
    const { checkIpLimit, incrementIpCounter } = await freshModule();
    vi.setSystemTime(new Date("2026-10-26T23:30:00Z"));
    for (let i = 0; i < IP_DAILY_LIMIT; i++) await incrementIpCounter("1.1.1.1");
    expect((await checkIpLimit("1.1.1.1")).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-10-27T00:30:00Z"));
    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: true, remaining: IP_DAILY_LIMIT });

    await incrementIpCounter("1.1.1.1");
    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: true, remaining: IP_DAILY_LIMIT - 1 });
  });

  it("draws the day boundary in the guest's own timezone", async () => {
    const { checkIpLimit, incrementIpCounter } = await freshModule();
    // 23:30 in Tokyo, still 26 October there and in UTC.
    vi.setSystemTime(new Date("2026-10-26T14:30:00Z"));
    for (let i = 0; i < IP_DAILY_LIMIT; i++) await incrementIpCounter("1.1.1.1", "JP");

    // 00:30 on 27 October in Tokyo, while UTC is still on the 26th.
    vi.setSystemTime(new Date("2026-10-26T15:30:00Z"));
    expect((await checkIpLimit("1.1.1.1")).allowed).toBe(false);
    expect(await checkIpLimit("1.1.1.1", "jp")).toEqual({
      allowed: true,
      remaining: IP_DAILY_LIMIT,
    });
  });

  it("falls back to UTC for a country it has no timezone for", async () => {
    const { checkIpLimit, incrementIpCounter } = await freshModule();
    vi.setSystemTime(new Date("2026-10-26T14:30:00Z"));
    for (let i = 0; i < IP_DAILY_LIMIT; i++) await incrementIpCounter("1.1.1.1", "ZZ");

    vi.setSystemTime(new Date("2026-10-26T15:30:00Z"));
    expect((await checkIpLimit("1.1.1.1", "ZZ")).allowed).toBe(false);
  });

  it("keeps counting a tracked address when 10,000 are tracked", async () => {
    const { checkIpLimit, incrementIpCounter } = await freshModule();
    for (let i = 0; i < IP_DAILY_LIMIT; i++) await incrementIpCounter("1.1.1.1");
    for (let i = 1; i < 10_000; i++) await checkIpLimit(`10.0.${i >> 8}.${i & 255}`);

    // The oldest entry is the address being checked; checking it must not
    // evict it and hand it a fresh allowance.
    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: false, remaining: 0 });
  });

  it("makes room for a new address by forgetting the oldest at 10,000", async () => {
    const { checkIpLimit, incrementIpCounter } = await freshModule();
    for (let i = 0; i < IP_DAILY_LIMIT; i++) await incrementIpCounter("1.1.1.1");
    for (let i = 1; i < 9_999; i++) await checkIpLimit(`10.0.${i >> 8}.${i & 255}`);

    // 9,999 tracked: one more fits without evicting anything.
    await checkIpLimit("192.168.0.1");
    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: false, remaining: 0 });

    // 10,000 tracked: the next new address evicts the oldest, 1.1.1.1.
    await checkIpLimit("192.168.0.2");
    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: true, remaining: IP_DAILY_LIMIT });
  });
});

describe("per-IP guest limit with Redis", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
  });

  it("reads today's count for the address", async () => {
    const { checkIpLimit } = await freshModule();
    redis.get.mockResolvedValue(7);

    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: true, remaining: 13 });
    expect(redis.get).toHaveBeenCalledWith("guest_ip:1.1.1.1:2026-10-26");
    expect(redis.constructed).toHaveBeenCalledWith({
      url: "https://redis.example",
      token: "test-token",
    });
  });

  it("treats a missing key as no calls yet", async () => {
    const { checkIpLimit } = await freshModule();
    redis.get.mockResolvedValue(null);

    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: true, remaining: IP_DAILY_LIMIT });
  });

  it("refuses at the limit and never reports a negative remaining", async () => {
    const { checkIpLimit } = await freshModule();

    redis.get.mockResolvedValue(IP_DAILY_LIMIT);
    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: false, remaining: 0 });

    redis.get.mockResolvedValue(IP_DAILY_LIMIT + 5);
    expect(await checkIpLimit("1.1.1.1")).toEqual({ allowed: false, remaining: 0 });
  });

  it("increments today's key and lets it expire after 48 hours", async () => {
    const { incrementIpCounter } = await freshModule();

    await incrementIpCounter("1.1.1.1", "JP");

    expect(redis.incr).toHaveBeenCalledWith("guest_ip:1.1.1.1:2026-10-26");
    expect(redis.expire).toHaveBeenCalledWith("guest_ip:1.1.1.1:2026-10-26", 48 * 60 * 60);
    expect(redis.exec).toHaveBeenCalledOnce();
  });

  it("creates the client once and reuses it", async () => {
    const { checkIpLimit, incrementIpCounter } = await freshModule();
    redis.get.mockResolvedValue(0);

    await checkIpLimit("1.1.1.1");
    await incrementIpCounter("1.1.1.1");
    await checkIpLimit("2.2.2.2");

    expect(redis.constructed).toHaveBeenCalledOnce();
  });
});
