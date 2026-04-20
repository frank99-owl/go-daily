import { Redis } from "@upstash/redis";

/**
 * Rate-limiter abstraction.
 *
 * - MemoryRateLimiter 用于 dev / 单实例场景。
 * - 生产多实例场景需替换为外部持久化实现（Upstash / KV / Redis 等）。
 *   接入前必须经过 Frank 确认 —— 不要擅自配第三方服务。
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
  ) {}

  isLimited(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
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
    const windowId = Math.floor(Date.now() / this.windowMs);
    const redisKey = `ratelimit:${key}:${windowId}`;

    // pipeline to reduce network roundtrips
    const p = this.redis.pipeline();
    p.incr(redisKey);
    p.pexpire(redisKey, this.windowMs * 2); // Expiration slightly larger than window to ensure cleanup
    const results = await p.exec();

    const count = results[0] as number;
    return count > this.maxRequests;
  }
}

/** Factory — returns Upstash implementation if environment variables are present.
 *  Otherwise falls back to MemoryRateLimiter. */
export function createRateLimiter(): RateLimiter {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || DEFAULT_WINDOW_MS;
  const maxRequests = Number(process.env.RATE_LIMIT_MAX) || DEFAULT_MAX_REQUESTS;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    return new UpstashRateLimiter(windowMs, maxRequests, upstashUrl, upstashToken);
  }

  return new MemoryRateLimiter(windowMs, maxRequests);
}
