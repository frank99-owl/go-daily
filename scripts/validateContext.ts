/**
 * Agent-context drift validator — run via `npm run validate:context`.
 *
 * `CLAUDE.md` and `AGENTS.md` are the two always-on context files every AI
 * agent reads before touching this repo. They are prose, so nothing stops
 * them from describing a command that no longer exists, a domain directory
 * that was renamed, or an invariant that only one of the two files carries.
 * When that happens an agent acts on a stale map and the mistake lands in
 * code, not in a review comment.
 *
 * This is the same idea as `validate:messages` — that script keeps four
 * locale files from drifting apart, this one keeps the agent context from
 * drifting away from the codebase. Four checks:
 *
 *   1. Every `npm run <script>` named in a context file exists in package.json.
 *   2. The nine-domain table matches the directories actually under lib/.
 *   3. Every repo path written in backticks resolves on disk.
 *   4. Every critical invariant appears in BOTH context files.
 *
 * Check 4 exists because the two files had already drifted: in September 2026
 * the coach quota-refund rule and the guest-counter rule lived in AGENTS.md
 * only — and those are exactly the billing and privacy invariants an agent
 * most needs to know before editing the coach.
 *
 * Exits 0 on success; exits 1 with a readable report on failure.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const CONTEXT_FILES = ["CLAUDE.md", "AGENTS.md"] as const;

type ContextFile = (typeof CONTEXT_FILES)[number];

interface Finding {
  check: string;
  file: string;
  message: string;
}

/**
 * Facts that carry real consequences if an agent does not know them. Each
 * must be discoverable in every context file — an invariant documented in
 * one file and missing from the other is a trap for whichever agent reads
 * the other one.
 */
const CRITICAL_INVARIANTS: { id: string; pattern: RegExp }[] = [
  { id: "attempt dedup key", pattern: /puzzleId-solvedAtMs/ },
  { id: "server-only import boundary", pattern: /never import server-only modules/i },
  { id: "zod schemas are the source of truth", pattern: /types\/schemas\.ts/ },
  { id: "locale-prefixed routing", pattern: /localePath/ },
  { id: "RLS on every table", pattern: /\bRLS\b/ },
  { id: "stripe webhook idempotency", pattern: /stripe_events/ },
  { id: "manual pro grants", pattern: /manual_grants/ },
  { id: "admin gating", pattern: /verifyAdmin/ },
  { id: "coach personas are fictional, never real players", pattern: /personas are fictional/i },
  { id: "guest coach counters are service_role only", pattern: /guest_coach_usage/ },
  { id: "coach quota refunds only on zero delivery", pattern: /refund/i },
  { id: "coach token budget covers hidden reasoning", pattern: /COACH_MAX_TOKENS/ },
  { id: "notFound needs an unbuffered segment", pattern: /notFound\(\)/ },
  {
    id: "title template must not be doubled",
    pattern: /title\.template|%s — go-daily|Title template/,
  },
  { id: "rate limiters need a distinct test IP", pattern: /nextTestIp/ },
  { id: "production rate limiting needs upstash", pattern: /UPSTASH_REDIS/ },
  { id: "next/og avoids z-index and runs on nodejs", pattern: /next\/og|Satori/ },
  { id: "i18n key parity", pattern: /validate:messages/ },
];

function read(file: ContextFile): string {
  return fs.readFileSync(path.join(ROOT, file), "utf-8");
}

/** Every `...` span in a markdown document, fences excluded. */
function inlineCodeSpans(markdown: string): string[] {
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, "");
  return [...withoutFences.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
}

function checkNpmScripts(files: Map<ContextFile, string>): Finding[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")) as {
    scripts?: Record<string, string>;
  };
  const defined = new Set(Object.keys(pkg.scripts ?? {}));
  const findings: Finding[] = [];

  for (const [file, body] of files) {
    const named = new Set<string>();
    for (const match of body.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
      named.add(match[1]);
    }
    for (const script of [...named].sort()) {
      if (!defined.has(script)) {
        findings.push({
          check: "npm scripts",
          file,
          message: `documents \`npm run ${script}\`, which package.json does not define`,
        });
      }
    }
  }
  return findings;
}

