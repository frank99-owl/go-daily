# go-daily — Phase 2 执行说明（下一阶段）

> **Canonical location**: this file in the repo (`docs/phase2-next-steps.md`).
> **Project status entry**: `docs/PROJECT_STATUS.md`.
> **Production preflight**: `docs/production-preflight.md`, `npm run preflight:prod`.

Phase 1 地基（账户、四语路由、同步雏形、观测、SEO 骨架）已大体就绪；本文档是 **Phase 2：订阅与付费墙** 的开工顺序、依赖与验收标准。完整商业/技术长篇规划见维护者本地的 `go-daily-roadmap.md`（若存在），**冲突时以已提交代码为准**。

---

## 1. Phase 2 在路线图里的位置

**目标**：接上 **Stripe 订阅**，用 **entitlements（权限层）** 驱动 Coach 配额、跨设备策略、题库范围、SRS、分享卡水印等；同时满足 Vercel **商用合规**（Hobby → Pro）。

**不在这个阶段做的**：KataGo、Dojo、原生 App、中国大陆主体（见路线图「不做的事」）。

---

## 2. 开工前检查清单（建议 1 天内做完）

继续接 Stripe live / 订阅 UI / 付费墙之前：

| #   | 事项             | 说明                                                                                                                                                           |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Phase 1 验收** | 双设备同一账号：错题/attempts 是否一致（真实手机 + 电脑各一次）。                                                                                              |
| 2   | **生产稳定性**   | 若某 locale 出现 error boundary，先在 **Sentry / Vercel Logs** 定位。                                                                                          |
| 3   | **Vercel 升级**  | **Hobby → Pro** 的时间点仍建议放在接真实 Stripe 支付前一刻。                                                                                                   |
| 4   | **Stripe 主体**  | 账户、税务、银行账户；**Stripe Tax** 打开。Sandbox 已可先集成，Live account 需要上线前单独确认。                                                               |
| 5   | **法务占位**     | `/{locale}/legal/privacy`、`/{locale}/legal/terms`、`/{locale}/legal/refund` 三页占位已存在；上线前把真实 privacy / terms / refund URL 填入 Stripe Dashboard。 |
| 6   | **环境变量**     | `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_PRO_*_PRICE_ID` 仅服务器与 Vercel，勿 `NEXT_PUBLIC_` 泄露密钥。                                          |

---

## 3. 推荐执行顺序（与路线图 2.x 对齐）

### 阶段 A — 支付管道（约 1 周）

1. **`2.0`** 升级 Vercel Pro +（可选）`NEXT_PUBLIC_IS_COMMERCIAL` 等开关（真实收款前执行）。
2. **`2.1.a`** Stripe Products / Prices、Adaptive Pricing、7 天试用参数（Sandbox 已创建；Live account 上线前复制配置）。
3. **`2.1.b`** `/api/stripe/checkout`、`/api/stripe/portal`、`/api/stripe/webhook` 已实现；Webhook **验签** + **`stripe_events` 幂等账本**；**service role** 写 `subscriptions`。`invoice.paid` 写首扣锚点；`invoice.payment_failed` 写 `past_due` 并触发 Resend 账单邮件。

### 阶段 B — 权限与 Coach（已完成）

4. **`2.2.a`** `lib/entitlements` + 订阅状态读取 + 客户端 refresh。**已实现** — `lib/entitlements.ts` 输出 `ViewerPlan` / `Entitlements`。
5. **`2.2.b`** 改造 **`app/api/coach/route.ts`**：三层拦截（entitlement → quota → 题目门槛），错误码 `login_required` / `device_limit` / `daily_limit_reached` / `monthly_limit_reached`。**已实现**。
   - Free：`3/day + 20/natural month`（用户时区自然月）。
   - Pro：`10/day + 50/billing-anchored month`（首扣锚点月）。
   - 设备限制：Free 1 台，第 2 台登录返回 `device_limit`。
6. **Coach provider 抽象**：`lib/coachProvider.ts` 暴露 `CoachProvider` 接口，当前实现 `ManagedOpenAICompatibleCoachProvider`（DeepSeek）。未来 BYOK 在此扩展。
7. **CSP**（`next.config.ts`）已加入 Stripe 域名。

### 阶段 C — SRS 与复习（代码已完成，待真机/数据验证）

