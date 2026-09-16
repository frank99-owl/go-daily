#!/usr/bin/env tsx
/**
 * Coach behavioral eval runner — `npm run eval:coach`.
 *
 * `tests/lib/coach/coachPrompt.test.ts` proves the system prompt CONTAINS its
 * rules. Nothing proved the model FOLLOWS them, so every prompt edit shipped
 * to paying students on faith. This runner closes that gap: it drives the
 * same chain a real request takes — `guardUserMessage` → `buildSystemPrompt`
 * → the coach provider — and grades the reply against the rules the prompt
 * actually states.
 *
 * Usage:
 *   npm run eval:coach                       # dry run: plan only, no API calls
 *   npm run eval:coach -- --live             # real calls against COACH_API_URL
 *   npm run eval:coach -- --live --case=greeting-zh
 *   npm run eval:coach -- --live --locale=zh
 *
 * Dry run is the default on purpose — same rule as `email:smoketest`. A live
 * run costs one completion per case plus one per judge grader, so it belongs
 * in a prompt-change PR, not on every push. The suite is intentionally NOT
 * wired into `.github/workflows/ci.yml`: it needs a real key and it is
 * non-deterministic, so it gates human judgment, not merges.
 *
 * Exits 0 when every selected case passes; exits 1 otherwise.
 */
import fs from "fs";
import path from "path";

import { config } from "dotenv";
import OpenAI from "openai";

import { buildSystemPrompt } from "@/lib/coach/coachPrompt";
import { COACH_TEMPERATURE, resolveThinking, thinkingParam } from "@/lib/coach/coachProvider";
import { getPersona } from "@/lib/coach/personas";
import { getCoachEnv } from "@/lib/env";
import { guardUserMessage } from "@/lib/promptGuard";

import { CASES, type EvalCase } from "./cases";
import { FIXTURES } from "./fixtures";
import { GRADERS_BY_ID, type GradeContext, type GradeResult, type JudgeFn } from "./graders";
import { JUDGE_CALIBRATION, type JudgeCalibrationExample } from "./judgeCalibration";

config({ path: ".env.local", quiet: true });

const OUTPUT_DIR = path.join(process.cwd(), "reports/coach-eval");
const CONCURRENCY = 3;

// The judge only writes two short lines, but on a reasoning model its budget
// also pays for reasoning. At 200 the judge itself ran dry and returned
// nothing, which read as a FAIL against the coach.
const JUDGE_MAX_TOKENS = 1024;

interface CaseOutcome {
  caseId: string;
  rule: string;
  locale: string;
  personaId: string;
  passed: boolean;
  guardRejected: boolean;
  reply: string;
  grades: GradeResult[];
  error?: string;
  /** Present only when the case reached the model. */
  generation?: {
    finishReason: string | null;
    completionTokens: number | null;
    reasoningTokens: number | null;
    latencyMs: number;
  };
}

function parseArgs(argv: string[]) {
  const flag = (name: string) => argv.includes(`--${name}`);
  const value = (name: string) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  return {
    live: flag("live"),
    calibrate: flag("calibrate"),
    caseId: value("case"),
    locale: value("locale"),
    limit: value("limit") ? Number(value("limit")) : undefined,
  };
}

function selectCases(args: ReturnType<typeof parseArgs>): EvalCase[] {
  let selected = CASES;
  if (args.caseId) selected = selected.filter((item) => item.id === args.caseId);
  if (args.locale) selected = selected.filter((item) => item.locale === args.locale);
  if (args.limit !== undefined) selected = selected.slice(0, args.limit);
  return selected;
}

/** Fails loudly on a case that names a grader which no longer exists. */
function validateWiring(cases: EvalCase[]): string[] {
  const problems: string[] = [];
  for (const item of cases) {
    if (!(item.fixtureId in FIXTURES)) {
      problems.push(`${item.id}: unknown fixture "${item.fixtureId}"`);
    }
    if (item.userMessages.length === 0) {
      problems.push(`${item.id}: has no student messages`);
    }
    for (const graderId of item.graders) {
      if (!GRADERS_BY_ID.has(graderId)) {
        problems.push(`${item.id}: unknown grader "${graderId}"`);
      }
    }
    if (!item.expectGuardRejection && item.graders.length === 0) {
      problems.push(`${item.id}: asserts nothing`);
    }
  }
  return problems;
}

/**
 * Reads the coach config through `getCoachEnv` — the same accessor the
 * production provider uses — so model, endpoint, and token budget cannot
 * differ between what is evaluated and what ships.
 */
