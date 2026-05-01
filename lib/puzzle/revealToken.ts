import crypto from "crypto";

const DEFAULT_TTL_MS = 10 * 60 * 1000;

type RevealTokenPayload = {
  puzzleId: string;
  exp: number;
  nonce: string;
};

export type RevealTokenVerifyResult =
  | { ok: true; payload: RevealTokenPayload }
  | { ok: false; reason: "malformed" | "signature" | "expired" | "puzzle_mismatch" };

function getRevealSecret(): string {
  const secret = process.env.PUZZLE_REVEAL_SECRET;

  if (secret) return secret;

  if (process.env.NODE_ENV !== "production") {
    return "go-daily-dev-reveal-secret";
  }

  throw new Error("PUZZLE_REVEAL_SECRET is required in production.");
}

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payloadSegment: string): string {
  return crypto.createHmac("sha256", getRevealSecret()).update(payloadSegment).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "base64url");
  const bBuffer = Buffer.from(b, "base64url");
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function createRevealToken({
  puzzleId,
  ttlMs = DEFAULT_TTL_MS,
  nowMs = Date.now(),
}: {
  puzzleId: string;
  ttlMs?: number;
  nowMs?: number;
}): string {
  const payload: RevealTokenPayload = {
    puzzleId,
    exp: nowMs + ttlMs,
    nonce: crypto.randomBytes(16).toString("base64url"),
  };
  const payloadSegment = encodeBase64Url(JSON.stringify(payload));
  return `${payloadSegment}.${sign(payloadSegment)}`;
}

export function verifyRevealToken({
  token,
  puzzleId,
  nowMs = Date.now(),
}: {
  token: string;
  puzzleId: string;
  nowMs?: number;
}): RevealTokenVerifyResult {
  const [payloadSegment, signatureSegment, extra] = token.split(".");
  if (!payloadSegment || !signatureSegment || extra !== undefined) {
    return { ok: false, reason: "malformed" };
  }

  if (!safeEqual(signatureSegment, sign(payloadSegment))) {
    return { ok: false, reason: "signature" };
  }

  let payload: RevealTokenPayload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadSegment)) as RevealTokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    !payload ||
    typeof payload.puzzleId !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.nonce !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (payload.puzzleId !== puzzleId) {
    return { ok: false, reason: "puzzle_mismatch" };
  }

  if (payload.exp <= nowMs) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload };
}
