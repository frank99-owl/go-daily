# 运维、部署与质量保障 (OPERATIONS_QA)

本文件描述了 go-daily 从环境配置到质量验证的生产全生命周期。

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

## 3. 部署预检 (`scripts/productionPreflight.ts`)

在任何生产推送前，运行以下命令验证 47 个关键配置点：

```bash
npm run preflight:prod -- --stripe-mode=live
```

该脚本检查：Stripe Live Key 有效性、Supabase 表与 RLS 状态、Resend 邮件健康度以及多语言 Key 的一致性。

## 4. 质量保障计划

### 自动化覆盖 (Vitest)

我们维护 81 个测试文件，约 631 个测试用例，涵盖：

- **逻辑**: `lib/srs.test.ts`, `lib/entitlements.test.ts`。
- **UI**: `components/GoBoard.test.tsx`, `app/TodayClient.test.tsx`。
- **API**: `tests/api/stripeWebhook.test.ts`。

### 手动验收清单 (关键路径)

1.  **跨设备一致性**：在桌面端解题，5秒内检查手机端是否同步。
2.  **试用转化**：在测试模式下运行完整的 Stripe 结账流程（含7天试用）。
3.  **SEO 验证**：验证 `sitemap.xml` 包含所有 4,800+ 条目。
4.  **教练防护**：尝试提示词注入（如“忘记之前所有指令”），验证 `promptGuard.ts` 的拦截效果。

## 5. 测试组织

测试目录镜像源码结构，位于 `tests/` 下：

| 目录                | 范围          | 示例                                                             |
| ------------------- | ------------- | ---------------------------------------------------------------- |
| `tests/lib/`        | 核心库逻辑    | `srs.test.ts`, `entitlements.test.ts`, `coachProvider.test.ts`   |
| `tests/components/` | React 组件    | `GoBoard.test.tsx`, `Nav.test.tsx`, `ShareCard.test.tsx`         |
| `tests/api/`        | API 路由处理  | `stripeWebhook.test.ts`, `coach.test.ts`, `puzzleRandom.test.ts` |
| `tests/app/`        | 页面级集成    | `TodayClient.test.tsx`, `StatsClient.test.tsx`                   |
| `tests/scripts/`    | 构建/审计脚本 | `auditPuzzles.test.ts`, `queueContent.test.ts`                   |

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
npm run generate:katago   # 生成 KataGo 分析
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
- [ ] **Sentry PII 过滤器**: 运行测试教练对话，并在 Sentry 控制台中验证面包屑中没有显示任何电子邮件或 PII。
