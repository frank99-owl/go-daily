# Security Policy

## 1. Supported Versions

We provide security updates for the following versions of go-daily:

| Version | Supported          |
| ------- | ------------------ |
| v1.1.x  | :white_check_mark: |
| < v1.1  | :x:                |

## 2. Reporting a Vulnerability

We take the security of go-daily seriously. If you believe you have found a security vulnerability, please **do not open a public issue**. Instead, follow these steps:

1.  Email a detailed report to **security@go-daily.app** (placeholder for now, or use GitHub private reporting if enabled).
2.  Include a description of the vulnerability, the potential impact, and steps to reproduce.
3.  We will acknowledge your report within 48 hours and provide a timeline for a fix.

## 3. PII & Data Protection

- **AI Coach Dialogues**: We use a `beforeSend` filter in Sentry and PostHog to redact user messages before they leave the client. We do not store full dialogue history in a way that is linked to your identity on our servers.
- **Payment Data**: All payment processing is handled by **Stripe**. We never see or store your full credit card number.
- **Database Security**: We enforce Row Level Security (RLS) on all Supabase tables. Data is encrypted at rest and in transit. The `manual_grants` table has RLS enabled with no end-user policies — reads/writes go through `service_role` on trusted server routes only. The `guest_coach_usage` table follows the same pattern for anonymous coach counters.

## 4. Prompt Injection

While we implement `promptGuard.ts` to mitigate prompt injection, users should be aware that the AI Coach is an LLM. We do not recommend sharing sensitive personal information with the coach. Input is Unicode NFKC-normalized before pattern matching, collapsing fullwidth and homoglyph characters to their ASCII equivalents to prevent bypass via lookalike characters.

(C) 2026 Frank.