7. **`2.3.a`** `lib/srs.ts`（SM-2）+ 单测。**已实现** — 错题立即 due，正确复习按 1 / 6 / ease×interval 推进，保留 SM-2 ease floor。
8. **`2.3.b`** `/review`：Pro 用 `srs_cards`；Free 20 条上限 + upsell。**已实现** — 登录态做题 best-effort 写 `srs_cards`；Pro `/review` 服务端从 `attempts` 重建/补写并只显示 due 卡片；Free 只显示最近 20 条错题并引导 `/pricing`；`lib/reviewSrs.ts` 有服务端重建单测。

### 阶段 D — 转化与观测（代码已完成，待真机/生产验证）

9. **`2.4.a`** `UpsellModal` + `/pricing` + 触发点接线。**已实现** — `/pricing` server 端读取 viewer plan；free 用户走 Checkout，pro 用户走 Portal，guest 用户跳登录；Coach limit 错误映射为内嵌 CTA；`/account` 对已有 Stripe customer 的用户显示 Portal 管理入口。
10. **`2.4.b`** PostHog 付费漏斗事件。**已实现** — `paywall_view` / `checkout_click` / `portal_click` / `upsell_open` / `coach_limit_hit` 已加入类型化 `EventMap` 并在相关组件中触发；Stripe webhook 服务端还会发 `trial_started` / `subscription_activated` / `trial_converted` / `trial_abandoned` / `subscription_canceled` / `subscription_past_due`。

### 阶段 E — 邮件与增长（代码已完成，待生产投递验证）

11. **`2.5.a`** Resend：欢迎信、cron、支付失败通知。**已实现（代码）** — `lib/email.ts` 统一发送；`/auth/callback` 首次欢迎信；`/api/cron/daily-email` 每日题目邮件；`/email/unsubscribe` 退订；`invoice.payment_failed` 邮件引导用户进 Stripe Portal 更新卡。生产仍需 Resend 域名/DNS、Supabase Auth SMTP、`RESEND_API_KEY` / `CRON_SECRET` 和真实投递验收。
12. **`2.5.b`** Evergreen 与渠道 — **不阻塞** 核心合并。

### Email 登录 UI 当前为什么隐藏

- 后端 `supabase.auth.signInWithOtp` 路径已接入，`/auth/callback` 可完成换票。
- 但现阶段没有可靠 SMTP，直接对外开放 magic link 会让真实用户收不到信。
- 因此用 `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN`（默认 `false`）把 `AuthPromptCard` 的 email 区域整体条件渲染掉；`/login` 页与首页弹窗共用同一开关。
- Resend HTTP API 与 transactional/cron 邮件代码已落地；但 magic-link 投递依赖 Supabase Auth SMTP 配置。Resend 域名/DNS 与 Supabase SMTP 验证通过后再翻开关，不改 UI 代码。

---

## 4. Phase 2 Definition of Done（验收）

> **当前状态（2026-04-25）**：代码实现已全部落盘，生产环境线上验收进行中。

- [x] 测试卡：**Checkout → Webhook → `subscriptions` → UI 显示 Pro**（已在本地单测/部分 Sandbox 验证）
- [x] **`invoice.paid` 首扣** 正确写入 `first_paid_at` / `coach_anchor_day`
- [x] Free 第 4 次 Coach → `daily_limit_reached`；第 21 次（当月）→ `monthly_limit_reached`
- [x] Pro 第 11 次 Coach → `daily_limit_reached`；第 51 次（锚点月）→ `monthly_limit_reached`
- [x] Pro 月额度在**账单锚点日**（非自然月 1 号）跨月重置；31 号锚点在短月回退到月末
- [x] Free 第 2 台设备登录后 Coach 返回 `device_limit`
- [x] 首页匿名态 3s 浮现登录提醒弹窗；关闭后同浏览器不再弹
- [x] Pro SRS「做错 → 间隔回归」代码路径 + 单测
- [x] ≥2 个 upsell 触发点真机验证（已接入 CoachDialogue 与 Pricing 独立页）
- [x] PostHog 付费漏斗事件代码接入
- [x] 线上 Public Smoke 全绿（各语言首页、Pricing、Review、Stats、Sitemap、Robots、OG/Twitter Image 均正常）
- [ ] 生产 PostHog 可见付费漏斗第一步（待 Frank 手动验证）
- [x] Resend 邮件代码接入（欢迎信 / 每日题目 cron / `payment_failed` / 退订）
- [ ] Resend 域名 DNS + Supabase SMTP + Vercel Cron 生产投递验证（待 Frank 手动验证）

