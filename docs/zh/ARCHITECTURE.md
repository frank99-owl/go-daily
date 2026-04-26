# 技术架构与核心模块 (ARCHITECTURE)

本文件描述了 go-daily 的内部结构，反映了 `lib/` 目录的“六域分域”重构以及集中式中间件逻辑。

## 1. 全局请求生命周期 (`proxy.ts`)
所有用户侧请求都会经过 `proxy.ts` 中间件。它在单次传递中处理三个关键任务：
1.  **身份刷新 (Auth Refresh)**：利用 `@supabase/ssr` 在每次导航时刷新 Session Cookie，确保服务端组件 (RSC) 始终持有最新的用户信息。
2.  **国际化协商 (Locale Negotiation)**：处理 308 (永久) 重定向矩阵，确保所有路径都带有语言前缀 (`/{zh|en|ja|ko}/...`)。
3.  **路由守卫 (Route Guarding)**：拦截受保护路径（如 `/account`, `/pricing/checkout`），并将未登录用户引导至登录页。

## 2. 核心领域模块 (`lib/`)

### `lib/auth/` & `lib/supabase/`
*   **双客户端策略**：针对浏览器环境使用 `client.ts`，针对 App Router 的异步服务端组件使用 `server.ts`。
*   **特权服务层**：`service.ts` 使用 `service_role` 密钥绕过 RLS（行级安全），用于 Stripe Webhook 或 Cron 邮件等后台任务。

### `lib/storage/` (持久化引擎)
系统采用分层同步模型：
1.  **匿名层 (LocalStorage)**：非登录用户的首要存储。
2.  **队列层 (IndexedDB)**：待处理的练习记录存入持久化的 IndexedDB 队列。即使在同步完成前关闭标签页，数据也不会丢失。
3.  **云端层 (Supabase)**：数据的最终事实来源。`syncStorage.ts` 编排由 `online` 事件或页面加载触发的“冲刷 (Flush)”逻辑。

### `lib/coach/` (AI 智能)
*   **提示词工程**：集中在 `coachPrompt.ts`，确保不同题目间的“苏格拉底式教学”风格一致。
*   **预算控制**：`coachBudget.ts` 在应用层（DeepSeek 计费上游）执行硬性的月度 Token 限制，防止意外的成本激增。

### `lib/i18n/` (全球化呈现)
*   **路径优先**：我们倾向于使用 URL 参数而非 Cookie 来存储语言状态，确保搜索引擎可以独立抓取 4,800+ 个本地化页面。
*   **零飘移校验**：`validateMessages.ts` 确保 `zh`, `en`, `ja`, `ko` 之间的翻译 Key 在构建时永远保持对齐。

## 3. 数据流：练习记录的生命周期
1.  **触发**：用户在棋盘 (`GoBoard.tsx`) 上落子并解题。
2.  **本地写入**：`saveAttempt` 写入 LocalStorage 以获得即时反馈。
3.  **入队**：如果已登录，练习记录被推入 IndexedDB 队列。
4.  **同步**：`syncStorage` 尝试批量插入 Supabase 的 `attempts` 表。
5.  **权益更新**：同步成功后触发用户连胜 (Streak) 和 SRS 排期的重新计算。

## 4. 安全与合规
*   **行级安全 (RLS)**：所有 Postgres 表都强制执行 `auth.uid() = user_id` 策略，从数据库层面杜绝数据泄露。
*   **隐私脱敏**：Sentry 和 PostHog 配置了 `beforeSend` 过滤器，在 AI 对话离开客户端前对用户敏感信息进行脱敏处理。
