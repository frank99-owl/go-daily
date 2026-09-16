# Coach behavioral evals

## Why this exists

`tests/lib/coach/coachPrompt.test.ts` asserts that the system prompt **contains** its
rules. Nothing asserted that the model **follows** them.

That gap matters more here than in most products. The coach is the paid
feature, and its behavior is defined by prose — roughly a dozen rules in
`buildSystemPrompt` covering language, coordinate notation, ground-truth
adherence, off-topic deflection and greeting handling, plus five persona briefs
in `lib/coach/personas.ts`. None of it is typed, so the ordinary safety net
does not reach it: a reworded sentence can change what a paying student is told
while every existing test stays green.

This suite closes that gap. It drives the same chain a real request takes —
`guardUserMessage` → `buildSystemPrompt` → the coach provider — and grades the
reply against the rules the prompt actually states.

## Running it

```bash
npm run eval:coach                    # dry run: prints the plan, makes no API calls
npm run eval:coach -- --live          # real calls against COACH_API_URL
npm run eval:coach -- --live --case=greeting-zh
npm run eval:coach -- --live --locale=zh
npm run eval:coach -- --live --limit=3
```

Dry run is the default, the same rule `npm run email:smoketest` follows: a live
run costs one completion per case plus one per judge grader, and the dry run
tells you exactly how many before you spend anything. A live run needs
`DEEPSEEK_API_KEY` in `.env.local` and writes `reports/coach-eval/latest.{json,md}`.

## What it has already caught

The first live run, on 2026-09-16, failed 7 of 16 cases — every one of them an
empty reply, and every one an analysis question ("where should I have played?",
"why was that wrong?"). The cause was not the prompt: `max_tokens` was a
hardcoded 400, and `deepseek-v4-flash` spends hidden reasoning out of that
budget. It used all 400 thinking, finished with `length`, and produced nothing
visible. The production provider, called directly, did the same. Paying
students were getting blank replies on exactly the questions the coach exists
for, and no unit test could have seen it.

The same run then surfaced a real prompt conflict: a persona brief centered on
judging moves kept announcing the verdict in reply to a plain greeting (3 of 4
runs), because nothing in the prompt said the behavioral rules outrank the brief.

Both are fixed; see `COACH_MAX_TOKENS` / `COACH_THINKING` in `lib/env.ts` and
the precedence line in `lib/coach/coachPrompt.ts`.

## Reading a run

Every case that reaches the model is graded `generation-budget` automatically,
whatever graders it names: it fails when the reply was cut off by the token
budget. The console and `reports/coach-eval/latest.md` print reasoning tokens,
total tokens, latency and `finish_reason` per case, so a budget problem reads
as one instead of as a behavioral failure.

The runner reads model, endpoint, `COACH_MAX_TOKENS` and `COACH_THINKING`
through `getCoachEnv()` — the accessor the production provider uses — and
imports `COACH_TEMPERATURE` from the provider, so it cannot drift from what
ships. To compare settings without editing `.env.local`, set them for one run:

```bash
COACH_THINKING=enabled npm run eval:coach -- --live
```

A judge grader that returns no text is reported as `JUDGE PRODUCED NO VERDICT`,
not as a coach failure — on a reasoning model the judge's own budget pays for
reasoning too.

## Why it is not in CI

`.github/workflows/ci.yml` deliberately does not run this suite. It needs a
real API key, it costs money per run, and it is non-deterministic — three
properties that make a merge gate flaky and expensive. It gates **human
judgment on a prompt change** instead: see `.claude/commands/prompt-change.md`.

What _does_ run in CI is `tests/evals/coach/graders.test.ts`, which unit-tests the
deterministic graders and the eval set's wiring. That keeps the harness itself
from rotting into a suite that reports green while detecting nothing.

## Layout

| File                        | Role                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| `coach/fixtures.ts`         | Hand-written positions, pinned so content batches cannot move the baseline |
| `coach/cases.ts`            | One case per prompt rule, each naming the rule it protects                 |
| `coach/graders.ts`          | Deterministic graders (free, exact) and judge graders (model calls)        |
| `coach/run.ts`              | The runner: guard → prompt → completion → grade → report                   |
| `coach/judgeCalibration.ts` | Labeled replies with known verdicts, for checking the judges themselves    |

## Adding a case

Add one whenever you add or reword a rule in the system prompt — in the same
change, not afterwards. Set `rule` to the rule the case protects, so a failure
report says what broke rather than which string mismatched.

Prefer a deterministic grader. Each judge grader is a second model call that
can itself be wrong, so reserve them for claims no rule can settle: "did it
actually decline and steer back?" is a judge; "did it reply in Korean?" is not.

## Calibrating the judges

A judge grader is a model call and can be wrong, which leaves a failing judge
case ambiguous: did the coach regress, or did the judge misread a good reply?
Re-running until green, or deleting the case, both quietly erode the suite.

`evals/coach/judgeCalibration.ts` holds replies whose correct verdict is known —
real replies from live runs plus replies written to hit a specific failure —
each with a `because` explaining the label.

```bash
npm run eval:coach -- --calibrate          # dry run: wiring check and call count
npm run eval:coach -- --live --calibrate   # each example through its judge, 3 times
```

A judge is trusted only when it matches every label on every run. When it does
not, fix the rubric in `graders.ts` — not the label, unless you can say why the
label is wrong. Re-run calibration after any rubric change, and before trusting
a judge failure you did not expect.

This has already mattered. On 2026-09-16 the `no-unsolicited-critique` judge
failed a greeting reply that followed the rule exactly. Calibrating showed the
rubric was wrong in both directions: with thinking on it rejected that good
reply, and with thinking off it passed a reply that announced the student's
move was correct — 0 of 3 runs caught the real leak. The rubric now enumerates
the prompt's exact failure conditions and matches all 10 labels, 3 of 3 runs.

Every judge grader must have at least one PASS and one FAIL example; with only
one kind, a judge that always answers that way would calibrate as perfect.
`tests/evals/coach/graders.test.ts` enforces this without a key.

The judge runs with the same host-based thinking default as the coach. With
thinking on, DeepSeek ignores `temperature`, so the judge's `0` would be
discarded and calibration could not separate a bad rubric from sampling noise.

## Known limits

- **Judge graders can be wrong.** A single failure may be noise. Re-run the
  case alone before concluding the prompt regressed.
- **The fixtures are not the live puzzle set.** That is deliberate — an eval
  reading `content/puzzles.server.ts` would change its own baseline every time
  the content pipeline lands a batch. It also means these evals say nothing
  about puzzle data quality; `npm run audit:puzzles` and `npm run report:quality`
  cover that.
- **No cost assertion.** The suite checks behavior, not token spend. Coach cost
  monitoring is tracked separately in `docs/zh/TECH_DEBT.md`.
