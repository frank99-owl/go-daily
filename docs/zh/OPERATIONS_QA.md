# 运维、部署与质量保障 (OPERATIONS_QA)

本文件描述了 go-daily 从环境配置到质量验证的生产全生命周期。

## 1. 生产环境技术栈

- **托管**: Vercel (Region: `iad1` - 美国东部)
- **数据库**: Supabase (Region: `ap-southeast-1` - 新加坡)
- **DNS & CDN**: Cloudflare (开启 Proxy)
- **观测**: Sentry (错误) + PostHog (事件) + Vercel Speed Insights

## 2. 环境配置

配置通过 Vercel 环境变量管理。关键开关包括：

- `NEXT_PUBLIC_IS_COMMERCIAL`: 设为 `true` 以开启 Stripe 组件和 `/pricing` 页面。
- `COACH_MODEL`: 默认为 `deepseek-chat`。可切换为 `deepseek-reasoner`。
- `COACH_MONTHLY_TOKEN_BUDGET`: 应用层硬性限制，防止账单意外激增。

## 3. 部署预检 (`scripts/productionPreflight.ts`)

在任何生产推送前，运行以下命令验证 47 个关键配置点：

```bash
npm run preflight:prod -- --stripe-mode=live
```

该脚本检查：Stripe Live Key 有效性、Supabase 表与 RLS 状态、Resend 邮件健康度以及多语言 Key 的一致性。

## 4. 质量保障计划

### 自动化覆盖 (Vitest)

我们维持约 570 个测试用例，涵盖：

- **逻辑**: `lib/srs.test.ts`, `lib/entitlements.test.ts`。
- **UI**: `components/GoBoard.test.tsx`, `app/TodayClient.test.tsx`。
- **API**: `tests/api/stripeWebhook.test.ts`。

### 手动验收清单 (关键路径)

1.  **跨设备一致性**：在桌面端解题，5秒内检查手机端是否同步。
2.  **试用转化**：在测试模式下运行完整的 Stripe 结账流程（含7天试用）。
3.  **SEO 验证**：验证 `sitemap.xml` 包含所有 4,800+ 条目。
4.  **教练防护**：尝试提示词注入（如“忘记之前所有指令”），验证 `promptGuard.ts` 的拦截效果。

## 5. 日常维护

- **题目导入**: `npm run import:puzzles` (合并 SGF 至 `classicalPuzzles.json`)。
- **版权审计**: `npm run audit:puzzles` (生成报告至 `reports/`)。
- **I18N 同步**: `npm run validate:messages` (确保四语 Key 对齐)。
