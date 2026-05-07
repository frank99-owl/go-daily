# go-daily

> 每日一题围棋死活练习 — 搭载 DeepSeek 流式 AI 教练（**中 / EN / 日 / 한**）。

**语言：** [English](README.md) · 中文（本页） · [日本語](README.ja.md) · [한국어](README.ko.md)

[![CI](https://github.com/frank99-owl/go-daily/actions/workflows/ci.yml/badge.svg)](https://github.com/frank99-owl/go-daily/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)
![Stripe](https://img.shields.io/badge/Stripe-payments-626cd9?logo=stripe)

▶️ **[在 YouTube 上观看产品演示](https://youtu.be/3uuFm-bnrSc)**

## 概览

**go-daily** 是面向习惯养成的 **每日围棋死活** 学习产品：每天一题、**中 / 英 / 日 / 韩** 全链路本地化，以及基于 **`coachPrompt.ts`** 约束的 **DeepSeek 流式 AI 教练**（以题库解析与盘面信息为准；人设语气与配额见产品与规格文档）。

工程上，产品基于 **Next.js 16（App Router）**，以 **Supabase**（认证、Postgres、RLS）与 **Stripe**（订阅）为骨架，并在 `lib/` 下以 **九大领域** 划分业务逻辑，保证规模扩张时边界仍然清晰。

## 一览

| 维度         | 说明                                                              |
| ------------ | ----------------------------------------------------------------- |
| **每日练习** | 精选题库、沉浸流程、棋盘键盘可操作                                |
| **AI 教练**  | 流式 Coach API、配额与人格、按题目准入                            |
| **全球化**   | 语言路径前缀、sitemap 与题库规模同步增长、地区化定价              |
| **可运维**   | API 与数据库文档化；CI 覆盖格式、Lint、校验、类型检查、测试与构建 |

## 文档

权威技术 / 产品文档为 `docs/` 下 **八大支柱 × 四语文**。请从 **[文档中心](docs/README.md)** 选择语言（`en` / `zh` / `ja` / `ko`）。

| 我需要…                         | 中文入口                                    |
| ------------------------------- | ------------------------------------------- |
| 愿景、阶段、战略                | [项目理念](docs/zh/CONCEPT.md)              |
| 请求链路、`lib/` 分域、安全边界 | [技术架构](docs/zh/ARCHITECTURE.md)         |
| SRS、权益、订阅与教练规则       | [产品规格](docs/zh/PRODUCT_SPECS.md)        |
| 部署、环境、测试、预检          | [运维与 QA](docs/zh/OPERATIONS_QA.md)       |
| 交付 / 就绪跟踪                 | [项目状态](docs/zh/PROJECT_STATUS.md)       |
| HTTP 路由与载荷                 | [API 参考](docs/zh/API_REFERENCE.md)        |
| 表、索引、RLS                   | [数据库 Schema](docs/zh/DATABASE_SCHEMA.md) |
| 合规策略                        | [法律与合规](docs/zh/LEGAL_COMPLIANCE.md)   |

**另见：** [CHANGELOG](CHANGELOG.md) · [安全策略](SECURITY.md) · [贡献指南（英文默认）](CONTRIBUTING.md) / [中文版](CONTRIBUTING.zh.md) · [LICENSE](LICENSE)

## 快速上手

### 环境要求

- Node.js **22.5+**（见 `package.json` 的 `engines`）
- DeepSeek 或兼容 OpenAI 的 API Key（教练）
- Supabase 项目（可选；匿名模式可不配置）

### 安装与运行

```bash
git clone https://github.com/frank99-owl/go-daily.git
cd go-daily
cp .env.example .env.local
npm install
npm run dev
```

访问 `http://localhost:3000`，中间件会协商并重定向到 `/{zh|en|ja|ko}/...`。

## 技术栈

| 层级       | 选型                                                    |
| ---------- | ------------------------------------------------------- |
| 前端       | Next.js 16、React 19、Tailwind CSS v4、Framer Motion    |
| 数据与认证 | Supabase（Postgres + RLS）、分层客户端存储              |
| 支付       | Stripe（动态定价、试用）                                |
| AI         | DeepSeek Chat API（`coachPrompt.ts`：流式、人设、配额） |
| 边缘限流   | Upstash Redis（生产环境标准部署下需要）                 |
| 邮件       | Resend（在配置可用时使用）                              |

## 贡献与安全

在政策允许的范围内欢迎 Issue 与 PR。细节见 **[CONTRIBUTING.md](CONTRIBUTING.md)**（九域约定、i18n 校验、CI）。**安全披露**请遵循 **[SECURITY.md](SECURITY.md)**，勿对未修复漏洞开公开 Issue。

---

Copyright © 2026 Frank. 保留所有权利。参见 [LICENSE](LICENSE)。
