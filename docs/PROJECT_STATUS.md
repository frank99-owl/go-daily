---
title: Project status & roadmap pointer
description: Single entry for humans and AI agents — read this before large changes.
updated: 2026-04-25
---

# go-daily — project status（agent / 协作者入口）

## 阅读顺序（给后续模型）

1. **本文件** — 当前阶段、完成度、易错点、关键路径。
2. **`docs/phase2-next-steps.md`** — 下一阶段（Stripe / 付费墙）执行顺序与 DoD。
3. **`docs/architecture.md`**（或 `architecture.en.md`）— 系统结构。
4. **`docs/i18n.md`** — locale 以 **URL 路径** 为准（`/zh/...`）；cookie 仅辅助根路径重定向。
5. **`docs/data-schema.md`** — 表与 RLS 意图。
6. **`docs/production-preflight.md`** — 生产环境变量、Supabase schema、Stripe/Resend/PostHog 验收；脚本入口 `npm run preflight:prod`。
7. 更长篇商业与技术规格若存在，可能在维护者本地的 `go-daily-roadmap.md`（桌面）；**以本仓库已提交代码为准**，roadmap 仅作规划参考。

## Phase 概览

| Phase | 目标                                          | 状态（2026-04）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | 账户、四语路由、同步雏形、SEO/观测、Auth UI   | **已合入主分支**；DoD 里运维项（双设备 E2E、Lighthouse、GSC）待收口；Sentry 接入与测试错误已完成。修复了社交分享图路径重定向导致的 404 问题。                                                                                                                                                                                                                                                                                                                                                            |
| **2** | Stripe、entitlements、Coach 配额、SRS、Upsell | **已合入主分支** — Stripe 端点、CSP、Webhook 幂等账本、`entitlements`、Coach 三层拦截（login / device / daily / monthly）、Free 自然月 + Pro 账单锚点月、首扣写入、`invoice.payment_failed` 换卡邮件、首页 3s 登录提醒、Provider-agnostic Coach、`/pricing` 独立页与 Upsell 弹窗、PostHog 付费漏斗事件、SRS 间隔复习与队列重建、Resend 欢迎信与每日 cron 均已全部落盘。当前处于：**生产环境线上验收与手动验证期（已完成 540+ 测试用例）**。已自动创建 Stripe Test Mode Webhook 与 Customer Portal 配置。 |
| **3** | 法务正文、特商法、Cookie、删号联动 Stripe 等  | 未开始                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Phase 1 — 已实现要点（代码锚点）

| 能力                                       | 位置                                                        |
| ------------------------------------------ | ----------------------------------------------------------- |
| Supabase browser/server/service/middleware | `lib/supabase/*`                                            |
| Auth OAuth / magic link UI                 | `app/[locale]/login/*`, `lib/auth.ts`                       |
| Auth 回调（**非 locale 前缀**）            | `app/auth/callback/route.ts`                                |
| 账户 / 删号（Supabase user）               | `app/[locale]/account/*`, `app/api/account/delete/route.ts` |
| Session refresh + locale 308               | `proxy.ts`, `lib/supabase/middleware.ts`                    |
| 同步队列与登录后 pull                      | `lib/syncStorage.ts`, `components/ClientInit.tsx`           |
| Merge 纯逻辑（UI 冲突未全）                | `lib/mergeOnLogin.ts`                                       |
| 动态 manifest                              | `app/manifest.ts`                                           |

## Phase 2 — 已实现要点（代码锚点）

| 能力                                           | 位置                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Stripe Checkout / Portal / Webhook + 幂等账本  | `app/api/stripe/*`                                                                                   |
| `invoice.paid` 首扣写入锚点                    | `app/api/stripe/webhook/route.ts`（`first_paid_at` / `coach_anchor_day`）                            |
| `invoice.payment_failed` 回滚 + 换卡邮件       | `app/api/stripe/webhook/route.ts`, `lib/email.ts`                                                    |
| subscriptions / email delivery 字段            | `supabase/migrations/0003_subscription_anchor_fields.sql`, `0004_email_delivery_fields.sql`          |
| Entitlements 层（guest / free / pro）          | `lib/entitlements.ts`                                                                                |
| Free 自然月 + Pro 账单锚点月窗口               | `lib/coachQuota.ts`, `lib/coachState.ts`                                                             |
| Coach 三层拦截（login / device / day / month） | `app/api/coach/route.ts`                                                                             |
| Coach Provider 抽象（OpenAI 兼容）             | `lib/coachProvider.ts`                                                                               |
| 设备限制 + 登录后 merge                        | `lib/deviceRegistry.ts`, `lib/mergeOnLogin.ts`                                                       |
| 登录卡片复用（Google + Guest；email 受开关）   | `components/AuthPromptCard.tsx`                                                                      |
| 首页 3s 登录提醒弹窗（同浏览器一次）           | `components/HomeLoginReminder.tsx`                                                                   |
| 动态 OG / Twitter 分享图                       | `app/opengraph-image.tsx`, `app/twitter-image.tsx`                                                   |
| `/pricing` 定价页 + Checkout/Portal CTA        | `app/[locale]/pricing/*`                                                                             |
| Coach upsell CTA + 付费漏斗事件                | `components/CoachDialogue.tsx`, `components/UpsellModal.tsx`, `lib/posthog/*`                        |
| Resend 邮件基础设施 + 退订 + 每日 cron         | `lib/email.ts`, `app/email/unsubscribe/route.ts`, `app/api/cron/daily-email/route.ts`, `vercel.json` |
| SRS 错题复习                                   | `lib/srs.ts`, `lib/reviewSrs.ts`, `app/[locale]/review/*`, `lib/syncStorage.ts`                      |
| 账户页订阅管理入口                             | `app/[locale]/account/*`, `app/api/stripe/portal/route.ts`                                           |

