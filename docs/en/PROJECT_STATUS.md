# go-daily Project Status & Roadmap

**Generated At**: April 30, 2026
**Repository HEAD**: `ae8ecce`
**Status**: v2.6 Coach Expansion Edition

---

## 1. Phase 2 Completion Summary

All subscription-related logic (Stripe, Entitlements, Multi-device Sync) has been implemented and audited. The legal framework now supports 10+ global jurisdictions to pass Stripe verification.

## 2. Architectural Audit

- **Consistency**: All logic in `lib/` (SRS, Auth, Coach) is now 100% aligned with the documentation.
- **Paths**: Implemented a global **Footer** with multi-jurisdiction legal routes, resolving the 404 gap.
- **UI Logic**: Fixed layout overlap issues on `Today` and `Random` pages by optimizing the vertical breathing room (`pb-24`).

## 3. Recent Progress (v2.6)

- **Coach Expansion**: Removed curated distinction; expanded coach-ready puzzles to 1,269 (`ae8ecce`).
- **Core Flow Hardening**: Fixed high-risk vulnerabilities and added core flow tests (`690a9a3`).
- **Auth Refactor**: Integrated Korea PIPA consent into sequential login flow (`6f135b7`).
- **Test Suite**: 57 test files, ~366 test cases covering logic, UI, and API layers.

## 4. Immediate Next Steps (Phase 3)

1. **Production Smoke Checks**: Verify DNS/SMTP and Stripe Live Webhooks.
2. **Full Coach Rollout**: Continue bulk-approving remaining puzzles for Pro usage.
3. **Content Depth**: Expand beyond 19×19 life-and-death into 9×9/13×13 and opening/endgame categories.

---

For strategic depth, see [docs/en/CONCEPT.md](docs/en/CONCEPT.md).
