/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  createRateLimiter,
  isRateLimiterConfigurationError,
  MemoryRateLimiter,
  UpstashRateLimiter,
} from "@/lib/rateLimit";

vi.mock("@upstash/redis", () => {
  return {
    Redis: vi.fn().mockImplementation(function () {
      let mockCount = 0;
      return {
        createScript: vi.fn(() => ({
          exec: vi.fn(async (_keys: string[], args: string[]) => {
            const maxRequests = Number(args[2]);
            const limited = mockCount >= maxRequests;
            if (!limited) mockCount++;
            return limited ? 1 : 0;
          }),
        })),
      };
    }),
  };
});

describe("rateLimit", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = originalEnv;
  });

  describe("createRateLimiter factory", () => {
    it("returns MemoryRateLimiter by default", () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      const limiter = createRateLimiter();
      expect(limiter).toBeInstanceOf(MemoryRateLimiter);
    });

    it("returns UpstashRateLimiter when Upstash ENV vars are set", () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://mock-upstash.example.com";
      process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";
      const limiter = createRateLimiter();
      expect(limiter).toBeInstanceOf(UpstashRateLimiter);
    });

    it("throws a recognizable configuration error in production without Upstash", () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const limiter = createRateLimiter();

      expect(() => limiter.isLimited("test-ip")).toThrow(
        "CRITICAL: Upstash Redis is missing in production.",
      );
      try {
        limiter.isLimited("test-ip");
      } catch (error) {
        expect(isRateLimiterConfigurationError(error)).toBe(true);
      }
    });
  });

  describe("UpstashRateLimiter", () => {
    it("returns true when max requests exceeded, false otherwise", async () => {
      const limiter = new UpstashRateLimiter(60000, 2, "https://mock.com", "token");

      const res1 = await limiter.isLimited("test-ip");
      expect(res1).toBe(false); // Count = 1

      const res2 = await limiter.isLimited("test-ip");
      expect(res2).toBe(false); // Count = 2

      const res3 = await limiter.isLimited("test-ip");
      expect(res3).toBe(true); // Count = 3 > maxRequests (2)
    });
  });
});