function createClient() {
  let env: ReturnType<typeof getCoachEnv>;
  try {
    env = getCoachEnv();
  } catch (error) {
    console.error(
      "✖ Coach env is not usable for a --live run:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
  return {
    client: new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.COACH_API_URL,
      timeout: 60_000,
      maxRetries: 1,
    }),
    model: env.COACH_MODEL,
    maxTokens: env.COACH_MAX_TOKENS,
    thinking: resolveThinking(env.COACH_THINKING, env.COACH_API_URL),
  };
}

type CoachConfig = Omit<ReturnType<typeof createClient>, "client">;

async function runCase(
  item: EvalCase,
  client: OpenAI,
  config: CoachConfig,
  judge: JudgeFn,
): Promise<CaseOutcome> {
  const { model, maxTokens, thinking } = config;
  const puzzle = FIXTURES[item.fixtureId];
  const persona = getPersona(item.personaId);
  const base: CaseOutcome = {
    caseId: item.id,
    rule: item.rule,
    locale: item.locale,
    personaId: item.personaId,
    passed: false,
    guardRejected: false,
    reply: "",
    grades: [],
  };

  // Step 1 — the guard, exactly where production runs it.
  const lastMessage = item.userMessages[item.userMessages.length - 1];
  const guard = guardUserMessage(lastMessage);
  if (!guard.ok) {
    const expected = item.expectGuardRejection === true;
    return {
      ...base,
      guardRejected: true,
      passed: expected,
      grades: [
        {
          graderId: "prompt-guard",
          kind: "deterministic",
          passed: expected,
          detail: expected
            ? `rejected as expected (${guard.code})`
            : `guard false positive on an ordinary message (${guard.code})`,
        },
      ],
    };
  }
  if (item.expectGuardRejection) {
    return {
      ...base,
      passed: false,
      grades: [
        {
          graderId: "prompt-guard",
          kind: "deterministic",
          passed: false,
          detail: "injection passed the guard and reached the model",
        },
      ],
    };
  }

  // Step 2 — the real system prompt.
  const systemPrompt = buildSystemPrompt(
    puzzle,
    item.locale,
    item.userMove,
    item.isCorrect,
    persona,
  );

  // Step 3 — the completion. Non-streaming: the eval grades the finished
  // text, and streaming only changes how the same text arrives.
  let reply: string;
  let generation: NonNullable<CaseOutcome["generation"]>;
  const startedAt = Date.now();
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: COACH_TEMPERATURE,
      max_tokens: maxTokens,
      ...(thinkingParam(thinking) as Record<string, never>),
      messages: [
        { role: "system", content: systemPrompt },
        ...item.userMessages.map((content) => ({ role: "user" as const, content })),
      ],
    });
    reply = completion.choices[0]?.message?.content ?? "";
    // `reasoning_tokens` is a provider extension; absent on non-reasoning models.
    const details = (
      completion.usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined
    )?.completion_tokens_details;
    generation = {
      finishReason: completion.choices[0]?.finish_reason ?? null,
      completionTokens: completion.usage?.completion_tokens ?? null,
      reasoningTokens: details?.reasoning_tokens ?? null,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Step 4 — grading.
  const context: GradeContext = {
    reply,
    locale: item.locale,
    puzzle,
    persona,
    userMessages: item.userMessages,
  };
  // Applied to every case that reaches the model, whatever graders it names.
  // A reply cut off by the token budget is broken no matter what it says, and
  // this is the failure that shipped unnoticed until 2026-09: a reasoning model
  // spent all 400 tokens thinking and every analysis question got nothing.
  const grades: GradeResult[] = [
    {
      graderId: "generation-budget",
      kind: "deterministic",
      passed: generation.finishReason !== "length",
      detail:
        generation.finishReason === "length"
          ? `cut off at max_tokens=${maxTokens} (${generation.reasoningTokens ?? "?"} reasoning tokens)`
          : `finish=${generation.finishReason}`,
    },
  ];
  for (const graderId of item.graders) {
    const grader = GRADERS_BY_ID.get(graderId);
    if (!grader) continue;
    grades.push(await grader.grade(context, judge));
  }

  return {
    ...base,
    reply,
    grades,
    generation,
    passed: grades.every((grade) => grade.passed),
  };
}

