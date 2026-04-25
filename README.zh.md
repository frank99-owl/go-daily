# go-daily

> 每天一道围棋题 — 支持 **中 / EN / 日 / 한** 的苏格拉底式 AI 教练。

[English →](README.md) | [日本語 →](README.ja.md) | [한국어 →](README.ko.md)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06b6d4?logo=tailwindcss)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)

[Frank](https://github.com/frank99-owl) 的小项目：每天给你一道围棋题，点击急所；如果卡住，AI 会像教练一样通过提问带你理解棋形，而不是直接把答案丢给你。

### 规划与 Agent 上下文

- **[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)** — 当前阶段、完成度和易错点的统一入口。
- **[`docs/phase2-next-steps.md`](docs/phase2-next-steps.md)** — Stripe、权限层、付费墙的具体执行与验收标准。
- **[`AGENTS.md`](AGENTS.md)** — AI coding agent 的简短指引。

## 已上线能力

- **每日一题** — 按日历每天轮换一道题。
- **Canvas 棋盘** — 响应式 9x9 / 13x13 / 19x19 显示，支持 hover ghost stone 和 HiDPI 渲染。
- **4 语言 UI** — 中文 / 英文 / 日文 / 韩文，使用 URL 路由（`/zh/...`、`/en/...`、`/ja/...`、`/ko/...`）。
- **苏格拉底式教练** — 只在用户请求时回答，并以题目的标准解说为依据。
- **题库 + 复习** — 1,110+ 题、5 个难度，支持题库浏览和错题复习。
- **战绩与历史** — 连胜、正确率、单题记录；匿名使用 localStorage，登录后使用 Supabase 同步。
- **分享卡** — 生成今日棋盘 + 结果的 1080x1080 PNG。
- **登录与跨设备同步** — Supabase OAuth（Google 等）和作答历史同步。
- **订阅与付费墙** — Stripe 订阅与账单管理、跨设备数与 AI 教练额度限制、Entitlements 权限层均已实现。
- **间隔重复（SRS）** — Pro 用户可在复习模式下享受 SM-2 间隔复习调度。
- **邮件系统** — 欢迎信、付款失败提醒及每日题目推送（通过 Resend 基础设施）。

## 技术栈

|            |                                                         |
| ---------- | ------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack) + React 19           |
| Language   | TypeScript strict                                       |
| Styling    | Tailwind CSS v4 (`@theme`)                              |
| Motion     | Framer Motion 12                                        |
| Icons      | lucide-react                                            |
| LLM        | DeepSeek `deepseek-chat`（OpenAI-compatible SDK）       |
| Board      | Canvas 2D，不依赖围棋引擎                               |
| Auth + DB  | Supabase (Auth + Postgres + RLS)                        |
| Analytics  | PostHog                                                 |
| Monitoring | Sentry + Vercel Analytics + Speed Insights              |
| Emails     | Resend（欢迎信、每日推送、付款失败通知）                |
| Storage    | localStorage（匿名）/ Supabase（登录）+ IndexedDB queue |

## 项目结构

```text
app/
  [locale]/               # URL-based i18n: /zh/, /en/, /ja/, /ko/
    today/                # 每日一题
    puzzles/              # 题库列表 + [id] 详情
    result/               # 判题、解答、教练、分享卡
    review/               # 错题复习
    stats/                # 连胜 / 正确率 / 历史
    about/                # 项目介绍页（原开发者页）
  api/
    coach/route.ts        # LLM proxy
    report-error/route.ts # 客户端错误上报
    stripe/               # Checkout / Portal / Webhook
  auth/callback/route.ts  # OAuth callback
components/
  GoBoard / CoachDialogue / ShareCard / Nav / UserMenu
lib/
  supabase/ / stripe/ / syncStorage.ts / deviceRegistry.ts / boardDisplay.ts
content/
  messages/{zh,en,ja,ko}.json
  data/
supabase/
  migrations/*.sql
```

## 本地开发

```bash
cp .env.example .env.local
# 打开 .env.local，填入需要的 key；不要提交密钥文件。

npm install
npm run dev
```

打开 `http://localhost:3000`。middleware 会把 `/` 重定向到协商出的 locale，例如 `/en`。

## 环境变量

| Name                            | Required | Default                    | 说明                                     |
| ------------------------------- | -------- | -------------------------- | ---------------------------------------- |
| `DEEPSEEK_API_KEY`              | yes      | —                          | AI 教练依赖的 DeepSeek API key           |
| `NEXT_PUBLIC_SITE_URL`          | no       | `https://go-daily.app`     | canonical URL、sitemap、robots           |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes\*    | —                          | Supabase project URL                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes\*    | —                          | Supabase publishable key（浏览器安全）   |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes\*    | —                          | Supabase server-only secret key          |
| `NEXT_PUBLIC_POSTHOG_KEY`       | no       | —                          | PostHog write-only key                   |
| `NEXT_PUBLIC_POSTHOG_HOST`      | no       | `https://us.i.posthog.com` | PostHog ingest host                      |
| `NEXT_PUBLIC_SENTRY_DSN`        | no       | —                          | Sentry DSN                               |
| `RATE_LIMIT_WINDOW_MS`          | no       | `60000`                    | 限流窗口                                 |
| `RATE_LIMIT_MAX`                | no       | `10`                       | 每窗口每 IP 最大请求数                   |
| `UPSTASH_REDIS_REST_URL`        | no       | —                          | Upstash Redis URL                        |
| `UPSTASH_REDIS_REST_TOKEN`      | no       | —                          | Upstash Redis token                      |
| `COACH_MODEL`                   | no       | `deepseek-chat`            | AI 教练模型名                            |
| `STRIPE_SECRET_KEY`             | no       | —                          | Stripe server-only secret key（Phase 2） |
| `STRIPE_WEBHOOK_SECRET`         | no       | —                          | Stripe webhook signing secret（Phase 2） |
| `STRIPE_PRO_MONTHLY_PRICE_ID`   | no       | —                          | Stripe Pro 月付 Price ID（Phase 2）      |
| `STRIPE_PRO_YEARLY_PRICE_ID`    | no       | —                          | Stripe Pro 年付 Price ID（Phase 2）      |
| `STRIPE_TRIAL_DAYS`             | no       | `7`                        | Stripe 试用天数（Phase 2）               |

\*Supabase 变量用于登录和云同步。缺失时应用仍可匿名使用，但没有跨设备同步。

`.env*` 默认已 gitignore；只提交 `.env.example`。

## 测试

```bash
npm run format:check
npm run lint
npm run test          # 544 tests across 68 files (Vitest)
npm run build
```

## 部署

生产域名：**go-daily.app**（Cloudflare DNS -> Vercel）。

把 GitHub 仓库导入 Vercel，配置必要环境变量后，推送到 `main` 会自动部署。详细步骤见 [`docs/deployment.md`](docs/deployment.md)。

## 已知限制

- **LLM 是教练，不是判题器。** 它基于标准解说回答，不覆盖题目外变化。
- **没有完整提子 / 打劫逻辑。** 当前题目选择以单点急所为主。
- **每日题按本地日期切换。** 跨时区可能看到同一题或跳过一天。

---

(C) 2026 Frank.
