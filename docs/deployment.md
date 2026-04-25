# go-daily 生产部署手册

> English version: [deployment.en.md](./deployment.en.md)

---

## 目录

1. [适用范围](#1-适用范围)
2. [部署前准备](#2-部署前准备)
3. [环境变量清单](#3-环境变量清单)
4. [Vercel 部署步骤](#4-vercel-部署步骤)
5. [Supabase 配置](#5-supabase-配置)
6. [持久化限流配置（可选）](#6-持久化限流配置可选)
7. [部署后验证](#7-部署后验证)
8. [常见问题排查](#8-常见问题排查)
9. [回滚方案](#9-回滚方案)

---

## 1. 适用范围

本文档面向**将 go-daily 部署到 Vercel 生产环境**的操作人员。按本文档执行后，站点应达到"低流量公开可用"状态。

**当前代码基线的生产就绪状态**（截至 2026-04-24）：

| 能力                         | 状态      | 说明                                                           |
| ---------------------------- | --------- | -------------------------------------------------------------- |
| 核心功能（做题、题库、统计） | ✅ 可用   | 无需额外配置即可工作                                           |
| AI 教练                      | ✅ 可用   | 需配置 `DEEPSEEK_API_KEY`                                      |
| 限流                         | ✅ 可用   | 默认 `MemoryRateLimiter`；配置 Upstash 后持久化                |
| 用户认证 + 跨设备同步        | ✅ 可用   | 需配置 Supabase 环境变量                                       |
| 分析                         | ✅ 已接入 | PostHog + Vercel Analytics + Speed Insights                    |
| 错误监控                     | ✅ 已接入 | Sentry                                                         |
| Stripe 订阅后端              | ✅ 已接入 | Checkout / Portal / Webhook 及 /pricing 订阅 UI 均已全链路跑通 |

---

## 2. 部署前准备

### 2.1 前置条件

| 项               | 要求                                      |
| ---------------- | ----------------------------------------- |
| 代码仓库         | GitHub 仓库已推送                         |
| Vercel 账号      | 已有 Vercel 账号                          |
| DeepSeek API Key | 已有有效密钥                              |
| Supabase 项目    | 已创建 Supabase 项目（Auth + Database）   |
| 域名             | 已配置 DNS 指向 Vercel（如 go-daily.app） |

### 2.2 本地预检（在提交部署前执行）

```bash
npm run preflight:prod      # 环境变量、Supabase schema、Stripe price 预检
npm run format:check        # Prettier 格式检查通过
npm run lint                # ESLint 无报错
npm run test                # 全部测试通过（236/46）
npm run validate:puzzles    # 题目数据校验通过
npm run build               # 生产构建成功
```

> 任何一步失败都应在本地修复后再部署。
> 详细生产验收步骤见 [production-preflight.md](./production-preflight.md)。

---

## 3. 环境变量清单

**以下变量在 Vercel 项目 Settings → Environment Variables 中配置，三个环境（Production / Preview / Development）全部勾选。**

### 核心变量

| 变量名                 | 必填 | 默认值                 | 说明                                          |
| ---------------------- | ---- | ---------------------- | --------------------------------------------- |
| `DEEPSEEK_API_KEY`     | ✅   | —                      | DeepSeek API 密钥，AI 教练功能依赖            |
| `NEXT_PUBLIC_SITE_URL` | —    | `https://go-daily.app` | 生产域名，用于 canonical URL、robots、sitemap |

### Supabase 变量

| 变量名                          | 必填 | 默认值 | 说明                                               |
| ------------------------------- | ---- | ------ | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | ✅   | —      | Supabase 项目 URL                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅   | —      | Supabase publishable key（RLS 保护，安全在浏览器） |
| `SUPABASE_SERVICE_ROLE_KEY`     | ✅   | —      | Supabase secret key（server-only，bypasses RLS）   |

> Supabase 变量缺失时，应用会以匿名模式运行（localStorage 存储，无跨设备同步）。

### AI 教练变量

| 变量名        | 必填 | 默认值          | 说明                    |
| ------------- | ---- | --------------- | ----------------------- |
| `COACH_MODEL` | —    | `deepseek-chat` | AI 教练使用的模型标识符 |

### 分析 & 监控变量

| 变量名                     | 必填 | 默认值                     | 说明                               |
| -------------------------- | ---- | -------------------------- | ---------------------------------- |
| `NEXT_PUBLIC_POSTHOG_KEY`  | —    | —                          | PostHog 项目 API key（write-only） |
| `NEXT_PUBLIC_POSTHOG_HOST` | —    | `https://us.i.posthog.com` | PostHog ingest host                |
| `NEXT_PUBLIC_SENTRY_DSN`   | —    | —                          | Sentry DSN（write-only）           |

### 限流变量

| 变量名                     | 必填 | 默认值  | 说明                                         |
| -------------------------- | ---- | ------- | -------------------------------------------- |
| `RATE_LIMIT_WINDOW_MS`     | —    | `60000` | 限流窗口（毫秒）                             |
| `RATE_LIMIT_MAX`           | —    | `10`    | 每窗口每 IP 最大请求数                       |
| `UPSTASH_REDIS_REST_URL`   | —    | —       | Upstash Redis REST URL，配置后启用持久化限流 |
| `UPSTASH_REDIS_REST_TOKEN` | —    | —       | Upstash Redis REST Token                     |

> 当 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN` 同时配置时，限流自动切换为 `UpstashRateLimiter`，实现跨实例共享的持久化限流。否则使用 `MemoryRateLimiter`（进程内存，单实例有效）。

### Stripe 变量（Phase 2，可选）

| 变量名                        | 必填 | 默认值 | 说明                               |
| ----------------------------- | ---- | ------ | ---------------------------------- |
| `STRIPE_SECRET_KEY`           | —    | —      | Stripe 服务器端密钥（server-only） |
| `STRIPE_WEBHOOK_SECRET`       | —    | —      | Stripe Webhook 签名密钥            |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | —    | —      | Pro 月付价格 ID                    |
| `STRIPE_PRO_YEARLY_PRICE_ID`  | —    | —      | Pro 年付价格 ID                    |
| `STRIPE_TRIAL_DAYS`           | —    | `7`    | 试用期天数                         |

> Stripe 变量仅在 Phase 2 订阅功能启用时需要。未配置时，应用以纯匿名/登录模式运行，无付费功能。

> **Webhook 事件订阅**：Stripe Dashboard 的 webhook 端点需勾选 `checkout.session.completed`、`customer.subscription.created/updated/deleted`、**`invoice.paid`**（写入 `subscriptions.first_paid_at` + `coach_anchor_day`）以及 **`invoice.payment_failed`**（回滚 `past_due` + 发换卡邮件）。缺一项会导致订阅状态或 Pro 月额度锚点无法正确同步。

### Resend / 邮件变量（Phase 2，可选）

| 变量名                  | 必填 | 默认值                          | 说明                                                  |
| ----------------------- | ---- | ------------------------------- | ----------------------------------------------------- |
| `RESEND_API_KEY`        | —    | —                               | Resend server-only API key                            |
| `EMAIL_FROM`            | —    | `go-daily <hello@go-daily.app>` | 欢迎信、每日题目、付款失败邮件的发件人                |
| `EMAIL_REPLY_TO`        | —    | —                               | 可选 reply-to 地址                                    |
| `CRON_SECRET`           | —    | —                               | `/api/cron/daily-email` 的 Bearer token；生产建议必配 |
| `EMAIL_CRON_BATCH_SIZE` | —    | `50`                            | 每次 cron 最多处理的 profile 数                       |

> 应用侧 Resend 邮件已接入；`NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=true` 仍需等 Resend 域名 DNS、Supabase Auth SMTP 和 magic-link 真实投递都验证通过后再打开。

### Auth UI 开关

| 变量名                           | 必填 | 默认值  | 说明                                                                                        |
| -------------------------------- | ---- | ------- | ------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN` | —    | `false` | Email magic-link UI 开关。后端已接入，但需等 Resend SMTP 落地后再翻成 `true` 对真实用户开放 |

---

## 4. Vercel 部署步骤

### Step 1：导入项目

1. 登录 Vercel Dashboard
2. 点击 "Add New Project"
3. 选择 go-daily 的 GitHub 仓库
4. Framework Preset 选择 **Next.js**

### Step 2：配置环境变量

在 "Configure Project" 页面：

1. 添加 `DEEPSEEK_API_KEY`，值为你的 DeepSeek API 密钥
2. 添加 `NEXT_PUBLIC_SITE_URL`，值为你的生产域名（如 `https://go-daily.app`）
3. 添加 Supabase 相关变量（`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`）
4. 可选：添加 `COACH_MODEL`（默认 `deepseek-chat`）
5. 可选：添加 PostHog 和 Sentry 变量（`NEXT_PUBLIC_POSTHOG_KEY`、`NEXT_PUBLIC_SENTRY_DSN`）
6. 可选：添加 `RATE_LIMIT_WINDOW_MS` 和 `RATE_LIMIT_MAX`
7. 可选：添加 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`（如需持久化限流）
8. Phase 2 可选：添加 Stripe 相关变量（`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_PRO_*_PRICE_ID`、`STRIPE_TRIAL_DAYS`）；Stripe Dashboard webhook 端点务必勾选 `invoice.paid` 与 `invoice.payment_failed`
9. Phase 2 可选：添加 Resend / cron 变量（`RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_REPLY_TO`、`CRON_SECRET`、`EMAIL_CRON_BATCH_SIZE`），并在 Resend Dashboard 完成发信域名 DNS 验证
10. 可选：设置 `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=true`（仅在 Resend/Supabase SMTP 已经落地、email magic link 可正常送达时启用）
11. 确保三个环境（Production / Preview / Development）全部勾选

### Step 3：部署

点击 "Deploy"。Vercel 会自动执行 `npm run build`（包含 `prebuild` 钩子里的 `validate:puzzles`）。

构建成功后会获得一个 Production URL（如 `https://go-daily.app`）。

### Step 4：配置自定义域名

生产域名：**go-daily.app**

1. Vercel Dashboard → 项目 → Settings → Domains
2. 添加 `go-daily.app`
3. 在 Cloudflare DNS 中配置：
   - Type: CNAME
   - Name: `@`
   - Target: `cname.vercel-dns.com`
4. 等待 SSL 证书自动签发（通常 1-2 分钟）

---

## 5. Supabase 配置

### 5.1 创建项目

1. 注册/登录 [Supabase](https://supabase.com/)
2. 创建新项目
3. 记录 Project URL 和 API Keys（Settings → API）

### 5.2 执行数据库迁移

在 Supabase Dashboard → SQL Editor 中按文件名顺序执行 `supabase/migrations/*.sql`：

```bash
# 或使用 Supabase CLI
supabase db push
```

该迁移创建以下表：

- `profiles` — 用户资料（locale、timezone、kyu_rank 等）
- `attempts` — 作答记录（append-only，有 RLS）
- `coach_usage` — 每日教练使用计数
- `subscriptions` — Stripe 订阅状态（webhook 写入）
- `srs_cards` — SRS 复习调度（Phase 2）
- `stripe_events` — Webhook 幂等性账本
- `user_devices` — 设备注册（免费版单设备限制）

并启用 RLS 策略和 `handle_new_user` 触发器。

### 5.3 配置 OAuth 提供商

Supabase Dashboard → Authentication → Providers：

- 启用 Google OAuth
- 配置 Client ID 和 Client Secret
- 确保 redirect URL 包含 `https://go-daily.app/auth/callback`

---

## 6. 持久化限流配置（可选）

**默认行为**：未配置 Upstash 时，使用 `MemoryRateLimiter`，限流状态保存在进程内存中。这对于单实例或低流量场景已足够。

**何时需要 Upstash**：Vercel Serverless 多实例部署时，每个实例有独立的计数器。如果你需要严格的跨实例限流，配置 Upstash Redis。

### 6.1 准备 Redis 实例

1. 注册 [Upstash](https://upstash.com/) 账号
2. 创建一个 Redis 数据库
3. 记录 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`

### 6.2 配置环境变量

在 Vercel 中添加：

```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

无需修改代码——`lib/rateLimit.ts` 中的 `createRateLimiter()` 工厂函数会自动检测这些环境变量并切换实现。

> **故障降级**：若 Redis 连接异常（网络超时、实例不可用），`app/api/coach/route.ts` 会捕获限流错误并在日志中输出 `[RateLimitError]`，随后继续处理请求（fail-open）。这意味着 Redis 故障时 AI 教练服务仍可用，但限流暂时失效。

### 6.3 验证

快速发送 11 次 `/api/coach` 请求，确认第 11 次返回 429（无论打到哪个实例）。

---

## 7. 部署后验证

### 7.1 基础功能检查清单

| 检查项       | 操作                           | 期望结果                              |
| ------------ | ------------------------------ | ------------------------------------- |
| 根路径重定向 | 打开 `/`                       | 308 重定向到 `/{locale}/`             |
| 首页加载     | 打开 `/en/`                    | 页面正常渲染，无 500/404              |
| 每日一题     | 打开 `/en/today`               | 棋盘渲染，可落子                      |
| 判题         | 在 `/en/today` 点击正确/错误点 | 正确跳转 `/en/result`，显示对/错横幅  |
| 题库         | 打开 `/en/puzzles`             | 题库列表加载，可筛选/搜索             |
| 统计         | 打开 `/en/stats`               | 连胜/准确率/热力图正常显示            |
| AI 教练      | 在 `/en/result` 点击教练按钮   | 可对话，回复与题目相关                |
| 语言切换     | 切换语言                       | URL 变为对应 locale，内容刷新         |
| OAuth 登录   | 点击登录按钮                   | 正常跳转 Google OAuth，回调后登录成功 |

### 7.2 Phase 2 Stripe 验证（Sandbox / 上线前）

当前代码已包含全链路 Stripe 订阅（API 端点、webhook 后端和 `/pricing` 订阅入口）；`/account` 页本轮暂不放 Portal 入口。上线前在 Stripe Sandbox 跑以下检查：

| 检查项          | 操作                                                 | 期望结果                                                     |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| Stripe Checkout | 登录后从 `/pricing` 点击购买 Pro                     | 跳转 Stripe Checkout，支付成功后回到站内成功页               |
| Stripe Webhook  | 用 Stripe 测试卡完成支付                             | `subscriptions` 表出现 `active` 记录，`stripe_events` 已处理 |
| Payment Failed  | 用 Stripe 失败卡或 CLI 触发 `invoice.payment_failed` | `subscriptions.status` 变为 `past_due`，用户收到换卡邮件     |
| Stripe Portal   | Pro 用户打开 `/pricing` 并点击管理订阅               | 跳转 Stripe Customer Portal                                  |

### 7.3 API 验证

```bash
# 测试健康状态（直接访问首页）
curl -s -o /dev/null -w "%{http_code}" https://go-daily.app/
# 期望：308 → 200

# 测试教练 API（合法请求）
curl -X POST https://go-daily.app/api/coach \
  -H "Content-Type: application/json" \
  -d '{
    "puzzleId": "cld-001",
    "locale": "zh",
    "userMove": {"x": 18, "y": 0},
    "isCorrect": true,
    "history": [{"role": "user", "content": "为什么这一步是对的？", "ts": 0}]
  }'
# 期望：200，返回 {"reply": "..."}

# 测试限流（快速发送 11 次）
for i in {1..11}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://go-daily.app/api/coach \
    -H "Content-Type: application/json" \
    -d '{"puzzleId":"test","locale":"zh","userMove":{"x":0,"y":0},"isCorrect":true,"history":[{"role":"user","content":"test","ts":0}]}'
done
# 期望：前 10 次 200 或 404，第 11 次 429
```

### 7.4 环境变量生效检查

```bash
# 检查 NEXT_PUBLIC_SITE_URL 是否生效
curl -s https://go-daily.app/ | grep -i "og:url\|canonical"
# 应看到你的生产域名，而非默认值

# 检查 CSP headers
curl -sI https://go-daily.app/ | grep -i "content-security-policy"
# 应看到完整的 CSP 指令
```

---

## 8. 常见问题排查

### Q1: 构建失败

**现象**：Vercel 构建日志显示 `validate:puzzles` 报错。

**排查**：

```bash
# 本地复现
npm run validate:puzzles
```

常见原因：

- `content/data/classicalPuzzles.json` 损坏
- 手动编辑 curatedPuzzles.ts 后格式错误
- 多语言字段缺失

### Q2: AI 教练返回 500

**现象**：`/result` 页点击教练后显示「服务暂不可用」。

**排查**：

1. Vercel Dashboard → 项目 → Settings → Environment Variables
2. 确认 `DEEPSEEK_API_KEY` 已配置且三个环境全部勾选
3. 查看 Vercel Runtime Logs（Functions 标签）确认错误详情

### Q3: Supabase 登录失败

**现象**：点击 OAuth 登录后报错或无限重定向。

**排查**：

1. 确认 Supabase 环境变量已正确配置
2. 在 Supabase Dashboard → Authentication → URL Configuration 中检查 Site URL 和 Redirect URLs
3. 确认 OAuth 提供商（Google）的 Client ID/Secret 正确
4. 查看 `/auth/callback` 路由的日志

### Q4: 限流不生效 / 时紧时松

**现象**：快速发送请求，有时被 429 有时通过。

**原因**：未配置 Upstash 时，`MemoryRateLimiter` 不跨实例共享。Vercel Serverless 的负载均衡会把请求分发到不同实例，每个实例有独立的计数器。

**解决**：如需严格限流，按第 6 节配置 Upstash Redis。

### Q5: 页面 404

**现象**：除首页外所有页面 404。

**原因**：Vercel 的 Framework Preset 可能没选对，或者 `next.config.ts` 配置有误。

**解决**：

1. 确认 Framework Preset 为 Next.js
2. 检查 Build Command 是否为 `npm run build`
3. Output Directory 应为 `.next`

### Q6: 自定义域名 HTTPS 不生效

**现象**：域名已绑定但浏览器显示不安全。

**解决**：

1. 确认 DNS 记录已指向 Vercel（CNAME 或 A 记录）
2. Vercel Dashboard → Domains 中查看状态
3. SSL 证书自动签发，通常 1-2 分钟内完成

---

## 9. 回滚方案

### 9.1 代码回滚（部署了有问题的代码）

**方式一：Vercel Dashboard 回滚**

1. Vercel Dashboard → 项目 → Deployments
2. 找到上一个正常版本的 Deployment
3. 点击 "..." → "Promote to Production"

**方式二：Git 回滚 + 重新部署**

```bash
git revert HEAD  # 或 git reset --hard <last-good-commit>
git push origin main
# Vercel 会自动重新部署
```

### 9.2 环境变量回滚

如果问题由环境变量变更引起：

1. Vercel Dashboard → Settings → Environment Variables
2. 修改/删除有问题的变量
3. 触发重新部署（可以 push 一个空 commit）

```bash
git commit --allow-empty -m "trigger: redeploy"
git push origin main
```

### 9.3 紧急下线

如需立即停止服务：

1. Vercel Dashboard → 项目 → Settings → General
2. 点击 "Pause" 暂停项目
3. 或删除自定义域名的 DNS 记录

---

_相关文档：[README.md](../README.md) · [architecture.md](./architecture.md) · [ai-coach.md](./ai-coach.md)_
