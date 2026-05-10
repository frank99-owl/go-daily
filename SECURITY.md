# Security Policy

## 1. Supported Versions

We provide security updates for the following versions of go-daily:

| Version / branch               | Supported |
| ------------------------------ | --------- |
| `main` / production deployment | Yes       |
| `0.1.x`                        | Yes       |
| Older commits and forks        | No        |

The project has not reached a stable `1.x` release yet. Security support follows the
current production deployment and the active `0.1.x` line.

## 2. Reporting a Vulnerability

We take the security of go-daily seriously. If you believe you have found a security vulnerability, please **do not open a public issue**. Instead, follow these steps:

1.  Use GitHub Private Vulnerability Reporting for this repository when the private reporting button is available.
2.  If private reporting is not available, contact the repository owner through a private channel instead of filing a public issue.
3.  Include a description of the vulnerability, the potential impact, affected routes or components, and steps to reproduce.
4.  We will acknowledge your report within 48 hours and provide a timeline for triage or a fix.

## 3. PII & Data Protection

- **AI Coach Dialogues**: We use a `beforeSend` filter in Sentry and PostHog to redact user messages before they leave the client. We do not store full dialogue history in a way that is linked to your identity on our servers.
- **Payment Data**: All payment processing is handled by **Stripe**. We never see or store your full credit card number.
- **Database Security**: We enforce Row Level Security (RLS) on all Supabase tables. Data is encrypted at rest and in transit. The `manual_grants` table has RLS enabled with no end-user policies — reads/writes go through `service_role` on trusted server routes only. The `guest_coach_usage` table follows the same pattern for anonymous coach counters.

## 4. Prompt Injection

While we implement `promptGuard.ts` to mitigate prompt injection, users should be aware that the AI Coach is an LLM. We do not recommend sharing sensitive personal information with the coach. Input is Unicode NFKC-normalized before pattern matching, and common Cyrillic/Greek confusable characters are folded before policy checks. This is a defense-in-depth control, not a guarantee that all prompt-injection or lookalike-character attempts are blocked.

(C) 2026 Frank.
