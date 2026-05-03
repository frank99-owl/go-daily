# go-daily

> One Go puzzle a day — with a Socratic AI coach in **中 / EN / 日 / 한**.

**Languages:** English (this page) · [中文](README.zh.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

[![CI](https://github.com/frank99-owl/go-daily/actions/workflows/ci.yml/badge.svg)](https://github.com/frank99-owl/go-daily/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)
![Stripe](https://img.shields.io/badge/Stripe-payments-626cd9?logo=stripe)

## Overview

**go-daily** is a production-oriented daily tsumego (Go life-and-death) platform: one focused puzzle per day, full **Chinese / English / Japanese / Korean** UX, and a **Socratic** AI coach that guides thinking instead of giving away the solution.

Technically, the product is a **Next.js 16 (App Router)** stack on **Supabase** (Auth, Postgres, RLS), **Stripe** for subscriptions, and a deliberately **nine-domain** layout under `lib/` so behaviour stays traceable as the system grows.

## At a glance

| Focus              | What you get                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Daily practice** | Curated puzzles, habit-friendly flow, keyboard-accessible board                                                           |
| **AI coach**       | Streaming coach API, fair-use quotas, persona system, puzzle-level eligibility                                            |
| **Global product** | Locale-prefixed routing, SEO-scale sitemap with the puzzle corpus, adaptive pricing                                       |
| **Operations**     | Documented APIs & schema, automated CI (format → lint → validate → typecheck → test → build), security disclosure process |

## Documentation

Authoritative technical and product documentation is the **eight-pillar, four-locale** library under [`docs/`](docs/README.md). Use the hub to pick your language (`en` / `zh` / `ja` / `ko`).

| I need…                                                | Start here (English)                               |
| ------------------------------------------------------ | -------------------------------------------------- |
| Vision, strategy, phases                               | [Concept & strategy](docs/en/CONCEPT.md)           |
| Request lifecycle, `lib/` domains, security boundaries | [Architecture](docs/en/ARCHITECTURE.md)            |
| SRS, entitlements, subscriptions, coach rules          | [Product specifications](docs/en/PRODUCT_SPECS.md) |
| Deploy, env, tests, preflight                          | [Operations & QA](docs/en/OPERATIONS_QA.md)        |
| Release readiness / roadmap cues                       | [Project status](docs/en/PROJECT_STATUS.md)        |
| HTTP routes & payloads                                 | [API reference](docs/en/API_REFERENCE.md)          |
| Tables, indexes, RLS                                   | [Database schema](docs/en/DATABASE_SCHEMA.md)      |
| Legal posture (multi-jurisdiction)                     | [Legal & compliance](docs/en/LEGAL_COMPLIANCE.md)  |

**Also:** [Changelog](CHANGELOG.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Contributing (中文)](CONTRIBUTING.zh.md) · [License](LICENSE)

## Quick start

### Prerequisites

- Node.js **22.5+** (see `package.json` `engines`)
- A DeepSeek or OpenAI-compatible API key (coach)
- Supabase project (optional for local dev; anonymous mode works without it)

### Install & run

```bash
git clone https://github.com/frank99-owl/go-daily.git
cd go-daily
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000` — locale negotiation redirects to `/{zh|en|ja|ko}/...`.

## Tech stack

| Layer       | Choices                                                                       |
| ----------- | ----------------------------------------------------------------------------- |
| UI          | Next.js 16, React 19, Tailwind CSS v4, Framer Motion                          |
| Data & auth | Supabase (Postgres + RLS), tiered client storage                              |
| Payments    | Stripe (adaptive pricing, trials)                                             |
| AI          | DeepSeek Chat API (Socratic coach pipeline)                                   |
| Edge        | Upstash Redis rate limiting (required in production for standard deployments) |
| Email       | Resend (transactional, where configured)                                      |

## Contributing & security

Issues and PRs are welcome where policy allows. See **[Contributing](CONTRIBUTING.md)** for domain layout, i18n checks, and CI expectations. Report vulnerabilities per **[SECURITY.md](SECURITY.md)** — please do not open public issues for undisclosed security problems.

---

Copyright © 2026 Frank. All rights reserved. See [LICENSE](LICENSE).
