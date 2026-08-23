/**
 * Lightweight prompt injection guard for the coach API.
 *
 * Detects common prompt injection patterns in user messages.
 * This is a defense-in-depth measure — the primary protection
 * is the system prompt being authoritative and the model
 * being instructed not to override it.
 */

import { GUARD_REJECTION_CODES, type GuardRejectionCode } from "@/lib/promptGuardCodes";

export { GUARD_REJECTION_CODES, type GuardRejectionCode };

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
  // Role confusion. Both patterns require a concrete privileged role: a bare
  // "act as" also matches "act as my sparring partner", which is an ordinary
  // request to make of a Go coach.
  /as\s+an?\s+(admin|administrator|developer|engineer)/i,
  /pretend\s+you\s+are/i,
  /act\s+as\s+(an?\s+)?(admin|administrator|developer|engineer|system|unrestricted|uncensored|jailbroken)/i,
  // Output manipulation
  /output\s*(everything|all|the\s+full|complete)/i,
  /reveal\s*(the\s+)?(answer|solution|prompt)/i,
  /show\s*(me\s+)?(the\s+)?(system|prompt|instructions)/i,
  // Jailbreak patterns. "DAN" must carry its "mode" suffix and stand alone as
  // a word: "dan" is the Go rank (1 dan, amateur 5 dan) and also hides inside
  // ordinary words like "dangerous" and "abundant".
  /\bDAN\s+mode\b/i,
  /jailbreak/i,
  /do\s+anything\s+now/i,
];

// Non-English injection attempts. The English patterns above are blind to
// them, and the coach ships in zh / ja / ko as well as en.
const CJK_INJECTION_PATTERNS = [
  // Chinese
  /(忽略|无视|無視)(掉)?(以上|上述|上面|之前|前面|所有|全部)/,
  /(忘记|忘掉|忘記)(以上|上述|上面|之前|前面|所有|全部)/,
  /(系统|系統|系統的|你的)(提示词|提示語|提示|指令|设定|設定)/,
  /你现在是|你現在是|从现在起你|從現在起你/,
  /(越狱|越獄|开发者模式|開發者模式)/,
  // Japanese
  /(以前|上記|これまで|さっき)の(指示|命令|プロンプト)を?(無視|忘れ)/,
  /システム(プロンプト|指示|メッセージ)/,
  /(脱獄|開発者モード)/,
  // Korean
  /(이전|위의|앞의)\s*(지시|명령|프롬프트)[^\n]{0,6}(무시|잊)/,
  /시스템\s*(프롬프트|지시|메시지)/,
  /(탈옥|개발자\s*모드)/,
];

const COMPACT_INJECTION_PATTERNS = [
  /ignore(previous|prior|earlier|allabove|all)instructions/i,
  /ignore(previous|prior|earlier|allabove|all)(prompts|commands|directives)/i,
  /forget(everything|all|theabove)/i,
  /youarenow/i,
  // The suffix is required: the compact form strips every non-alphanumeric
  // character, so a bare /system/i would also match "is there a system for
  // counting liberties".
  /system(prompt|instructions|message|role)/i,
  /developer(prompt|instructions|message|mode)/i,
  /reveal(the)?(answer|solution|prompt|instructions)/i,
  /show(me)?(the)?(system|prompt|instructions)/i,
  /doanythingnow/i,
  /danmode/i,
  /jailbreak/i,
];

const MAX_MESSAGE_LENGTH = 2000;
const SUSPICIOUS_KEYWORD_COUNT = 3;
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const CONTROL_CHARS_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;
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
  code?: GuardRejectionCode;
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
  ];
  const lower = text.toLowerCase();
  return suspicious.filter((kw) => lower.includes(kw)).length;
}

function foldCommonConfusables(input: string): string {
  return Array.from(input, (char) => COMMON_CONFUSABLES[char] ?? char).join("");
}

function normalizeForGuard(input: string): string {
  return foldCommonConfusables(input.normalize("NFKC").replace(ZERO_WIDTH_RE, ""));
}

function compactForGuard(input: string): string {
  return input.replace(CONTROL_CHARS_RE, "").replace(/[^a-z0-9]+/gi, "");
}

export function guardUserMessage(message: string): GuardResult {
  // NFKC handles fullwidth and compatibility forms. A small confusable fold
  // catches common Cyrillic/Greek lookalikes used in English injection terms.
  const normalized = normalizeForGuard(message);

  // Length check (on normalized form)
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      code: GUARD_REJECTION_CODES.MESSAGE_TOO_LONG,
      reason: "Message too long.",
    };
  }

  // Pattern matching
  for (const pattern of [...INJECTION_PATTERNS, ...CJK_INJECTION_PATTERNS]) {
    if (pattern.test(normalized)) {
      return {
        ok: false,
        code: GUARD_REJECTION_CODES.UNSAFE_CONTENT,
        reason: "Potentially unsafe content detected.",
      };
    }
  }

  const compact = compactForGuard(normalized);
  for (const pattern of COMPACT_INJECTION_PATTERNS) {
    if (pattern.test(compact)) {
      return {
        ok: false,
        code: GUARD_REJECTION_CODES.UNSAFE_CONTENT,
        reason: "Potentially unsafe content detected.",
      };
    }
  }

  // Keyword density check
  if (countSuspiciousKeywords(normalized) >= SUSPICIOUS_KEYWORD_COUNT) {
    return {
      ok: false,
      code: GUARD_REJECTION_CODES.UNSAFE_CONTENT,
      reason: "Suspicious keyword density detected.",
    };
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
      .replace(ZERO_WIDTH_RE, "") // Strip zero-width characters

      // Strip control chars but preserve \t (0x09), \n (0x0a), \r (0x0d) — chat messages need newlines.
      .replace(CONTROL_CHARS_RE, "")
      .replace(/[^\S\r\n]+/g, " ") // Normalize whitespace while preserving newlines
      .trim()
  );
}
