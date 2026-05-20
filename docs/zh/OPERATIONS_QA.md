# 运维、部署与质量保障 (OPERATIONS_QA)

本文件描述了 go-daily 从环境配置到质量验证的生产全生命周期。

发布窗口的逐步操作、回滚方式、关键监控和外部状态页见 [发布 Runbook](RELEASE_RUNBOOK.md)。

## 1. 生产环境技术栈

- **托管**: Vercel (Region: `iad1` - 美国东部)
- **数据库**: Supabase (Region: `ap-southeast-1` - 新加坡)
- **限流**: Upstash Redis (Region: `ap-southeast-1` - 新加坡)
- **DNS & CDN**: Cloudflare (开启 Proxy)
- **观测**: Sentry (错误) + PostHog (事件) + Vercel Speed Insights

## 2. 环境配置

配置通过 Vercel 环境变量管理。关键开关包括：

- `NEXT_PUBLIC_IS_COMMERCIAL`: 设为 `true` 以开启 Stripe 组件和 `/pricing` 页面。
- `COACH_MODEL`: 默认为 `deepseek-chat`。可切换为 `deepseek-reasoner`。
- `COACH_MONTHLY_TOKEN_BUDGET`: 应用层硬性限制，防止账单意外激增。
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`：**生产环境必填** — 当 `NODE_ENV === "production"` 且缺少任一时，`createRateLimiter()` 返回桩，**首次**调用 `isLimited()` 时抛出错误（见 `lib/rateLimit.ts`；`next build` 可不配凭证）。**开发环境**可两者都不配置以使用 `MemoryRateLimiter`（仅适合单进程）。

### OG / Twitter 预览图（`next/og`）

- **位置**：`app/opengraph-image.tsx`、`app/twitter-image.tsx`（全站默认），以及 `app/[locale]/opengraph-image.tsx`（按语言）。
- **运行时**：根级 OG/Twitter 使用 `export const runtime = "nodejs"` 配合 `ImageResponse`，以便在构建阶段**静态预渲染**，并避免 Edge Runtime 关于静态生成的告警。
- **Satori 限制**：渲染器**不支持** `z-index`；层次背景请叠在**最外层容器的 `background`** 上，勿用多层 absolute 叠加。

## 3. 部署预检与本地生产烟测 (`scripts/productionPreflight.ts`)

P2-C 已完成本地生产烟测首轮落地。默认预检必须只做 dry-run、mock、静态分析或可控 HTTP smoke，不部署、不真实发送邮件、不真实创建 Stripe 支付、不访问或修改外部系统。

本地发布前先运行：

```bash
npm run preflight:prod
```

在明确发布窗口并获得单独审批后，才运行会访问外部服务的 live 检查。脚本会输出可变的检查清单（必填环境变量、密钥形态校验、可选的 Supabase 列探测、可选的 Stripe 价格探测——完整项见 `scripts/productionPreflight.ts`）：

```bash
npm run preflight:prod -- --check-remote --stripe-mode=live
```

live 模式检查：Stripe Live Key 有效性、Supabase 表与 RLS 状态、Resend 邮件健康度以及多语言 Key 的一致性。默认本地模式只检查环境变量形态、关键页面/API 文件、SEO、PWA/offline、错误体验、邮件发送安全边界、Stripe 本地边界与轻量性能预算，不得依赖这些外部系统成功。

`npm run email:smoketest` 默认同样是本地 dry-run：只检查 `RESEND_API_KEY` / `EMAIL_FROM` 是否存在以及 sender 形态，不查询 Resend、不发信。只有在单独审批后才使用：

```bash
npm run email:smoketest -- --check-remote
```

真实发送测试邮件必须额外显式传入 `--send-test=<address>`，不属于 P2-C 本地烟测范围。

为保证本地构建可重复，根布局不使用 `next/font/google` 的构建期字体下载；英文字体使用 system-first CSS 变量，CJK 字体仍通过运行时非阻塞 `<link>` 做可选增强。

### P2-D AI 安全、成本与隐私验证

P2-D 的验证必须保持本地、mock、静态分析或单元测试边界；不得发送真实 Sentry/PostHog 事件，不得访问真实 DeepSeek/Stripe/Supabase/Resend 服务，不得输出 secrets。

```bash
npm run test -- tests/lib/promptGuard.test.ts tests/api/coach.test.ts tests/lib/posthog/eventTypes.test.ts tests/lib/posthog/server.test.ts
npm run test -- lib/sentryScrubber.test.ts
npm run validate:messages
npm run lint
npx tsc --noEmit
```

审计重点：

- `promptGuard.ts`：覆盖普通注入、全角、同形字符、零宽字符、标点/空格拆分等红队样例。
- `/api/coach`：确认 promptGuard 拦截发生在题目查询、配额写入和模型调用之前；确认请求体、历史上下文、输出 token、超时、配额、限流和失败回滚均有边界。
- `lib/posthog/server.ts`：确认服务端 distinctId 哈希后发送，且敏感属性 key/value 会阻断事件。
- `sentry*.config.ts`、`lib/sentryScrubber.ts`、`/api/report-error`：确认 `beforeSend`、客户端错误上报和服务端错误报告会清理邮箱、URL query/hash、token、secret、API key、cookie 和 authorization header。

## 4. 质量保障计划

### 自动化覆盖 (Vitest)

我们维护 91 个测试文件，732 个测试用例，涵盖：

- **逻辑**: `tests/lib/puzzle/srs.test.ts`, `tests/lib/entitlements.test.ts`。
- **UI**: `tests/components/GoBoard.test.tsx`, `tests/app/TodayClient.test.tsx`。
- **API**: `tests/api/stripeWebhook.test.ts`。

### 手动验收清单 (关键路径)

1.  **跨设备一致性**：在桌面端解题，5秒内检查手机端是否同步。
2.  **试用转化**：在测试模式下运行完整的 Stripe 结账流程（含3天试用）。
3.  **SEO 验证**：确认 `sitemap.xml` 含 **12,000+** 条各语言 URL（随 `content/data/puzzleIndex.json` 增长），且 `hreflang` 交替正确。
4.  **教练防护**：尝试提示词注入（如”忘记之前所有指令”），验证 `promptGuard.ts` 的拦截效果。`promptGuard.ts` 现在会在模式匹配前进行 Unicode NFKC 归一化，并折叠常见 Cyrillic/Greek 同形字符、移除零宽字符、检查紧凑绕过字符串。请验证全角、同形字符、零宽字符与标点拆分绕过尝试（如 `ＳＹＳＴｅｍ: ignore all`、`i​gn‍ore pre-vious instruc.tions`）也会被拦截。

## 5. 测试组织

测试目录镜像源码结构，位于 `tests/` 下：

| 目录                | 范围          | 示例                                                                  |
| ------------------- | ------------- | --------------------------------------------------------------------- |
| `tests/lib/`        | 核心库逻辑    | `puzzle/srs.test.ts`, `entitlements.test.ts`, `coachProvider.test.ts` |
| `tests/components/` | React 组件    | `GoBoard.test.tsx`, `Nav.test.tsx`, `ShareCard.test.tsx`              |
| `tests/api/`        | API 路由处理  | `stripeWebhook.test.ts`, `coach.test.ts`, `puzzleRandom.test.ts`      |
| `tests/app/`        | 页面级集成    | `TodayClient.test.tsx`, `StatsClient.test.tsx`                        |
| `tests/scripts/`    | 构建/审计脚本 | `auditPuzzles.test.ts`, `queueContent.test.ts`                        |

运行测试：

```bash
npm run dev               # 本地开发服务器
npm run build             # 生产构建
npm run start             # 启动生产服务器
npm run lint              # ESLint 检查
npm run test              # 运行全部测试
npm run test:watch        # 监听模式
npm run test:coverage     # 带覆盖率报告（目标：70%+）
npm run format            # Prettier 格式化
npm run format:check      # 检查格式
npm run import:puzzles    # 导入题库
npm run sync:puzzle-index # 同步题库索引
npm run validate:puzzles  # 校验题库
npm run validate:messages # 校验消息文件
npm run preflight:prod    # 生产环境预检
npm run audit:puzzles     # 审计题库
npm run report:duplicates # 报告重复题目
npm run report:quality    # 报告题库质量
npm run queue:content     # 内容队列管理
npm run gemini:solutions  # Gemini 解题方案
npm run mimo:solutions    # MiMo 解题方案
npm run supabase:health   # Supabase 健康检查
npm run email:smoketest   # 邮件烟感测试
```

## 6. 上线前合规自检 (Compliance Audit)

合规性需要通过外部控制台进行手动验证。

### Stripe (支付与税务)

- [ ] **账户验证**: 确保您的身份和银行详细信息已通过验证，可以接收日元/韩元结算。
- [ ] **Stripe Tax**: 为日本 (JCT) 和相关的美国州启用税费计算。
- [ ] **公开信息**: 更新“公开信息”以匹配 `tokushoho/page.tsx` 中的法定公示内容。

### Resend & Supabase (通讯)

- [ ] **域名验证**: Resend 中的 SPF/DKIM 记录必须显示为绿色，以确保发票邮件的合法送达。
- [ ] **发送者身份**: 将 Supabase Auth 的“发送者”更新为您的自定义域名 (`support@go-daily.app`)。

### 隐私与治理

- [ ] **PIPA 同意**: (手动检查) 验证在线性登录流程中，韩国语言环境的同意卡片正确显示。
- [ ] **Sentry PII 过滤器**: 发布窗口内才运行测试教练对话，并在 Sentry 控制台中验证面包屑中没有显示任何电子邮件或 PII；本地 P2-D 阶段只运行 scrubber 单元测试，不发送真实事件。
- [ ] **PostHog 隐私边界**: 发布窗口内才检查真实项目中是否只出现低敏属性；本地 P2-D 阶段只运行 `captureServerEvent()` mock 测试，不发送真实事件。
