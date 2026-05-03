import { Redis } from "@upstash/redis";

/**
 * Rate-limiter abstraction.
 *
 * - MemoryRateLimiter for dev / single-instance deployments.
 * - Production multi-instance deployments should switch to an external persistent
 *   implementation (Upstash / KV / Redis etc.).
 *   Must get Frank's approval before connecting — do not configure third-party
 *   services on your own.
 */

export interface RateLimiter {
  /** Return true when the key has exceeded its allowance. */
  isLimited(key: string): boolean | Promise<boolean>;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 10;

/** Simple per-process in-memory sliding-window rate limiter.
 *  NOT suitable for production multi-instance deployments. */
export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private windowMs: number,
    private maxRequests: number,
    private maxEntries = 50_000,
  ) {
    if (typeof setInterval !== "undefined") {
      const interval = setInterval(
        () => {
          const windowStart = Date.now() - this.windowMs;
          for (const [k, timestamps] of this.hits) {
            if (timestamps.every((t) => t <= windowStart)) {
              this.hits.delete(k);
            }
          }
        },
        Math.max(this.windowMs, 10000),
      );
      if (interval.unref) interval.unref();
    }
  }

  isLimited(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (this.hits.size >= this.maxEntries) {
      // If over cap, drop the oldest key.
      const oldest = this.hits.keys().next().value;
      if (oldest) this.hits.delete(oldest);
    }

    const prev = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (prev.length >= this.maxRequests) {
      this.hits.set(key, prev);
      return true;
    }
    prev.push(now);
    this.hits.set(key, prev);
    return false;
  }
}

/** Upstash Redis-backed fixed-window rate limiter.
 *  Suitable for production multi-instance deployments. */
export class UpstashRateLimiter implements RateLimiter {
  private redis: Redis;

  constructor(
    private windowMs: number,
    private maxRequests: number,
    url: string,
    token: string,
  ) {
    this.redis = new Redis({
      url,
      token,
    });
  }

  async isLimited(key: string): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const redisKey = `ratelimit:${key}`;

    // pipeline to reduce network roundtrips
    const p = this.redis.pipeline();
    p.zremrangebyscore(redisKey, 0, windowStart);
    p.zcard(redisKey);
    p.zadd(redisKey, { score: now, member: `${now}-${Math.random()}` });
    p.pexpire(redisKey, this.windowMs);
    const results = await p.exec();

    const count = results[1] as number;
    return count >= this.maxRequests;
  }
}

/** Factory — returns Upstash implementation if environment variables are present.
 *  Otherwise falls back to MemoryRateLimiter (dev only).
 *  In production without Upstash, throws on first use (not at import time)
 *  so that `next build` can still collect page data without env vars. */
export function createRateLimiter(): RateLimiter {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || DEFAULT_WINDOW_MS;
  const maxRequests = Number(process.env.RATE_LIMIT_MAX) || DEFAULT_MAX_REQUESTS;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    return new UpstashRateLimiter(windowMs, maxRequests, upstashUrl, upstashToken);
  }

  if (process.env.NODE_ENV === "production") {
    // Fail on first actual use, not at import time — allows `next build`
    // to complete without env vars (build-time page-data collection).
    return {
      isLimited() {
        throw new Error(
          "CRITICAL: Upstash Redis is missing in production. Refusing to start without distributed rate limiting.",
        );
      },
    };
  }

  return new MemoryRateLimiter(windowMs, maxRequests);
}
