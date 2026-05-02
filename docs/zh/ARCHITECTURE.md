# 技术架构与核心模块 (ARCHITECTURE)

本文件描述了 go-daily 的内部结构，反映了 `lib/` 目录的”九域分域”重构以及集中式中间件逻辑。

## 1. 全局请求生命周期 (`proxy.ts`)

所有用户侧请求都会经过 `proxy.ts` 中间件（按 Next.js 15 约定导出 `middleware`）。它在单次传递中处理四个关键任务：

1.  **Manifest 特殊处理**：拦截 PWA Manifest 请求并返回对应的版本。
2.  **豁免路径放行**：允许特定路径（静态资源、API Webhook 等）跳过所有中间件逻辑。
3.  **身份刷新与认证重定向 (Auth Refresh & Redirect)**：利用 `@supabase/ssr` 在每次导航时刷新 Session Cookie，确保服务端组件 (RSC) 始终持有最新的用户状态。已加前缀路径（如 `/en/account` 等）在此进行守卫——未登录用户访问 `/account` 会被重定向至 `/login?next=...`，已登录用户访问 `/login` 会被重定向至 `/account`。
4.  **国际化协商 (Locale Negotiation)**：对于未加前缀的路径，处理 308 (永久) 重定向矩阵，确保所有路径都带有语言前缀 (`/{zh|en|ja|ko}/...`)。

## 2. 核心领域模块 (`lib/`)

### `lib/env.ts` (环境变量校验)

集中式 Zod 环境变量校验器。每个领域（Coach、Stripe、Supabase、Reveal）都有独立的 Schema 和惰性单例访问器（`getCoachEnv()`、`getStripeEnv()` 等）。缺失的变量会在首次使用时抛出清晰的启动级错误，而非在路由深处产生静默 500。浏览器端 Supabase 文件（`client.ts`、`middleware.ts`）保留各自的 inline 校验，因为 `lib/env.ts` 仅限服务端使用。

### `lib/auth/` & `lib/supabase/`

- **双客户端策略**：针对浏览器环境使用 `client.ts`，针对 App Router 的异步服务端组件使用 `server.ts`。
- **特权服务层**：`service.ts` 使用 `service_role` 密钥绕过 RLS（行级安全），用于 Stripe Webhook 或 Cron 邮件等后台任务。

### `lib/storage/` (持久化引擎)

系统采用三态同步模型：

1.  **`anon`（仅 LocalStorage）**：非登录用户的首要存储，不发起任何网络请求。
2.  **`logged-in-online`（LocalStorage + IndexedDB 队列 + Supabase）**：已登录且有网络连接的用户。写入操作首先存入 LocalStorage 以获得即时反馈，同时入队 IndexedDB 作为持久缓冲，并通过 `syncStorage.ts` 立即批量刷新至 Supabase。
3.  **`logged-in-offline`（LocalStorage + IndexedDB 队列）**：已登录但失去网络连接的用户。写入操作仍存入 LocalStorage 和 IndexedDB，但 Supabase 刷新会被推迟。重试机制会在 `online` 事件触发或下次页面加载时发起同步。

### `lib/coach/` (AI 智能)

- **提示词工程**：集中在 `coachPrompt.ts`，确保不同题目间的“苏格拉底式教学”风格一致。
- **预算控制**：`coachQuota.ts` 在应用层（DeepSeek 计费上游）执行硬性的月度 Token 限制，防止意外的成本激增。

### `lib/i18n/` (全球化呈现)

- **路径优先**：我们倾向于使用 URL 参数而非 Cookie 来存储语言状态，确保搜索引擎可以独立抓取 4,800+ 个本地化页面。
- **零飘移校验**：`scripts/validateMessages.ts` 确保 `zh`, `en`, `ja`, `ko` 之间的翻译 Key 在构建时永远保持对齐。

### `lib/board/` (棋盘逻辑)

- **核心引擎**：落子、规则判定（气、提子、打劫）以及棋盘显示，分布在 6 个源文件中。
- **SGF 解析**：支持完整的 SGF（Smart Game Format）导入/导出，用于棋谱记录和题目定义。

### `lib/puzzle/` (题目引擎)

- **SRS 调度**：间隔重复算法驱动每日复习队列，8 个源文件涵盖题集、每日选题、复习流程和揭示令牌 (Reveal Token)。
- **权益管理**：跟踪题目访问权限和连胜状态，与用户的订阅层级挂钩。

### `lib/stripe/` (支付)

- **服务端 SDK 封装**：单一 `server.ts` 文件，封装 Stripe Node SDK，用于服务端结账、订阅管理和 Webhook 验证。

### `lib/posthog/` (数据分析)

- **服务端追踪**：从服务端进行 PostHog 事件追踪，使用类型化的事件定义确保分析一致性。
- **隐私保护**：事件在离开服务端前通过 `beforeSend` 钩子过滤，剥离敏感用户数据。

## 3. 数据流：练习记录的生命周期

1.  **触发**：用户在棋盘 (`GoBoard.tsx`) 上落子并解题。
2.  **本地写入**：`saveAttempt` 写入 LocalStorage 以获得即时反馈。
3.  **入队**：如果已登录，练习记录被推入 IndexedDB 队列。
4.  **同步**：`syncStorage` 尝试批量插入 Supabase 的 `attempts` 表。
5.  **权益更新**：同步成功后触发用户连胜 (Streak) 和 SRS 排期的重新计算。

## 4. 法律与合规域 (Legal & Compliance)

法律要求被视为**内容资产 (Content Assets)** 而非硬编码逻辑，这使得我们能够根据不同管辖区的要求进行快速调整。

- **唯一事实源**: `app/[locale]/legal/_content.ts` 集中管理所有多语言法律文本。
- **动态公示**: 系统架构支持根据用户的当前语言环境及统一支柱结构渲染组件。
- **区域集成**: 特定地区的合规要求（如日本的特商法或韩国的 PIPA）已作为统一内容块集成于三大支柱之中。

- **数据驻留策略**: 文档明确记录了数据流向新加坡 (Supabase) 和美国 (Vercel)，以满足跨境披露法律（如 PIPA/GDPR）的要求。

## 5. 安全与基础设施

- **行级安全 (RLS)**：所有 Postgres 表都强制执行 `auth.uid() = user_id` 策略，从数据库层面杜绝数据泄露。
- **隐私脱敏**：Sentry 和 PostHog 配置了 `beforeSend` 过滤器，在 AI 对话离开客户端前对用户敏感信息进行脱敏处理。
- **NFKC 规范化**：用户输入文本在处理前统一进行 NFKC 规范化，防止同形字攻击和 Unicode 规范化漏洞。
- **服务隔离**: `proxy.ts` 中间件（导出 `middleware`）确保只有经过身份验证和授权的请求才能到达核心 API 路由（如 Stripe/Coach）。
- **速率限制**: `lib/rateLimit.ts` 提供两种实现 — `MemoryRateLimiter`（开发/单实例，5 万条目上限，LRU 淘汰）和 `UpstashRateLimiter`（生产环境，基于 Redis）。根据环境变量 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN` 的有无自动选择。

---

**相关文档**:

- [API 路由参考](API_REFERENCE.md) — 完整路由目录，含请求/响应 Schema。
- [数据库 Schema](DATABASE_SCHEMA.md) — Supabase 表定义、索引与 RLS 策略。
