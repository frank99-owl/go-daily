---
description: Run the CI gate locally, in CI's order, and stop at the first real failure
argument-hint: "[--fast]"
allowed-tools: Bash, Read, Edit, Grep, Glob
---

Run this repository's verification gate against the current working tree.

`docs/zh/TECH_DEBT.md` states the verification requirements in prose, and
`.github/workflows/ci.yml` enforces them. This command is the executable form,
so a change is checked before it becomes a red pipeline.

## Order

Run these in order and **stop at the first failure**. The order mirrors CI: the
cheap checks run first so a formatting slip does not cost a full build.

```bash
npm run format:check
npm run lint
npm run validate:puzzles
npm run validate:messages
npm run validate:context
npx tsc --noEmit
npx tsc --project tsconfig.scripts.json
npm run test:coverage
npm run build
```

With `--fast`, skip `npm run build` (the slowest step) and say clearly in your
report that the build was not verified.

## Rules

- **Report the real outcome.** If a step fails, show the actual output and stop.
  Never describe a skipped or failing step as passing.
- **`npm run test:coverage`, not `npm run test`.** The coverage thresholds in
  `vitest.config.ts` are a ratchet, and a bare `test` run does not evaluate them.
- **Never lower a coverage threshold to make the gate pass.** If coverage drops,
  the change removed tested code or added untested code — write the test.
- **`validate:context` failing means the agent context is stale**, not that the
  check is wrong. Fix `CLAUDE.md` / `AGENTS.md` or fix the code they describe.
- **E2E is not in this list.** `npm run test:e2e` needs a production build and
  runs as its own CI job; run it only when routing, status codes, security
  headers, or canvas interaction changed.

## Report

Finish with a short summary: which steps ran, which passed, the first failure if
there was one, and the coverage numbers from the run.
