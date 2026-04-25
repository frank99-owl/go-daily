# Repository guide for AI coding agents

**Start here:** [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) — current phase, done vs pending, common pitfalls, key file paths.

**Next phase (Stripe / paywall):** [`docs/phase2-next-steps.md`](docs/phase2-next-steps.md)

**Architecture & i18n:** [`docs/architecture.md`](docs/architecture.md), [`docs/i18n.md`](docs/i18n.md)

**CI:** `.github/workflows/ci.yml` — run `npm run format:check && npm run lint && npm run test && npm run build` before large merges.

Do not commit `.env.local` or secrets. Follow existing patterns in `lib/` and `components/`; locale-aware routes live under `app/[locale]/`.