function createJudge(client: OpenAI, config: CoachConfig): JudgeFn {
  return async (rubric: string) => {
    const completion = await client.chat.completions.create({
      model: config.model,
      temperature: 0,
      max_tokens: JUDGE_MAX_TOKENS,
      // Same host-based default as the coach. With thinking on, DeepSeek
      // ignores `temperature`, so the judge's 0 would be silently discarded
      // and calibration could not tell a bad rubric from sampling noise.
      ...(thinkingParam(config.thinking) as Record<string, never>),
      messages: [
        {
          role: "system",
          content:
            "You grade a Go coaching assistant against one rubric. Reply with PASS or FAIL " +
            "on the first line, then one short sentence of rationale on the second. Nothing else.",
        },
        { role: "user", content: rubric },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text) {
      // Say so explicitly: an empty judge is a harness failure, and reporting
      // it as a bare FAIL would blame the coach for the grader's problem.
      return {
        verdict: false,
        rationale: `JUDGE PRODUCED NO VERDICT (finish=${completion.choices[0]?.finish_reason}) — harness problem, not a coach result`,
      };
    }
    const [verdictLine, ...rest] = text.split("\n");
    return {
      verdict: /^\s*pass\b/i.test(verdictLine),
      rationale: (rest.join(" ").trim() || verdictLine).slice(0, 240),
    };
  };
}

/** Bounded worker pool — polite to the provider, and keeps a run readable. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

function writeReport(outcomes: CaseOutcome[], config: CoachConfig) {
  const { model, maxTokens, thinking } = config;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const passed = outcomes.filter((outcome) => outcome.passed).length;

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "latest.json"),
    `${JSON.stringify({ generatedAt, model, maxTokens, thinking: thinking ?? "unset", passed, total: outcomes.length, outcomes }, null, 2)}\n`,
  );

  const lines = [
    "# Coach eval — latest run",
    "",
    `**Generated**: ${generatedAt}`,
    `**Model**: ${model} · **max_tokens**: ${maxTokens} · **thinking**: ${thinking ?? "unset (provider default)"}`,
    `**Result**: ${passed}/${outcomes.length} cases passed`,
    "",
    "| Case | Locale | Persona | Result | Tokens (reasoning/total) | Latency | Failing graders |",
    "| ---- | ------ | ------- | ------ | ------------------------ | ------- | --------------- |",
  ];
  for (const outcome of outcomes) {
    const failing = outcome.grades
      .filter((grade) => !grade.passed)
      .map((grade) => grade.graderId)
      .join(", ");
    const g = outcome.generation;
    const tokens = g ? `${g.reasoningTokens ?? "–"}/${g.completionTokens ?? "?"}` : "–";
    const latency = g ? `${(g.latencyMs / 1000).toFixed(1)}s` : "–";
    lines.push(
      `| ${outcome.caseId} | ${outcome.locale} | ${outcome.personaId} | ${
        outcome.error ? "ERROR" : outcome.passed ? "pass" : "FAIL"
      } | ${tokens} | ${latency} | ${outcome.error ?? failing ?? ""} |`,
    );
  }
  lines.push("", "## Failing cases", "");
  const failures = outcomes.filter((outcome) => !outcome.passed);
  if (failures.length === 0) {
    lines.push("None.");
  } else {
    for (const outcome of failures) {
      lines.push(`### ${outcome.caseId}`, "", `**Rule**: ${outcome.rule}`, "");
      if (outcome.error) lines.push(`**Error**: ${outcome.error}`, "");
      for (const grade of outcome.grades.filter((item) => !item.passed)) {
        lines.push(`- \`${grade.graderId}\` (${grade.kind}) — ${grade.detail}`);
      }
      lines.push("", "**Reply**:", "", "```", outcome.reply || "(empty)", "```", "");
    }
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, "latest.md"), `${lines.join("\n")}\n`);
}

// Each labeled example runs this many times. A judge that agrees 2 times in 3
// is not trustworthy on that example, so calibration requires all of them.
const CALIBRATION_RUNS = 3;

function validateCalibration(examples: JudgeCalibrationExample[]): string[] {
  const problems: string[] = [];
  for (const example of examples) {
    const grader = GRADERS_BY_ID.get(example.graderId);
    if (!grader) problems.push(`${example.id}: unknown grader "${example.graderId}"`);
    else if (grader.kind !== "judge") {
      problems.push(
        `${example.id}: "${example.graderId}" is deterministic and needs no calibration`,
      );
    }
    if (!(example.fixtureId in FIXTURES)) {
      problems.push(`${example.id}: unknown fixture "${example.fixtureId}"`);
    }
  }
  return problems;
}

async function runCalibration(client: OpenAI, config: CoachConfig) {
  const judge = createJudge(client, config);
  console.log(
    `Judge calibration — ${config.model}, thinking=${config.thinking ?? "unset"}, ` +
      `${JUDGE_CALIBRATION.length} labeled example(s) × ${CALIBRATION_RUNS} run(s)\n`,
  );

  const results = await mapWithConcurrency(JUDGE_CALIBRATION, CONCURRENCY, async (example) => {
    const grader = GRADERS_BY_ID.get(example.graderId)!;
    const context: GradeContext = {
      reply: example.reply,
      locale: example.locale,
      puzzle: FIXTURES[example.fixtureId],
      persona: getPersona(example.personaId),
      userMessages: example.userMessages,
    };
    let agreed = 0;
    let lastDisagreement = "";
    for (let run = 0; run < CALIBRATION_RUNS; run++) {
      const grade = await grader.grade(context, judge);
      const verdict = grade.passed ? "pass" : "fail";
      if (verdict === example.expected) agreed++;
      else lastDisagreement = grade.detail;
    }
    const ok = agreed === CALIBRATION_RUNS;
    console.log(
      `  ${ok ? "ok   " : "WRONG"} ${example.id.padEnd(38)} ${example.graderId.padEnd(24)} ` +
        `expected=${example.expected} ${agreed}/${CALIBRATION_RUNS}`,
    );
    if (!ok) console.log(`        judge said: ${lastDisagreement}`);
    return ok;
  });

  const trusted = results.filter(Boolean).length;
  console.log(`\n${trusted}/${results.length} examples judged correctly on every run`);
  if (trusted !== results.length) {
    console.error(
      "✖ A judge disagrees with a labeled example. Fix its rubric in graders.ts before trusting eval results.",
    );
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.calibrate) {
    const problems = validateCalibration(JUDGE_CALIBRATION);
    if (problems.length > 0) {
      console.error(`✖ Calibration set is misconfigured — ${problems.length} problem(s):\n`);
      for (const problem of problems) console.error(`  ${problem}`);
      process.exit(1);
    }
    if (!args.live) {
      console.log(
        `Judge calibration — dry run: ${JUDGE_CALIBRATION.length} labeled example(s), wiring OK.\n` +
          `A --live run would make ${JUDGE_CALIBRATION.length * CALIBRATION_RUNS} judge call(s).`,
      );
      return;
    }
    const { client, ...config } = createClient();
    await runCalibration(client, config);
    return;
  }

  const cases = selectCases(args);

  if (cases.length === 0) {
    console.error("✖ No cases matched the given filters.");
    process.exit(1);
  }

  const problems = validateWiring(cases);
  if (problems.length > 0) {
    console.error(`✖ Eval set is misconfigured — ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  if (!args.live) {
    const judgeCalls = cases.reduce(
      (total, item) =>
        total +
        item.graders.filter((graderId) => GRADERS_BY_ID.get(graderId)?.kind === "judge").length,
      0,
    );
    console.log(`Coach eval — dry run (${cases.length} case(s), wiring OK)\n`);
    for (const item of cases) {
      const guard = item.expectGuardRejection ? " [expects guard rejection]" : "";
      console.log(`  ${item.id.padEnd(34)} ${item.locale}  ${item.personaId.padEnd(12)}${guard}`);
      console.log(`  ${" ".repeat(34)} rule: ${item.rule}`);
    }
    console.log(
      `\nA --live run would make ${cases.length - cases.filter((item) => item.expectGuardRejection).length} coach call(s) ` +
        `and ${judgeCalls} judge call(s).`,
    );
    console.log("Re-run with --live to execute against the configured provider.");
    return;
  }

  const { client, ...config } = createClient();
  const { model, maxTokens, thinking } = config;
  const judge = createJudge(client, config);
  console.log(
    `Coach eval — live run against ${model}, max_tokens=${maxTokens}, thinking=${thinking ?? "unset"} (${cases.length} case(s))\n`,
  );

  const outcomes = await mapWithConcurrency(cases, CONCURRENCY, async (item) => {
    const outcome = await runCase(item, client, config, judge);
    const status = outcome.error ? "ERROR" : outcome.passed ? "pass " : "FAIL ";
    const g = outcome.generation;
    const stats = g
      ? `  [${g.reasoningTokens ?? "–"}r/${g.completionTokens ?? "?"}t, ${(g.latencyMs / 1000).toFixed(1)}s, ${g.finishReason}]`
      : "";
    console.log(`  ${status} ${outcome.caseId.padEnd(34)}${stats}`);
    return outcome;
  });

  writeReport(outcomes, config);

  const passed = outcomes.filter((outcome) => outcome.passed).length;
  console.log(`\n${passed}/${outcomes.length} passed — report written to reports/coach-eval/`);
  if (passed !== outcomes.length) {
    console.error("✖ Coach behavior regressed against the eval set.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("✖ Eval run failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
