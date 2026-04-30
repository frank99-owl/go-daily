# go-daily

> One Go puzzle a day — with a Socratic AI coach in **中 / EN / 日 / 한**.

[中文 →](README.zh.md) | [日本語 →](README.ja.md) | [한국어 →](README.ko.md)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)
![Stripe](https://img.shields.io/badge/Stripe-payments-626cd9?logo=stripe)

**go-daily** is a sleek, habit-focused platform for Go (围棋 / 囲碁 / 바둑) improvement. Master one vital point every day, backed by a Socratic AI coach that helps you think, not just gives you the answer.

---

## 📚 Documentation

Our documentation is structured around core logical pillars to ensure deep understanding and maintainability:

1.  **[Project Concept & Strategy](docs/en/CONCEPT.md)**: The "why" behind the geographic focus, monetization model, and lean engineering philosophy.
2.  **[Technical Architecture](docs/en/ARCHITECTURE.md)**: Deep dive into the `proxy.ts` request lifecycle, sync storage engine, and six-domain refactoring.
3.  **[Product Specifications](docs/en/PRODUCT_SPECS.md)**: Detailed logic for the SM-2 SRS algorithm, subscription entitlements, and AI coach eligibility.
4.  **[Operations & QA](docs/en/OPERATIONS_QA.md)**: Deployment guides, preflight checklists, and the test suite strategy.
5.  **[Live Status](docs/en/PROJECT_STATUS.md)**: Real-time tracker for the current sprint and production readiness.
6.  **[API Reference](docs/en/API_REFERENCE.md)**: Complete catalog of all API routes with request/response schemas.
7.  **[Database Schema](docs/en/DATABASE_SCHEMA.md)**: Supabase table definitions, indexes, and RLS policies.
8.  **[Legal & Compliance](docs/en/LEGAL_COMPLIANCE.md)**: Multi-jurisdiction legal strategy for global expansion.

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 20+
- A DeepSeek or OpenAI-compatible API key.
- Supabase project (optional for local dev, fallback to anonymous mode).

### 2. Installation

```bash
git clone https://github.com/frank99-owl/go-daily.git
cd go-daily
cp .env.example .env.local
npm install
```

### 3. Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Framer Motion.
- **Backend**: Supabase (Auth/Postgres), Upstash (Redis for Rate Limiting).
- **AI**: DeepSeek Chat API.
- **Business**: Stripe Adaptive Pricing, Resend Email.

---

(C) 2026 Frank. Distributed under the MIT License.