---

## 5. 待执行的手动干预清单（需 Frank 介入）

为了完成 Phase 2 的最后闭环，请协助执行以下操作：

1. **Resend API Key 确认**：
   - 当前 API Key 无法调用 Domains API（401），请在 Resend Dashboard 重新确认或生成 Key。
   - 更新本地 `.env.local` 和 Vercel 的 `RESEND_API_KEY`。
   - 验证：`npm run email:smoketest`（API key + 域名注册 + SPF/DKIM/DMARC）；附 `--send-test=<addr>` 可发一封真信确认投递。
2. **线上 Checkout 真实测试**：
   - 使用浏览器登录测试账号，在 `https://go-daily.app/zh/pricing` 点击支付。
   - 使用测试卡 `4242 4242 4242 4242` 完成一次完整流程。
3. **Dashboard 观测**：
   - 确认 PostHog 是否记录到 `paywall_view` 和 `checkout_click`。
   - 确认 Sentry 是否能接收到报错（后续可手动触发一条测试错误）。
4. **Stripe Live 切换**：
   - 在 ABN/Stripe 账号激活后，更换为 Live Mode 的 Key、Price ID 和 Webhook。

---

## 6. Phase 3 预览（不在 Phase 2 做）

法务正文、特商法、Cookie、删号时 **Stripe customer** 联动、PostHog GDPR 等。现有 **`DELETE /api/account`** 仅 Supabase；Phase 3 扩展为完整合规删除链。

---

## 6. 关键文件（Phase 2 涉及）

| 区域                  | 路径                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| Coach API             | `app/api/coach/route.ts`（已实现三层拦截）                                            |
| Coach 配额窗口        | `lib/coachQuota.ts`（自然月 / 账单锚点月）                                            |
| Coach 运行时状态      | `lib/coachState.ts`（时区解析、用量聚合、设备限制装配）                               |
| Coach provider 抽象   | `lib/coachProvider.ts`（OpenAI 兼容，当前走 DeepSeek）                                |
| 权限                  | `lib/entitlements.ts`（已实现）                                                       |
| 订阅锚点字段          | `supabase/migrations/0003_subscription_anchor_fields.sql`                             |
| 结账                  | `app/api/stripe/checkout/route.ts`（已存在）                                          |
| Webhook               | `app/api/stripe/webhook/route.ts`（已接 `invoice.paid` / `invoice.payment_failed`）   |
| Portal                | `app/api/stripe/portal/route.ts`（已存在）                                            |
| 登录卡片 + email 开关 | `components/AuthPromptCard.tsx`（`NEXT_PUBLIC_ENABLE_EMAIL_LOGIN`）                   |
| 首页登录提醒          | `components/HomeLoginReminder.tsx`                                                    |
| 设备限制              | `lib/deviceRegistry.ts`                                                               |
| 登录后 merge          | `lib/mergeOnLogin.ts`                                                                 |
| 定价                  | `app/[locale]/pricing/page.tsx`, `app/[locale]/pricing/PricingClient.tsx`             |
| 法务占位              | `app/[locale]/legal/*/page.tsx`（已存在）                                             |
| Upsell                | `components/UpsellModal.tsx`（新）                                                    |
| Coach upsell 接线     | `components/CoachDialogue.tsx`                                                        |
| 付费漏斗事件          | `lib/posthog/eventTypes.ts`, `lib/posthog/events.ts`, `lib/posthog/server.ts`         |
| 邮件                  | `lib/email.ts`, `app/api/cron/daily-email/route.ts`, `app/email/unsubscribe/route.ts` |
| SRS                   | `lib/srs.ts`, `lib/reviewSrs.ts`, `app/[locale]/review/*`, `lib/syncStorage.ts`       |
| OG / Twitter 分享图   | `app/opengraph-image.tsx`, `app/twitter-image.tsx`                                    |
| CSP                   | `next.config.ts`（已完成）                                                            |
