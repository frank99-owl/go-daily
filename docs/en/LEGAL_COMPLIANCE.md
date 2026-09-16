# Global Legal & Compliance Strategy (2026 - Global Expansion)

**Classification**: Internal Compliance Strategy
**Status**: Draft for Review
**Jurisdictions**: USA, Canada, UK, EU, Japan, South Korea, Hong Kong, Taiwan, Australia, New Zealand

---

## 1. Asia-Pacific (APAC)

### 1.1 Taiwan (TW)

- **CPL Exception**: Under the "Criteria for Reasonable Exceptions to the Right to Rescind," digital content is exempt from the 7-day cooling-off period once performance has begun with consumer consent.
- **Strategy**: Explicit "Waiver of Rescission Rights" confirmation during the checkout flow.

### 1.2 Hong Kong (HK)

- **Data Transfer**: Adhere to PDPO best practices using Recommended Model Contractual Clauses (RMCs) for cross-border management.
- **AI Disclosure**: Transparent disclosure of data flow to third-party AI processors (DeepSeek).

### 1.3 Australia & New Zealand (AU/NZ)

- **Statutory Guarantees (ACL)**: "No Refund" policies are prohibited. Users are entitled to a remedy for "Major Failures" (e.g., persistent technical inability to use the service).
- **Privacy**: Compliance with AU Privacy Act 1988 and NZ Privacy Act 2020.

## 2. Europe & United Kingdom (UK/EU)

### 2.1 UK DMCCA 2024 (New Regulations)

- **Renewal Cooling-Off**: A new 14-day cancellation window after a trial ends and after any annual renewal of 12+ months.
- **Mandatory Reminders**: Emails must be sent before trial expiration and auto-renewal.
- **One-Click Cancel**: The cancellation path must be as straightforward as the sign-up path.

### 2.2 EU GDPR & Consumer Directive

- **Legal Basis**: AI dialogue processing performed under "Performance of a Contract."
- **Right of Withdrawal**: Users expressly consent to waive the 14-day withdrawal right upon subscription activation.

## 3. North America (NA)

### 3.1 USA

- **Contractual Defense**: Mandatory individual arbitration and class-action waivers.
- **COPPA**: Strict 13+ age restriction.

### 3.2 Canada

- **CPPA/PIPEDA**: "Ultimate Accountability" model for developers. Internal Privacy Impact Assessments (PIAs) are required.

---

## 4. Personality Rights & AI Personas

### 4.1 Risk

Using a real person's name, likeness, voice, or identifying characteristics in a paid service is a distinct legal risk in every major market — separate from consumer protection and data protection:

- **Mainland China**: Civil Code, Personality Rights book — right of name (arts. 1012, 1014, prohibiting misappropriation and impersonation), right of likeness (arts. 1018–1019), with voice protected by reference to likeness (art. 1023). A deceased person's name and likeness remain protected, and close relatives may bring claims (art. 994).
- **Japan**: publicity rights (パブリシティ権). The Supreme Court decision of 2 February 2012 (the Pink Lady case) held that use aimed solely at exploiting the customer-attraction power of a person's name or likeness infringes — including use to differentiate goods and use in advertising.
- **Korea**: Unfair Competition Prevention Act, art. 2(1)(ta) (in force 2022), makes unauthorized commercial use of a well-known person's name, likeness, voice, or other identifying marks an act of unfair competition; personality rights (인격권) apply in addition.
- **United States**: state right of publicity (e.g. California Civil Code §3344, New York Civil Rights Law §§50–51), and false endorsement under Lanham Act §43(a).
- **United Kingdom**: passing off can reach false endorsement (Irvine v Talksport [2002] EWHC 367 (Ch)).

The test is **identifiability**, not whether the name appears. Removing the name while keeping "eight world titles", "the one who beat the AI", a birth year, or a specific tournament still points at exactly one real person.

### 4.2 How go-daily handles it (2026-09)

- **AI mentors**: all five mentors are original fictional characters (Tempest, Deep Current, Still Water, Bedrock, Clear Mirror), built on playing-style archetypes rather than real people. No real names or transliterations, no national flags, no identifying biography; system instructions describe a teaching register rather than having the model assume an identity. Previously the five mentors were named after real professional players and impersonated them in the first person, behind the paid subscription.
- **Visible disclosure**: the mentors page and the mentor selection panel state that all mentors are fictional characters (`mentors.disclaimer`).
- **Mechanical guard**: `tests/lib/coach/personas.test.ts` runs in CI and fails if a real player's name (in four scripts) appears in any persona file, if a mentor emblem is a national flag, or if system instructions contain an identity claim.
- **Historical game narrative**: the home page game showcase and the about page reference Game 4 of the 2016 human–AI match. This is kept as a factual account of a public historical event, with a non-affiliation note (`boardShowcase.affiliationNote`).
- **Game record sourcing**: copyright and sourcing of game records is a content-rights question, tracked under 内容版权 (content copyright) in `docs/zh/TECH_DEBT.md` (Chinese only).

### 4.3 Red lines

Any new content must follow these:

1. No real person, living or deceased, as an AI mentor or AI character, and no mentor id named after one.
2. References to real players are limited to factual statements and must not imply partnership, endorsement, authorization, or approval.
3. No photographs, signatures, or voices of real players.
4. Artwork for fictional mentors must be original or licensed, and must not be modeled on photographs of real people.

This section is internal compliance strategy, not legal advice; material changes should be reviewed by qualified counsel before launch.

---

## 5. Implementation Framework (Apple-Style)

To maintain brand minimalism while ensuring global compliance, `go-daily` utilizes a **Three-Pillar Architecture**:

1.  **Privacy & Security**: Consolidated data residency and AI ethics disclosures (GDPR, PIPA, PDPO).
2.  **Terms of Service**: Unified identity and contractual rules. **Japan's Tokushoho** requirements are integrated here as a simplified compliance statement.
3.  **Refund & Cancellation**: Integrated consumer protection policies (UK DMCCA, Australian ACL).

### 5.1 Japan (Tokushoho) Integration

Instead of a standalone page, statutory disclosures are merged into the **Terms of Service**. Detailed identity information is provided to regulatory bodies and users upon valid request, satisfying Stripe's verification criteria while protecting individual developer privacy.
