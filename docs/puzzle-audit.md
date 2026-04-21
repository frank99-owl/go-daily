# Puzzle Library Audit Tool

## Overview

`npm run audit:puzzles` is the content QA snapshot for go-daily.

It audits the canonical server-side `PUZZLES` collection, compares it with the
checked-in lightweight client index, and writes both a human-readable summary
and a machine-readable JSON file for follow-up work.

## Commands

```bash
npm run sync:puzzle-index
npm run validate:puzzles
npm run audit:puzzles
```

- `sync:puzzle-index`: regenerates `content/data/puzzleIndex.json` from the
  canonical `PUZZLES` array.
- `validate:puzzles`: enforces schema, semantic, and summary-index consistency.
- `audit:puzzles`: produces a richer QA report for content planning and model
  follow-up work.

## Outputs

Audit output is written to a fixed location:

- `reports/puzzle-audit/latest.md`
- `reports/puzzle-audit/latest.json`

The files are intentionally ignored by git. They are reproducible build
artifacts, not source of truth.

## What The Audit Covers

### Index consistency

- Canonical summary count from `PUZZLES`
- Checked-in `puzzleIndex.json` count
- `staleIndexIds`: IDs still present in the client index but not in `PUZZLES`
- `missingSummaryIds`: IDs present in `PUZZLES` but missing from the client index

### Content health

- Total puzzle count
- Curated / non-curated split
- Date range
- `curatedRunwayDays`: how many consecutive curated dates remain from the audit date
- Board-size / difficulty / tag distributions
- Imbalance warnings for over-concentrated or underrepresented buckets

### Coach readiness

- `coachEligibleCandidates`: puzzles that currently satisfy the quality gate
- Eligibility reason breakdown for the whole library
- Solution-note quality tiers:
  - `missing`
  - `generic-placeholder`
  - `thin`
  - `explained`
  - `coach-ready`

### Prompt / note QA

- Prompt template dedupe statistics by locale
- Long prompt anomalies
- Long solution-note anomalies
- Missing-field anomalies

## Recommended Workflow

1. Run `npm run sync:puzzle-index` whenever curated or imported puzzle data changes.
2. Run `npm run validate:puzzles` before pushing.
3. Run `npm run audit:puzzles` when preparing content work for Kimi or reviewing
   library health.
4. Use `latest.json` as the machine-readable input for batch candidate selection,
   not as a manually edited source file.
