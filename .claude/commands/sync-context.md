---
description: Bring CLAUDE.md, AGENTS.md and docs/ back in line with the code after a structural change
argument-hint: "[what changed]"
allowed-tools: Bash, Read, Edit, Grep, Glob
---

Re-sync the project's context layer after: $ARGUMENTS

This repository carries two always-on agent context files and 46 documents
across four locales. They are prose, so they rot silently — and an agent
reading a stale map writes the mistake into code rather than into a review
comment. `npm run validate:context` catches the mechanical half of that; this
command covers the rest.

## Step 1 — Find the drift mechanically

```bash
npm run validate:context
```

Fix everything it reports before going further. It checks four things: that
every documented `npm run` script exists, that the nine-domain table matches
`lib/`, that every backticked repo path resolves, and that every critical
invariant appears in **both** `CLAUDE.md` and `AGENTS.md`.

If a path is referenced precisely because it must _not_ exist, add it to
`INTENTIONALLY_ABSENT` in `scripts/validateContext.ts` **together with the prose
that explains the absence** — never to silence a real finding.

## Step 2 — Check the facts the validator cannot see

These drift constantly and no script catches them:

- **Test counts** in `AGENTS.md` and `docs/*/OPERATIONS_QA.md`. Get the real
  numbers from `npm run test` and `npm run test:e2e`; do not carry old ones
  forward.
- **New invariants.** If the change added a rule an agent must not violate —
  a new dedup key, a new service-role-only table, a new refund or quota rule —
  add it to the pitfalls in both context files _and_ to `CRITICAL_INVARIANTS`
  in `scripts/validateContext.ts`, so the next drift is caught mechanically.
- **`docs/zh/PROJECT_STATUS.md`** is the phase source of truth; the other
  locales follow it.

## Step 3 — Locale fan-out

`docs/` has four locales. A fact updated in `zh` only is a fact that is now
wrong in three languages. Update all four in the same change, or update none
and say which ones you deliberately left.

## Step 4 — Verify

```bash
npm run validate:context
npm run format:check
```

For a docs-only change those two are enough. If you also touched a fact that
the code enforces, run `/verify` in full.

## Rules

- Never invent a number. If you did not run the command that produces it, say
  the number is unverified rather than writing a plausible one.
- Do not restructure a document you were not asked to restructure. This command
  syncs facts; it is not a rewrite.
