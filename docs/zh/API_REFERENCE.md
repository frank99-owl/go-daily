# API 路由参考手册

本文档按领域分类，列举 go-daily 中所有 API 路由。所有路由均为 `app/api/` 下的 Next.js Route Handler。

---

## 1. 教练 API (`app/api/coach/route.ts`)

基于 DeepSeek 的 AI 教练对话系统。

### `POST /api/coach`

发送用户消息并获取 AI 教练回复。

**认证**: 可选。已登录用户使用 Supabase 会话 Cookie；访客须发送请求头 `x-go-daily-guest-device-id`（配额更低）。

**请求体** (JSON，由 `CoachRequestSchema` 校验)：

**注意**：历史消息受总字符预算限制（6,000 字符，从最新消息开始截断），此外每条消息还单独截断至 2,000 字符。

```typescript
{
  puzzleId: string;      // 最少 1 字符
  locale: "zh" | "en" | "ja" | "ko";
  userMove: { x: number; y: number };
  isCorrect: boolean;
  personaId?: string;    // 默认吴清源
  history: Array<{       // 最少 1 条
    role: "user" | "assistant";
    content: string;
    ts: number;
  }>;
}
```

**成功响应** (`200`):

```json
{ "reply": "string", "usage": { "plan", "dailyRemaining", "monthlyRemaining", ... } }
```

**错误响应**:
| 状态码 | 错误码 | 触发条件 |
|--------|--------|----------|
| 400 | — | Content-Type 错误、请求体过大、JSON 解析失败或 Schema 校验失败 |
| 401 | `login_required` | 既无会话也无 `x-go-daily-guest-device-id` 请求头 |
| 403 | `device_limit` | 免费用户超出 1 台设备限制 |
| 403 | — | 题目未获准教练功能 |
| 429 | `daily_limit_reached` | 每日配额耗尽 |
| 429 | `monthly_limit_reached` | 每月配额耗尽 |
| 429 | — | IP 限流 |
| 502 | — | 上游 LLM 错误 |
| 504 | — | 上游超时 (>25s) |

**安全防护**:

- Content-Length 限制（请求体 8 KB，头部 10 KB）
- IP 限流（Upstash Redis 或内存回退）
- 所有用户消息的提示词注入检测 (`guardUserMessage`)
- 输入清洗 (`sanitizeInput`)
- 教练准入检查（题目必须在 `coachEligibleIds.json` 中）
- 使用配额执行（每日 + 每月用户级计数器）
- 访客用量写入 Supabase `guest_coach_usage`（`service_role`）；IP 维度限制仍在内存中（`guestCoachUsage.ts`）

### `GET /api/coach`

获取当前调用方的教练用量摘要。

**认证**: 可选。已登录用户使用会话 Cookie；访客可携带 `x-go-daily-guest-device-id` 查询访客配额。两者皆无时返回 `401`。

**响应** (`200`):

```json
{ "usage": { "plan", "dailyLimit", "monthlyLimit", "dailyUsed", "monthlyUsed", ... } }
```

---

## 2. 题目 API

### `POST /api/puzzle/attempt` (`app/api/puzzle/attempt/route.ts`)

校验用户的落子是否正确。

**认证**: 不需要（公开端点）。

**请求体** (JSON，由 `PuzzleAttemptRequestSchema` 校验):

```typescript
{
  puzzleId: string; // 1–120 字符
  userMove: {
    x: number;
    y: number;
  }
}
```

**响应** (`200`):

```json
{
  "puzzleId": "string",
  "userMove": { "x": 0, "y": 0 },
  "correct": true,
  "revealToken": "string" // 短时效令牌，用于查看正解
}
```

**防护**: 同源检查、IP + 按题目限流、落子边界校验。

### `POST /api/puzzle/reveal` (`app/api/puzzle/reveal/route.ts`)

使用有效的揭示令牌查看完整正解。

**认证**: 不需要（令牌门控）。

**请求体**:

```typescript
{
  puzzleId: string;
  revealToken: string; // 来自 /api/puzzle/attempt 的签名令牌
}
```

**响应** (`200`): 完整题目解答，含 `correct`、`solutionNote` 和 `solutionSequence`。

### `POST /api/puzzle/random` (`app/api/puzzle/random/route.ts`)

获取随机题目（用于"随机"页面）。

**认证**: 不需要。

**响应** (`200`):

```json
{ "puzzleId": "string" }
```

返回随机选中的题目 ID，客户端随后单独获取完整题目数据。

---

## 3. Stripe API (`app/api/stripe/`)

### `POST /api/stripe/checkout` (`checkout/route.ts`)

创建 Pro 订阅的 Stripe Checkout 会话。

**认证**: 需要。

**请求体**:

```typescript
{
  interval: "monthly" | "yearly";
}
```

**响应** (`200`): `{ "url": "https://checkout.stripe.com/..." }`

### `POST /api/stripe/portal` (`portal/route.ts`)

创建 Stripe 客户门户会话，用于管理订阅。

**认证**: 需要。

**响应** (`200`): `{ "url": "https://billing.stripe.com/..." }`

### `POST /api/stripe/webhook` (`webhook/route.ts`)

