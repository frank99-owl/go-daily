import crypto from "node:crypto";

/**
 * Constant-time equality for secrets that may have different lengths.
 *
 * Hashing both inputs first gives timingSafeEqual fixed-size buffers, avoiding
 * an early return on length mismatch.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const aDigest = crypto.createHash("sha256").update(a).digest();
  const bDigest = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(aDigest, bDigest);
}
