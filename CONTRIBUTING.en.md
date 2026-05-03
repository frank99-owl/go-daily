# Contributing to go-daily

Thank you for your interest in contributing to go-daily! We maintain high engineering standards to ensure a seamless experience across 4 languages and global markets.

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
npm install
npm run dev
```

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

## 4. Commit Message Convention

We follow conventional commits:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `chore`: Updating build tasks, package manager configs, etc.

## 5. Submitting a PR

1.  Fork the repo and create your branch from `main`.
2.  Ensure `npm run prebuild` passes (validates puzzle data and i18n message keys). Before opening a PR, also run `npm run lint` locally — CI runs format check, lint, typecheck, tests, and production build.
3.  Include tests for any new logic.
4.  Update documentation in `docs/` if you change core behavior.

(C) 2026 Frank.
