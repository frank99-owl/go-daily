# Project Concept & Strategic Vision

This document outlines the "why" and "how" of go-daily's evolution from a zero-backend MVP to a global subscription product.

## 1. The Mission

Go-daily is designed to solve the "consistency gap" in Go improvement. It transforms a deep, often intimidating board game into a modern, 5-minute daily habit powered by Socratic AI coaching.

## 2. Strategic Phases (The Logic of Growth)

### Phase 1: Foundations & Global Reach (Status: Completed)

The goal was to build a "Product" out of a "Toy".

- **Geographic Focus**: Japan & Korea (High ARPU markets) + English fallback.
- **Internationalization**: Moved from cookie-based to **URL-prefixed routing** (`/[locale]`) to maximize SEO indexability (4,800+ URLs).
- **Persistence**: Implemented a robust "Three-State" storage logic (Anonymous LocalStorage -> IndexedDB Queue -> Supabase Cloud).

### Phase 2: Monetization & AI Coach (Status: Launching)

The goal is to prove the business model with a "Zero-Cost" infrastructure.

- **The "Pro" Bundle**: Defined by **Cross-Device Sync**, **Infinite Coach**, and **SRS Spaced Repetition**.
- **Monetization**: Stripe integration with adaptive pricing for JPY/KRW and a 7-day trial to lower friction.
- **AI Economy**: Utilizing DeepSeek to provide professional-grade coaching at a fraction of the cost of KataGo-driven cloud compute.

### Phase 3: Compliance & Content Depth (Status: Upcoming)

The goal is to professionalize and scale.

- **Legal**: Transitioning from placeholders to full GDPR/JCT compliance and unified account deletion.
- **Diversity**: Expanding beyond 19x19 life-and-death into 9x9/13x13 beginners' paths and opening/endgame categories.

## 3. The "Lean" Engineering Philosophy

- **Infrastructure Cost**: Target $0/month fixed cost (pre-revenue). Only pay-as-you-go (LLM) or revenue-triggered (Vercel Pro) costs.
- **Operational Simplicity**: Favoring Postgres RLS (Row Level Security) and Next.js Route Handlers over complex microservices.
- **Data Integrity**: Using the **Attempt Dedup Key** (`puzzleId-solvedAtMs`) as the global anchor for synchronization across all platforms.

## 4. Content Ethics & Copyright

- **Self-Audit Strategy**: We maintain a `knownPublicSources.ts` whitelist.
- **The "Verified" Tier**: Only verified public domain or creative commons puzzles are placed behind the Pro value-added features (like SRS), while unknown sources remain free with community attribution.
