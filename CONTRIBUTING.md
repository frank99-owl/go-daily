# Contributing to go-daily

**Languages:** [English (this page)](CONTRIBUTING.md) · [中文](CONTRIBUTING.zh.md)

Thank you for your interest in contributing to go-daily. We maintain high engineering standards to ensure a seamless experience across 4 languages and global markets.

## 1. Development Principles

- **Domain-Driven Logic**: All core logic must reside in `lib/` within its respective domain (e.g., `lib/coach/`, `lib/storage/`). Avoid logic leakage into UI components.
- **Type Safety**: We use strict TypeScript. All shared data structures must be derived from Zod schemas in `types/schemas.ts`.
- **Surgical Edits**: Prefer focused, minimal changes. If you find unrelated bugs, open a separate Issue/PR.

## 2. Directory Structure Guidelines

When adding new functionality, follow the nine-domain refactoring pattern:

- `lib/auth/`: Authentication and session management.
- `lib/board/`: Go rules, SGF parsing, board rendering, and move validation.
- `lib/coach/`: AI prompt engineering and quota logic.
- `lib/i18n/`: Localized text and path negotiation.
- `lib/puzzle/`: Puzzle loading, metadata, and state.
- `lib/storage/`: Tiered persistence (LocalStorage, IndexedDB, Supabase).
- `lib/posthog/`: Server-side analytics event tracking.
- `lib/stripe/`: Stripe SDK wrapper and billing logic.
- `lib/supabase/`: Supabase client initialization and helpers.

## 3. Workflow

### Local Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Use Node.js **22.5+** as declared in `package.json`. Local development can run in anonymous mode without a Supabase project, but payment, auth, sync, email, and production security flows require the corresponding environment variables from `.env.example`.

### i18n Validation

Before submitting, ensure all 4 languages are in sync:

```bash
npm run validate:messages
```

### Testing

We use Vitest. All logic changes require unit tests.

```bash
npm run test          # Run all tests
npm run test:coverage # Check coverage (Target: 70%+)
```

### Pre-PR Check

Run the same checks that CI expects before opening a pull request:

```bash
npm run format:check
npm run lint
npm run validate:puzzles
npm run validate:messages
npx tsc --noEmit
npm run test
npm run build
```

## 4. Commit Message Convention

We follow conventional commits:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `chore`: Updating build tasks, package manager configs, etc.

## 5. Submitting a PR

1. Fork the repository, or create a feature branch from `main` if you have direct access.
2. Keep the pull request focused on one change or one closely related set of changes.
3. Include tests for any new logic.
4. Update documentation in `docs/` if you change core behavior.
5. Confirm the Pre-PR Check passes locally, or call out any command you could not run.

## 6. Contribution Terms

The repository is source-available under a no-competing-use license. By submitting a pull request, patch, or other contribution, you confirm that you have the right to contribute the work and grant Frank a perpetual, worldwide, royalty-free right to use, modify, sublicense, and distribute that contribution as part of go-daily, including under the public source-available license and any separate commercial licenses Frank grants.

Do not submit confidential third-party code, copied puzzle content, copyrighted assets, or data you are not authorized to contribute. If the project changes license terms, this section should be reviewed together with the license text.

(C) 2026 Frank.
