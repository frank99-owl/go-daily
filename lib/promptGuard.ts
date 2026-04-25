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

export function guardUserMessage(message: string): GuardResult {
  // Length check
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: "Message too long." };
  }

  // Pattern matching
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return { ok: false, reason: "Potentially unsafe content detected." };
    }
  }

  // Keyword density check
  if (countSuspiciousKeywords(message) >= SUSPICIOUS_KEYWORD_COUNT) {
    return { ok: false, reason: "Suspicious keyword density detected." };
  }

  return { ok: true };
}

/**
 * Sanitize user input by stripping control characters and normalizing whitespace.
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "") // Control chars
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}
