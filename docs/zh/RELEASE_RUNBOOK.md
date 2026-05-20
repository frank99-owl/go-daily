# 发布 Runbook

**生成日期**: 2026-05-20
**适用范围**: go-daily 生产发布窗口、热修复发布、发布后 24 小时观察

本 runbook 只定义操作顺序和验收口径；推送代码、部署生产、创建 GitHub release、公开公告或外部用户触达仍需 Frank 单独批准。

## 1. 发布前冻结

1. 确认当前分支和 diff：`git status --short`、`git diff --stat`。
2. 确认没有真实密钥、邮箱正文、私密日志进入 diff。
3. 内容变更需确认 `content/data/contentReviewBatches.json` 状态和 `coachReadyIds.json` 一致。
4. Stripe / Supabase / Vercel / DeepSeek 相关变更需写清回滚点。

## 2. 本地验证命令

按顺序运行：

```bash
npm run format:check
npm run lint
npm run validate:puzzles
npm run validate:messages
npx tsc --noEmit
npm run test
npm run build
```

生产发布窗口前再运行：

```bash
npm run preflight:prod -- --check-remote --stripe-mode=live
npm run email:smoketest
npm run supabase:health
```

若改动只涉及文档，可只跑 `format:check`；若涉及内容、权益、支付、同步或 Coach，必须跑完整命令。

## 3. 生产烟测

发布后按以下顺序检查：

1. `/api/health` 返回 200。
2. `/en/pricing`、`/zh/today`、任一题目页返回 200。
3. 登录后 `/api/auth/device` 正常登记设备。
4. 免费 / Pro / 手动授予账号的权益显示符合预期。
5. Coach ready 题可打开 SSE；非 ready 题显示能力边界，不开放完整 Coach。
6. Stripe Checkout test/live smoke 只在批准的发布窗口执行。
7. `/admin` Operations Snapshot 检查：
   - `Coach-ready = 20`
   - `Past due expired = 0` 或已有跟进记录
   - `Webhook failures = 0`
   - `Attempt rows, 7d` 和 `Devices seen, 7d` 没有异常归零

## 4. 回滚方式

| 场景                    | 首选回滚                                                              | 注意事项                                |
| ----------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| 页面 / API 运行错误     | Vercel 回滚到上一个稳定 Production deployment                         | 回滚后重新检查 `/api/health` 与关键页面 |
| Stripe Webhook 写错订阅 | 暂停相关 webhook 或回滚代码，再用 Supabase 审计受影响 `subscriptions` | 不手改大批数据；先导出受影响 user_id    |
| Supabase migration 问题 | 停止继续部署，按 migration 反向 SQL 小步恢复                          | RLS、索引、约束变更必须逐条确认         |
| Coach 上游异常          | 临时关闭或降级 Coach 配置，保留静态解析                               | 确认配额回滚逻辑没有重复退费            |
| 内容批次错误            | 回滚内容 JSON 与 `coachReadyIds.json` / `contentReviewBatches.json`   | 不改 attempt dedup key                  |

## 5. 关键监控

- `/admin` Operations Snapshot：内容分层、Coach 使用、Stripe `past_due`、Webhook、同步写入。
- PostHog：activation、result viewed、coach opened/completed/error、subscription events。
- Sentry：server route exceptions、client hydration/runtime errors。
- Supabase：Auth、Postgres、RLS error、API latency。
- Stripe：Checkout、invoice events、webhook delivery、failed payments。
- Vercel：deployment health、function errors、build logs、edge/network incident。

## 6. 外部状态页

- [Vercel Status](https://vercel.statuspage.io/)
- [Supabase Status](https://status.supabase.com/)
- [Stripe Status](https://status.stripe.com/)
- [Resend Status](https://resend-status.com/)
- [DeepSeek Status](https://status.deepseek.com/)
- [Upstash Status](https://upstash.instatus.com/)
- [PostHog Status](https://www.posthogstatus.com/us)
- [Sentry Status](https://status.sentry.io/)

## 7. 发布后观察

发布后 24 小时内至少检查两次：

1. `/admin` Operations Snapshot。
2. Stripe webhook delivery 和 invoice failure。
3. Sentry 新增 issue。
4. PostHog Coach error rate 和 activation funnel。
5. Supabase `attempts` / `user_devices` 是否持续写入。

若任一核心路径异常，先记录具体时间、deployment、错误范围，再决定回滚或热修。