function checkDomainTable(files: Map<ContextFile, string>): Finding[] {
  const actual = new Set(
    fs
      .readdirSync(path.join(ROOT, "lib"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
  const findings: Finding[] = [];

  for (const [file, body] of files) {
    const documented = new Set(
      [...body.matchAll(/`lib\/([a-z0-9]+)\/`/g)].map((match) => match[1]),
    );
    for (const domain of [...documented].sort()) {
      if (!actual.has(domain)) {
        findings.push({
          check: "lib domains",
          file,
          message: `describes domain \`lib/${domain}/\`, which no longer exists`,
        });
      }
    }
    for (const domain of [...actual].sort()) {
      if (!documented.has(domain)) {
        findings.push({
          check: "lib domains",
          file,
          message: `does not document the \`lib/${domain}/\` domain`,
        });
      }
    }
  }
  return findings;
}

/**
 * Paths the context files name precisely because they must NOT exist. Their
 * absence is the documented decision, so the path check has to skip them.
 * Add to this list only alongside the prose that explains the absence.
 */
const INTENTIONALLY_ABSENT = new Set([
  // A loading.tsx above a segment that calls notFound() flushes the response
  // early and turns the 404 into a soft 200. See the pitfall in both files.
  "app/[locale]/loading.tsx",
]);

/**
 * A backticked token is treated as a repo path only when its first segment
 * is an entry that exists at the repo root. That keeps package specifiers
 * (`next/og`) and prose (`auth.uid() = user_id`) out of the check while
 * still catching a renamed or deleted module.
 */
function checkReferencedPaths(files: Map<ContextFile, string>): Finding[] {
  const rootEntries = new Set(fs.readdirSync(ROOT));
  const findings: Finding[] = [];

  for (const [file, body] of files) {
    const seen = new Set<string>();
    for (const span of inlineCodeSpans(body)) {
      const token = span.trim();
      if (!token.includes("/")) continue;
      if (/[*{}<>()\s|]/.test(token)) continue;
      const normalized = token.replace(/\/$/, "");
      const first = normalized.split("/")[0];
      if (!rootEntries.has(first)) continue;
      if (INTENTIONALLY_ABSENT.has(normalized)) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      if (!fs.existsSync(path.join(ROOT, normalized))) {
        findings.push({
          check: "referenced paths",
          file,
          message: `references \`${token}\`, which does not exist on disk`,
        });
      }
    }
  }
  return findings;
}

function checkInvariantParity(files: Map<ContextFile, string>): Finding[] {
  const findings: Finding[] = [];
  for (const invariant of CRITICAL_INVARIANTS) {
    for (const [file, body] of files) {
      if (!invariant.pattern.test(body)) {
        findings.push({
          check: "invariant parity",
          file,
          message: `never mentions the "${invariant.id}" invariant (expected ${invariant.pattern})`,
        });
      }
    }
  }
  return findings;
}

function main() {
  const files = new Map<ContextFile, string>();
  for (const file of CONTEXT_FILES) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) {
      console.error(`✖ Missing agent context file: ${file}`);
      process.exit(1);
    }
    files.set(file, read(file));
  }

  const findings = [
    ...checkNpmScripts(files),
    ...checkDomainTable(files),
    ...checkReferencedPaths(files),
    ...checkInvariantParity(files),
  ];

  if (findings.length === 0) {
    console.log(
      `✓ Agent context is in sync (${CONTEXT_FILES.join(", ")}: ${CRITICAL_INVARIANTS.length} invariants, npm scripts, lib domains, referenced paths)`,
    );
    return;
  }

  console.error(`✖ Agent context drift — ${findings.length} finding(s)\n`);
  for (const check of ["npm scripts", "lib domains", "referenced paths", "invariant parity"]) {
    const group = findings.filter((finding) => finding.check === check);
    if (group.length === 0) continue;
    console.error(`  ${check}:`);
    for (const finding of group) {
      console.error(`    ${finding.file} ${finding.message}`);
    }
    console.error("");
  }
  console.error("Fix the context file or the code it describes, then re-run.");
  process.exit(1);
}

main();