### Phase 2 — 关键约定

- **首页登录提醒弹窗**：仅匿名态 + 首页 + 首次；3s 延迟浮现；`localStorage` 键 `go-daily.home-login-reminder.dismissed.v1`；支持 `prefers-reduced-motion` 降级。
- **Email 登录 UI**：受 `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN` 控制；默认 `false`。应用侧 Resend transactional/cron 邮件已接入；Supabase Auth magic-link 的 SMTP/域名投递仍需在 Resend/Supabase Dashboard 验证后再开放 UI。
- **Coach 月额度两种窗口**：
  - Free → **用户时区自然月**（`profiles.timezone` → 浏览器时区 → UTC）。
  - Pro → **Stripe 首次实际扣费日锚点**；年付同样按该锚点每月重置；锚点 `31` 日在短月回退到该月最后一天。
- **Coach API 错误码**：`login_required`(401) / `device_limit`(403) / `daily_limit_reached`(429) / `monthly_limit_reached`(429)。
- **Upstash**：代码已支持 `UpstashRateLimiter`，但属 opt-in；未配置 `UPSTASH_REDIS_REST_*` 时回退 `MemoryRateLimiter`。

## 易错点（避免模型幻觉）

- **回调 URL**：Supabase / Google 配置的是 **`https://<project>.supabase.co/auth/v1/callback`**；应用侧是 **`/auth/callback`**，不是 `/[locale]/auth/callback`。
- **重定向**：无 locale 的路径由 **`proxy.ts` 308** 处理，不是依赖 `next.config` 里整页 301 矩阵。
- **`/api/report-error`**：客户端错误上报端点，`lib/errorReporting.ts` 为调用端；服务端会写日志并转发到 Sentry（未配置 DSN 时 no-op）。
- **Device 付费墙 / `user_devices` 登录拦截**：`lib/deviceRegistry.ts` 已实现单设备评估；Coach API 侧已拦截（`device_limit` 403），`CoachDialogue` 已把 `device_limit` / `daily_limit_reached` / `monthly_limit_reached` 映射到 `/pricing` CTA。
- **月额度两种窗口**：Free 与 Pro 的月额度**计算方式不同**，修改 Coach 配额逻辑前请先读 `lib/coachQuota.ts` 的 `getNaturalMonthWindow` / `getBillingAnchoredMonthWindow`，不要混为同一窗口。
- **`invoice.paid` 幂等性**：首次写入时 `first_paid_at` 为空才写；trial 阶段不应写入；回填历史 Pro 订阅脚本当前不存在，如有已上线付费用户需单独补。
- **`invoice.payment_failed` 策略**：webhook 会把本地 `subscriptions.status` 写成 `past_due`，因此 `entitlements` 立即降回 Free；恢复依赖后续 `invoice.paid` / subscription update 事件重新同步。
- **SRS 同步策略**：浏览器登录态会 best-effort 更新 `srs_cards`；`/review` 的 Pro 服务端路径会从 `attempts` 重建/补写 SRS 状态，避免离线或队列延迟导致卡片永久缺失。Free UI 仍只显示最近 20 条错题并引导 Pro。
- **PostHog 服务端事件**：Stripe webhook 的服务端事件走 `lib/posthog/server.ts`；未配置 `NEXT_PUBLIC_POSTHOG_KEY` 时 no-op，不阻塞 webhook 成功响应。

## Phase 1 — 仍建议收口（短清单）

- [ ] 手机 + 电脑同一账号 **E2E**（错题 / attempts 一致）
- [ ] 生产 **Lighthouse SEO**（各 locale）
- [ ] **GSC** sitemap
- [x] **Sentry** 主动触发一条测试错误（已接入配置）
- [x] （可选）浏览器 `online` + SW message fan-out flush sync queue — 见 `components/ClientInit.tsx`、`public/sw.js` 与 `flushSyncQueue`

## 维护约定

- 更新进度时：**改本文件 + `docs/phase2-next-steps.md`（若涉及 Phase 2）**；若有桌面 `go-daily-roadmap.md`，人工同步「进度快照」段落，避免长期分叉。
- CI：`.github/workflows/ci.yml`（format / lint / validate / tsc / test / build）。
