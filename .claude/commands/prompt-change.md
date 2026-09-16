---
description: The required loop for changing the coach system prompt or a persona brief
argument-hint: "<what you want the coach to do differently>"
allowed-tools: Bash, Read, Edit, Grep, Glob
---

Change the coach's behavior: $ARGUMENTS

The coach is the paid feature. Its behavior is defined by prose in
`lib/coach/coachPrompt.ts` and `lib/coach/personas.ts`, which means a one-line
edit can change what thousands of students are told, with nothing in the type
system or the unit tests to stop it. This loop is what stands in for a compiler.

## Step 1 — Locate the rule

Read `lib/coach/coachPrompt.ts` in full before editing. Identify which existing
rule you are changing, and whether the change belongs in:

- `buildSystemPrompt`'s shared rules (applies to every persona and locale),
- the per-locale `byLocale` block (language and terminology only), or
- a persona's `systemInstructions` in `lib/coach/personas.ts` (register only).

State which one, and why, before you edit. A behavioral rule belongs in the
shared block — putting it in one persona silently exempts the other four.

## Step 2 — Edit all four locales together

`byLocale` and every `Record<Locale, string>` in `personas.ts` must stay in
sync. A rule added to `zh` alone is a rule that does not exist for 3 of your 4
markets.

## Step 3 — Pin the rule structurally

Add or update a case in `tests/lib/coach/coachPrompt.test.ts` asserting the prompt
now contains the rule. This is fast and free, and it catches accidental
deletion — but it proves nothing about what the model does.

## Step 4 — Pin the rule behaviorally

Add a case to `evals/coach/cases.ts` whose `rule` field names the rule you just
changed, wired to the graders that can detect it. Prefer a deterministic grader
from `evals/coach/graders.ts`; add a judge grader only when no rule-based check
can settle the question.

Then:

```bash
npm run eval:coach                 # dry run — confirms wiring, no API calls
npm run test -- tests/evals/coach  # the harness's own unit tests
```

## Step 5 — Run the eval live

```bash
npm run eval:coach -- --live
```

This costs real API calls, so it needs `DEEPSEEK_API_KEY` in `.env.local`.
Read `reports/coach-eval/latest.md` afterwards.

**A failing case means the prompt regressed, not that the eval is wrong.** Do
not delete or weaken a case to make the run green. If a case is genuinely
mis-specified, say so explicitly and explain why before changing it.

Because the graders include model calls, a single failure can be noise: re-run
the failing case alone (`--live --case=<id>`) before concluding anything — and
run it several times. One failure in five is noise; three in four is a
behavior.

Read the per-case generation stats before reading the verdict. A failing
`generation-budget` grade, `finish_reason: length`, or an empty reply means the
token budget ran out — a config problem (`COACH_MAX_TOKENS`, `COACH_THINKING`),
not a prompt problem. Fix that first; the behavioral grades on a truncated reply
mean nothing.

If a **judge** grader fails a reply you believe is correct, do not re-run
until it passes and do not delete the case. Run judge calibration:

```bash
npm run eval:coach -- --live --calibrate
```

If a judge disagrees with its labeled examples, the rubric is the problem: fix
it in `evals/coach/graders.ts`, add the misjudged reply to
`evals/coach/judgeCalibration.ts` with its correct label and a `because`, and
calibrate again until every example matches on every run. Only then re-run the
failing case.

## Step 6 — Report

Report the before/after eval results and the cost (the dry run prints the call
count). Then run `/verify`.

Do not deploy, push, or change any production configuration — that needs
Frank's explicit approval.