Stripe Webhook 接收端。处理 `checkout.session.completed`、`customer.subscription.updated`、`customer.subscription.deleted` 和 `invoice.payment_failed` 事件。

**认证**: Stripe 签名验证（无用户会话）。

**行为**:

- 通过 `stripe_events` 表实现幂等性（处理前先认领事件）。
- 将订阅状态写入 `subscriptions` 表。
- 在 `invoice.payment_failed` 时发送付款失败邮件。
- `Content-Length > 1 MB` 的请求在读取正文前即被拒绝，返回 HTTP 413。

---

## 4. 认证 API

### `GET /auth/callback` (`app/auth/callback/route.ts`)

Supabase OAuth/魔法链接回调。交换认证码获取会话，并重定向至对应语言路径。

### `POST /api/account/delete` (`app/api/account/delete/route.ts`)

删除已认证用户的账号及所有关联数据。

**认证**: 需要。

**响应** (`200`): `{ "ok": true }`

---

## 5. 邮件 API

### `GET /email/unsubscribe` (`app/email/unsubscribe/route.ts`)

使用一次性令牌退订每日题目邮件。

**查询参数**: `token`（来自 `profiles.email_unsubscribe_token`）。

### `GET /api/cron/daily-email` (`app/api/cron/daily-email/route.ts`)

Vercel Cron 处理器，发送每日题目提醒邮件。

**认证**: Cron 密钥（`CRON_SECRET` 环境变量）。

---

## 6. 可观测性 API

### `POST /api/report-error` (`app/api/report-error/route.ts`)

客户端错误上报端点。接收来自浏览器 `error`/`unhandledrejection` 处理器的结构化错误报告。

**认证**: 不需要（公开，限流）。

**请求体** (由 `ClientErrorReportSchema` 校验):

```typescript
{
  message: string;
  stack?: string;
  url: string;
  timestamp: number;
  userAgent: string;
  locale?: "zh" | "en" | "ja" | "ko";
  puzzleId?: string;
}
```

---

## 7. 健康检查 API

### `GET /api/health` (`app/api/health/route.ts`)

用于监控的轻量存活探测。

**认证**: 不需要。

**行为**: 若配置了 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_ANON_KEY`，则探测 `${SUPABASE_URL}/auth/v1/settings`（5 秒超时）。若未配置，则 `supabase` 标记为 `skipped`，仍返回 healthy。

**响应** (`200`): `{ "status": "healthy", "timestamp": ISO8601, "checks": { "supabase": "ok" | "error" | "skipped" } }`

**响应** (`503`): Supabase 探测失败时 `{ "status": "degraded", ... }`。

---

## 8. 管理 API (`app/api/admin/`)

依赖 `ADMIN_EMAILS`（逗号分隔白名单）与 `ADMIN_PIN` 的运营接口。

### `POST /api/admin/verify` (`verify/route.ts`)

在邮箱已确认为管理员后校验 PIN。

**认证**: 需要（会话；`user.email` 须在 `ADMIN_EMAILS` 中）。

**同源**: POST 须通过同源校验。

**请求体** (JSON): `{ "pin": string }` — 须等于 `ADMIN_PIN`。

**响应**: `200` `{ "ok": true }`；未登录 `401`；非管理员或 PIN 错误 `403`；未配置 `ADMIN_PIN` 时 `500`。

### `GET /api/admin/grants` (`grants/route.ts`)

列出所有手动 Pro 授予记录（`manual_grants`）。

**认证**: 会话邮箱须在 `ADMIN_EMAILS` 中。

**响应** (`200`): `{ "grants": [{ "email", "expires_at", "granted_by", "created_at" }, ...] }`

### `POST /api/admin/grants`

按邮箱 upsert 手动授予（冲突键：`email`）。

**认证**: 管理员会话。同源 POST。

**请求体**: `{ "email": string, "days": number /* 1–3650 */, "granted_by"?: string }`

**响应** (`200`): `{ "ok": true, "email", "expires_at" }`

### `DELETE /api/admin/grants`

移除一条手动授予。

**认证**: 管理员会话。同源变更请求。

**请求体**: `{ "email": string }`

**响应** (`200`): `{ "ok": true }`

---

## 9. 横切关注点

### 限流

所有写入端点使用 `createRateLimiter()`，返回以下实现之一：

- `UpstashRateLimiter`（生产环境，跨实例）：当 `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` 存在时使用。
- `MemoryRateLimiter`（开发环境，单实例）：作为回退方案。

两种限流器均强制执行最大条目数限制（`MemoryRateLimiter` 为 50,000 条），并通过淘汰过期条目防止内存无限增长。

默认值：每 60 秒窗口每键 10 次请求。

### 请求体解析

所有变更路由使用 `lib/apiHeaders.ts` 中的 `parseMutationBody()` 进行统一的 Content-Type、Content-Length、CSRF 和 JSON 解析。

### API 响应头

所有响应经过 `createApiResponse()`（来自 `lib/apiHeaders.ts`），设置标准化的安全头。

### 运行时

集成较重的处理器（Stripe、教练、cron、admin、题目写入等）设置 `export const runtime = "nodejs"` 以使用 Node API。`/api/health` 等轻量路由使用默认运行时。
