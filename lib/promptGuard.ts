/**
 * Lightweight prompt injection guard for the coach API.
 *
 * Detects common prompt injection patterns in user messages.
 * This is a defense-in-depth measure — the primary protection
 * is the system prompt being authoritative and the model
 * being instructed not to override it.
 */

const INJECTION_PATTERNS = [
  // System prompt override attempts
  /ignore\s+(previous|prior|earlier|all\s+above)\s+(instructions|prompts|commands|directives)/i,
  /forget\s+(everything|all|the\s+above)/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
  /\[system\]/i,
  /\{system\}/i,
  // Delimiter bypass attempts
  /---\s*position\s*---/i,
  /---\s*solution\s*---/i,
  /---\s*style\s*---/i,
  // Role confusion
  /as\s+an?\s+(admin|administrator|developer|engineer)/i,
  /pretend\s+you\s+are/i,
  /act\s+as\s+(if\s+you\s+are)?/i,
  // Output manipulation
  /output\s*(everything|all|the\s+full|complete)/i,
  /reveal\s*(the\s+)?(answer|solution|prompt)/i,
  /show\s*(me\s+)?(the\s+)?(system|prompt|instructions)/i,
  // Jailbreak patterns
  /DAN\s*(mode)?/i,
  /jailbreak/i,
  /do\s+anything\s+now/i,
];

const MAX_MESSAGE_LENGTH = 2000;
const SUSPICIOUS_KEYWORD_COUNT = 3;
const COMMON_CONFUSABLES: Record<string, string> = {
  А: "A",
  а: "a",
  В: "B",
  Е: "E",
  е: "e",
  І: "I",
  і: "i",
  Ј: "J",
  ј: "j",
  К: "K",
  к: "k",
  М: "M",
  м: "m",
  Н: "H",
  н: "h",
  О: "O",
  о: "o",
  Р: "P",
  р: "p",
  С: "C",
  с: "c",
  Т: "T",
  т: "t",
  У: "Y",
  у: "y",
  Х: "X",
  х: "x",
  Ѕ: "S",
  ѕ: "s",
  Α: "A",
  α: "a",
  Β: "B",
  β: "b",
  Ε: "E",
  ε: "e",
  Ι: "I",
  ι: "i",
  Κ: "K",
  κ: "k",
  Μ: "M",
  μ: "m",
  Ν: "N",
  ν: "v",
  Ο: "O",
  ο: "o",
  Ρ: "P",
  ρ: "p",
  Τ: "T",
  τ: "t",
  Υ: "Y",
  υ: "y",
  Χ: "X",
  χ: "x",
};

interface GuardResult {
  ok: boolean;
  reason?: string;
}

function countSuspiciousKeywords(text: string): number {
  const suspicious = [
    "ignore",
    "forget",
    "system",
    "prompt",
    "instructions",
    "override",
    "bypass",
    "reveal",
    "output all",
    "complete",
  ];
  const lower = text.toLowerCase();
  return suspicious.filter((kw) => lower.includes(kw)).length;
}

function foldCommonConfusables(input: string): string {
  return Array.from(input, (char) => COMMON_CONFUSABLES[char] ?? char).join("");
}

function normalizeForGuard(input: string): string {
  return foldCommonConfusables(input.normalize("NFKC"));
}

export function guardUserMessage(message: string): GuardResult {
  // NFKC handles fullwidth and compatibility forms. A small confusable fold
  // catches common Cyrillic/Greek lookalikes used in English injection terms.
  const normalized = normalizeForGuard(message);

  // Length check (on normalized form)
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: "Message too long." };
  }

  // Pattern matching
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return { ok: false, reason: "Potentially unsafe content detected." };
    }
  }

  // Keyword density check
  if (countSuspiciousKeywords(normalized) >= SUSPICIOUS_KEYWORD_COUNT) {
    return { ok: false, reason: "Suspicious keyword density detected." };
  }

  return { ok: true };
}

/**
 * Sanitize user input by stripping control characters, normalizing Unicode
 * (NFKC collapses fullwidth and compatibility forms), and normalizing whitespace.
 */
export function sanitizeInput(input: string): string {
  return (
    input
      .normalize("NFKC") // Unicode canonical + compatibility decomposition + composition
      .replace(/[\u200B-\u200D\uFEFF]/g, "") // Strip zero-width characters

      // Strip control chars but preserve \t (0x09), \n (0x0a), \r (0x0d) — chat messages need newlines.
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
      .replace(/[^\S\r\n]+/g, " ") // Normalize whitespace while preserving newlines
      .trim()
  );
}
