# go-daily Documentation Index

This directory contains the project's technical and operational documentation, organized by language and topic.

---

## Documentation Pillars

The documentation is structured around eight core pillars:

| #   | Pillar                                        | Description                                                  |
| --- | --------------------------------------------- | ------------------------------------------------------------ |
| 1   | [Concept & Strategy](en/CONCEPT.md)           | Mission, strategic phases, lean engineering philosophy       |
| 2   | [Architecture](en/ARCHITECTURE.md)            | Request lifecycle, nine-domain `lib/` layout, security model |
| 3   | [Product Specifications](en/PRODUCT_SPECS.md) | Entitlement engine, SRS algorithm, subscription management   |
| 4   | [Operations & QA](en/OPERATIONS_QA.md)        | Deployment stack, environment config, testing strategy       |
| 5   | [Project Status](en/PROJECT_STATUS.md)        | Live sprint tracker and production readiness                 |
| 6   | [API Reference](en/API_REFERENCE.md)          | Complete route catalog with request/response schemas         |
| 7   | [Database Schema](en/DATABASE_SCHEMA.md)      | Supabase table definitions, indexes, and RLS policies        |
| 8   | [Legal & Compliance](en/LEGAL_COMPLIANCE.md)  | Multi-jurisdiction legal strategy                            |

---

## Available Locales

| Document               | [English](en/) | [中文](zh/) | [日本語](ja/) | [한국어](ko/) |
| ---------------------- | :------------: | :---------: | :-----------: | :-----------: |
| Concept & Strategy     |       ✓        |      ✓      |       ✓       |       ✓       |
| Architecture           |       ✓        |      ✓      |       ✓       |       ✓       |
| Product Specifications |       ✓        |      ✓      |       ✓       |       ✓       |
| Operations & QA        |       ✓        |      ✓      |       ✓       |       ✓       |
| Project Status         |       ✓        |      ✓      |       ✓       |       ✓       |
| API Reference          |       ✓        |      ✓      |       ✓       |       ✓       |
| Database Schema        |       ✓        |      ✓      |       ✓       |       ✓       |
| Legal & Compliance     |       ✓        |      ✓      |       ✓       |       ✓       |

---

## Root-Level Documents

| File                                        | Description                                 |
| ------------------------------------------- | ------------------------------------------- |
| [README.md](../README.md)                   | Project overview (English)                  |
| [README.zh.md](../README.zh.md)             | 项目概述（中文）                            |
| [README.ja.md](../README.ja.md)             | プロジェクト概要（日本語）                  |
| [README.ko.md](../README.ko.md)             | 프로젝트 개요（한국어）                     |
| [CONTRIBUTING.md](../CONTRIBUTING.md)       | 贡献指南（中文）                            |
| [CONTRIBUTING.en.md](../CONTRIBUTING.en.md) | Contribution guide (English)                |
| [SECURITY.md](../SECURITY.md)               | Security policy and vulnerability reporting |
| [AGENTS.md](../AGENTS.md)                   | AI coding agent guide                       |
| [CHANGELOG.md](../CHANGELOG.md)             | Version history                             |

---

## Automated Reports

Generated scripts produce audit reports in `reports/`:

Files there are **regenerated outputs** (`npm run queue:content`, `npm run report:*`, etc.): treat them as inventory snapshots, not hand-maintained specs. Operational truth stays in this `docs/` tree (and pillar documents); rerun the scripts when puzzle metadata changes.

| Report                                              | Script                      | Description                       |
| --------------------------------------------------- | --------------------------- | --------------------------------- |
| [Content Queue](../reports/content-queue/latest.md) | `npm run queue:content`     | Coach-ready puzzle inventory      |
| [Duplicates](../reports/duplicates/latest.md)       | `npm run report:duplicates` | Duplicate board position analysis |
| [Quality](../reports/quality/latest.md)             | `npm run report:quality`    | Solution note quality sampling    |
| [Puzzle Audit](../reports/puzzle-audit/latest.md)   | `npm run audit:puzzles`     | Distribution and balance stats    |
