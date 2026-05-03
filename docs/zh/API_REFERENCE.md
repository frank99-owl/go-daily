# API 路由参考手册

本文档按领域分类，列举 go-daily 中所有 API 路由。所有路由均为 `app/api/` 下的 Next.js Route Handler。

---

## 1. 教练 API (`app/api/coach/route.ts`)

基于 DeepSeek 的 AI 教练对话系统。

### `POST /api/coach`

通过流式（SSE）返回助手回复片段。

**认证**：可选。已登录用户使用 Supabase 会话 Cookie；若客户端持有设备指纹，应附带 **`x-go-daily-device-id`**（免费档单设备席位逻辑见 `getCoachState`）。访客须发送 **`x-go-daily-guest-device-id`**（配额更低）。

**请求体**（JSON，`CoachRequestSchema` 校验）：

**说明**：

- 落子是否正确**不由客户端传入**。服务端调用 `judgeMove(puzzle, userMove)`，结果写入系统提示词（`buildSystemPrompt`）。
- 历史消息受总字符预算 **6,000**（优先保留最新消息）限制，每条另截断至 **2,000**；在上述裁剪前最多保留最近 **6** 轮往返。
- 若传入 `personaId`，须为 `ke-jie`、`lee-sedol`、`go-seigen`、`iyama-yuta`、`shin-jinseo`、`custom` 之一（`CoachRequestSchema`）；省略时默认为棋圣吴清源风格（`go-seigen`）。

```typescript
{
  puzzleId: string;      // 最少 1 字符
  locale: "zh" | "en" | "ja" | "ko";
  userMove: { x: number; y: number };
  personaId?: string;    // 默认棋圣（吴清源样式 persona）
  history: Array<{       // 最少 1 条
    role: "user" | "assistant";
    content: string;
    ts: number;
  }>;
}
```

**成功响应**（`200`）：**Server-Sent Events**（`Content-Type: text/event-stream`）。正文为 SSE 的 `data:` 行，其中 JSON 可能为：

| 载荷                                 | 含义                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `{ "delta": "..." }`                 | 助手增量文本                                                                           |
| `{ "done": true, "usage": { ... } }` | 结束；`usage` 为本请求**已加计一次用量后**的快照                                       |
| `{ "error": "<code>" }`              | 流式中途失败；`<code>` 为 `upstream_error`、`timeout`、`rate_limit`、`auth_error` 之一 |

用量在模型开始流出 token **之前**已递增；客户端中途断开仍会扣减配额。

**JSON 错误响应**（未进入 SSE —— 在开始流之前返回）：

| 状态码          | 判定                    | 触发条件                                                                                                 |
| --------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| 400             | —                       | Content-Type / JSON / Schema 无效，或 `x-go-daily-guest-device-id` 头超过 128 字符                       |
| 401             | `login_required`        | 无会话且无 `x-go-daily-guest-device-id`                                                                  |
| 403             | `error: "forbidden"`    | 同源变异 / CSRF 校验失败（`parseMutationBody`）                                                          |
| 403             | `device_limit`          | 超出免费档设备限制（`getCoachState`）                                                                    |
| 403             | `coach_unavailable`     | 题目未开放教练（`getCoachAccess`）                                                                       |
| 404             | —                       | 未知 `puzzleId`                                                                                          |
| 413             | —                       | 请求体大于 **8 KB**（`MAX_BODY_BYTES`）                                                                  |
| 429             | `daily_limit_reached`   | 登录用户或访客的 **日**配额用尽，或（仅访客）**按 IP 的日**上限（`checkIpLimit`，`usage` 可能为 `null`） |
| 429             | `monthly_limit_reached` | **月**配额用尽                                                                                           |
| 429             | —                       | 通用 IP 限频（`rateLimiter`）                                                                            |
| 500             | —                       | 服务器缺少 `DEEPSEEK_API_KEY`                                                                            |
| 500             | `quota_write_failed`    | 使用量计数写入失败（DB/RPC 错误）                                                                        |
| 502 / 504 / 429 | —                       | 在返回 SSE **之前** 上游失败时的 JSON `{ "error": "..." }`（超时用 `504`）                               |

**防护**：

- `Content-Length` 上限 **8 KB**（`parseMutationBody`）与同源校验
- IP 限流（`createRateLimiter`：**生产环境**须配置 Upstash；**开发环境**可用进程内实现）
- 用户消息的提示注入检测（`guardUserMessage`）
- 输入清理（`sanitizeInput`）
- 教练准入：`coachEligibleIds.json` 白名单 **且** `checkCoachEligibility` / `getCoachAccess` 运行时质量校验
- 配额：`coach_usage` / `guest_coach_usage` 经 Postgres RPC 原子自增（见数据库文档）
- 访客设备用量写入 Supabase `guest_coach_usage` 仅经 `service_role`；**按 IP 的访客日上限**（`checkIpLimit`、`GUEST_IP_DAILY_LIMIT`，当前每 IP 每 UTC 日 **20** 次）在配置 Upstash 时走 **Redis**，否则为 `guestCoachUsage.ts` 进程内 `Map`。

### `GET /api/coach`

获取当前调用方的教练用量摘要。

**认证**：可选。已登录用户可使用会话 Cookie，并可附带 `x-go-daily-device-id`。访客携带 `x-go-daily-guest-device-id` 可查询访客配额。两者皆无则 `401`。

**响应**（`200`）：

```json
{
  "usage": {
    "plan",
    "dailyLimit",
    "monthlyLimit",
    "dailyUsed",
    "monthlyUsed",
    "dailyRemaining",
    "monthlyRemaining",
    "timeZone",
    "monthWindowKind",
    "monthWindowStart",
    "monthWindowEnd",
    "billingAnchorDay"
  }
}
```

已登录用户的 `usage` 在权益中教练不可用时可为 `null`（`coach.available === false`）。访客在提供 `x-go-daily-guest-device-id` 时总会得到数值型访客配额对象。

**请求头**：与 POST 相同，可选 `x-go-daily-device-id` / `x-go-daily-guest-device-id`。

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

各写入端点使用 `createRateLimiter()`，行为如下：

- **`UPSTASH_REDIS_REST_URL` 与 `UPSTASH_REDIS_REST_TOKEN` 均已设置**：`UpstashRateLimiter`（Redis 后端，多实例）。
- **任一未设置**且 `NODE_ENV !== "production"`：`MemoryRateLimiter`（仅适合单进程）。
- **任一未设置**且 `NODE_ENV === "production"`：路由模块加载时 `createRateLimiter()` **抛出错误**——生产环境必须配置 Upstash（见 `lib/rateLimit.ts`）。

`MemoryRateLimiter` 对键数量上限为 50,000；超限时按插入顺序删除最旧键，并定期清理空闲键。默认：每键每 60 秒窗口内 10 次请求（可通过 `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` 覆盖）。

### 请求体解析

所有变更路由使用 `lib/apiHeaders.ts` 中的 `parseMutationBody()` 进行统一的 Content-Type、Content-Length、CSRF 和 JSON 解析。

### API 响应头

所有响应经过 `createApiResponse()`（来自 `lib/apiHeaders.ts`），设置标准化的安全头。

### 运行时

集成较重的处理器（Stripe、教练、cron、admin、题目写入等）设置 `export const runtime = "nodejs"` 以使用 Node API。`/api/health` 等轻量路由使用默认运行时。
