# go-daily 项目深度审计报告

> 审计日期：2026年5月27日

---

## 1. 项目概览

**技术栈**: Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + Supabase (Auth + Postgres + RLS) + Stripe + DeepSeek AI + Vitest + Sentry + Upstash Redis + Resend (email)

**运行时**: Node.js >= 22.5.0

**项目规模**:

- 源代码文件: ~436 个
- 源代码行数 (ts/tsx/js/css/mjs): ~42,467 行
- 测试文件: 99 个
- 生产依赖: 17 个
- 开发依赖: 14 个

**目录结构**:

```
app/           — Next.js App Router 页面 + API 路由
components/    — 28 个 React 组件
content/       — 题库数据、教练内容、编辑模板
lib/           — 9 个领域模块 + 跨领域工具
  auth/        — 会话、设备注册、游客身份
  board/       — 围棋规则、落子验证、SGF 解析
  coach/       — AI 提示、配额、人设系统
  i18n/        — 语言协商、路径辅助
  posthog/     — 分析、功能标志
  puzzle/      — 题目加载、SRS 调度、集合
  storage/     — 三级存储: LocalStorage -> IndexedDB -> Supabase
  stripe/      — 支付、订阅、webhook
  supabase/    — Auth SSR 辅助、service 客户端
scripts/       — 14 个工具脚本
tests/         — 99 个测试文件
types/         — Zod schemas + 推导类型
docs/          — 多语言文档
```

**构建方式**: `npm run build` = `prebuild (validate:puzzles + validate:messages)` + `next build`。CI 通过 GitHub Actions 运行完整管线。

---

## 2. 架构分析

### 整体架构设计: 优秀

领域驱动设计 (DDD) 做得很好。`lib/` 下 9 个领域各自独立，职责清晰。

- **状态管理**: 客户端使用 React 本地状态 + localStorage/IndexedDB 持久化。无全局状态库，对于这个规模合理。
- **数据流**: Server Component 获取数据 -> 传递 props 给 Client Component -> Client 通过 API 路由写入。三层存储架构 (localStorage -> IndexedDB queue -> Supabase) 设计精巧。
- **Zod 作为 Single Source of Truth**: `types/schemas.ts` 定义所有共享数据结构，`types/index.ts` 通过 `z.infer` 推导类型。非常好的实践。

### 模块间耦合度: 低

各领域通过清晰接口通信。`proxy.ts` (middleware) 负责 auth refresh + locale 协商 + 路由守卫，职责明确。

### 值得注意的设计决策

1. **server-only 模块运行时守卫**: `lib/stripe/server.ts`、`lib/coach/coachState.ts`、`lib/supabase/service.ts` 都在文件顶部检查 `typeof window !== "undefined"` 并 throw。防御性编程的好实践。
2. **懒加载题库**: `content/puzzles.server.ts` 使用 Proxy 模式懒加载 11MB 的题目 JSON，避免 summary-only 代码路径付出不必要的 I/O 成本。
3. **Coach Provider Fallback**: `FallbackCoachProvider` 实现了主备 LLM 提供商的自动切换。

---

## 3. 代码质量

### 命名规范一致性: 良好

- 文件名: camelCase
- 组件: PascalCase
- 常量: UPPER_SNAKE_CASE
- 函数: camelCase

### 错误处理: 完善

API 路由普遍有完善的错误处理，覆盖请求体解析失败、认证失败、速率限制、配额耗尽、上游超时等场景。

### 代码异味

1. **`lib/coach/coachState.ts`**: 类型断言 `as ProfileRow | null` 和 `as SubscriptionRow | null`。Supabase 类型推导不完美，可考虑更安全的方式。
2. **`app/api/coach/route.ts`**: `user!.id` 和 `user!.email` 的非空断言。虽然前面有检查，但 TypeScript 不总能追踪控制流。
3. **`lib/storage/syncStorage.ts`**: `readQueue` 和 `writeQueue` 的 catch 块完全吞掉错误，仅靠注释说明原因。
4. **`content/puzzles.server.ts`**: Proxy 懒加载模式可能让不熟悉的开发者困惑。

### 重复代码

`isAdmin()` 函数在 `app/api/admin/grants/route.ts` 和 `app/api/admin/ops/route.ts` 中重复定义。应提取到共享模块。

### 魔法数字

- `lib/entitlements.ts`: `dailyLimit: 51, monthlyLimit: 1001` 缺少注释说明为何选择这些值。
- `app/api/coach/route.ts`: `MAX_BODY_BYTES = 8 * 1024`、`MAX_HISTORY = 6`、`MAX_HISTORY_CHARS = 6_000` 有命名常量但缺少选择理由。

---

## 4. 安全性

### 安全做得好的地方

1. **CSP 配置**: 完善的 Content-Security-Policy
2. **安全头**: HSTS (2年 + preload)、X-Content-Type-Options: nosniff、X-Frame-Options: DENY
3. **CSRF 防护**: `lib/requestSecurity.ts` 检查 Origin/Sec-Fetch-Site header
4. **Prompt Injection 防护**: `lib/promptGuard.ts` 实现 Unicode NFKC 规范化、Cyrillic/Greek confusable 折叠、模式匹配、关键词密度检查
5. **常量时间比较**: `lib/secureCompare.ts` 使用 SHA-256 + `timingSafeEqual`
6. **Reveal Token**: HMAC-SHA256 签名 + 10分钟 TTL + puzzle ID 绑定
7. **Sentry 数据清洗**: `lib/sentryScrubber.ts` 自动脱敏 email、token、URL 参数
8. **请求体大小限制**: 流式读取 + 硬字节上限
9. **Rate Limiting**: 双层实现 (Memory + Upstash Redis)

### 潜在风险

1. **`lib/promptGuard.ts`**: 注入检测基于正则表达式，专业攻击者可能绕过。作为 defense-in-depth 层合理。
2. **Admin PIN 验证**: PIN 长度不足时返回 "admin not configured" 而非统一的 "invalid pin"，可能泄露 PIN 长度信息。
3. **`lib/clientIp.ts`**: `cf-connecting-ip` 最后检查，注释说可被轻易伪造（如果不在 Cloudflare 后面）。

---

## 5. 性能

### 做得好的地方

1. **懒加载题库**: summary-only 路径不触发 11MB JSON 解析
2. **Canvas 渲染**: GoBoard.tsx 使用 Canvas 2D，性能优于 DOM
3. **Service Worker**: 静态资源缓存 + 离线回退
4. **Debounced Sync**: 500ms debounce 避免频繁写入
5. **图片缓存头**: 1 年 immutable 缓存

### 潜在瓶颈

1. **`getPuzzleById` 使用 `Array.find` 线性搜索**: 对 3000+ 题目做线性扫描，应改用 Map 索引
2. **`loadAttempts()` 每次调用都重新读取 localStorage**: 高频调用场景下可能有性能问题
3. **GoBoard render callback 依赖数组较大** (17 个依赖): 每次 hover 状态变化都触发重新计算

---

## 6. 测试覆盖

### 测试概况

99 个测试文件，覆盖了 lib/ 核心逻辑、API 路由、关键组件、脚本、Middleware。

### 覆盖良好的路径

- Coach 配额计算和使用量递增/递减
- Stripe webhook 幂等性处理
- 棋盘规则和落子判定
- SRS (间隔重复) 算法
- 设备注册和限制
- i18n 路径生成

### 缺少的重要测试

1. **端到端测试**: 无 E2E 测试 (Playwright/Cypress)。支付流程缺少集成测试。
2. **`/api/cron/daily-email`**: 定时任务发送大量邮件，无测试覆盖。
3. **`/api/account/delete`**: 账户删除是敏感操作，无测试。
4. **PWA/Service Worker**: 缓存策略和离线行为没有充分测试。

---

## 7. 构建与部署

### CI/CD: 完善

GitHub Actions 管线: `format:check -> lint -> validate:puzzles -> validate:messages -> tsc --noEmit -> test -> build`

### 环境变量管理

- `.env.example` 文档完善，每个变量都有说明
- `lib/env.ts` 使用 Zod 懒验证，缺失变量在首次使用时报错

---

## 8. 依赖管理

**生产依赖 (17个)**: 全部合理，无冗余依赖。

- `framer-motion` 对棋盘应用可能偏重，但用于页面过渡动画则合理
- `openai` SDK 用于 DeepSeek API 调用（DeepSeek 兼容 OpenAI 格式）
- `package-lock.json` 存在，版本锁定到位
- `engines.node: ">=22.5.0"` 明确了 Node.js 版本要求

---

## 9. 文档

### 优秀

- README: 多语言版本 (en/zh/ja/ko)，清晰的项目介绍和开发指南
- CLAUDE.md: 详细的架构说明、领域模块职责表、关键规则、常见陷阱
- AGENTS.md: 为 AI agent 提供完整项目上下文
- docs/: 多语言文档覆盖架构、API 参考、数据库 schema、产品规格、运维

---

## 10. 具体改进建议

### P0 — 必须立即处理

**1. [安全] 检查 `.env.local.broken-20260512-225100` 是否曾被提交到 git 历史**

- 问题: 文件包含 Vercel OIDC token
- 影响: Vercel 部署权限可能泄露
- 方案: `git log --all --full-history -- .env.local.broken-20260512-225100` 检查。如曾被提交，立即轮换 Vercel 项目 token 并删除该文件。

### P1 — 高优先级

**2. [性能] `getPuzzleById` 使用 Map 索引替代线性搜索**

- 文件: `content/puzzles.server.ts`
- 问题: `Array.find` 对 3000+ 题目线性扫描
- 方案: 构建 `Map<string, Puzzle>` 索引，改为 O(1) 查找

**3. [代码质量] 提取重复的 `isAdmin()` 函数**

- 文件: `app/api/admin/grants/route.ts`、`app/api/admin/ops/route.ts`
- 方案: 提取到 `lib/admin.ts` 共享模块

**4. [测试] 添加 `/api/cron/daily-email` 测试**

- 问题: 定时任务发送大量邮件，无测试覆盖
- 方案: 添加测试覆盖认证、批量处理、错误处理、幂等性

**5. [测试] 添加 `/api/account/delete` 测试**

- 问题: 账户删除是不可逆操作，无测试
- 方案: 添加测试覆盖认证、数据清理、错误回滚

### P2 — 中优先级

**6. [代码质量] 为魔法数字添加注释**

- 文件: `lib/entitlements.ts` 的 `dailyLimit: 51, monthlyLimit: 1001`

**7. [性能] 缓存 `loadAttempts()` 结果**

- 文件: `lib/storage/storage.ts`
- 方案: 添加短期缓存 (如 1 秒 TTL)

**8. [架构] 添加 E2E 测试**

- 方案: 使用 Playwright 覆盖注册 -> 答题 -> 订阅 -> webhook -> 权益解锁

**9. [安全] Admin PIN 长度检查信息泄露**

- 文件: `app/api/admin/verify/route.ts`
- 方案: 统一返回 "invalid pin" 或 "forbidden"

**10. [运维] 清理 `.env.local.broken-*` 文件**

- 方案: 删除残留调试文件

---

## 总结

go-daily 架构设计良好、代码质量较高。领域驱动的 `lib/` 结构清晰，Zod schema 作为 single source of truth 实践优秀，安全防护层考虑周全，测试覆盖了大部分核心逻辑。

最紧急的事项是检查 git 历史中是否有泄露的 token (P0)。其次是性能优化 (PuzzleById 索引) 和补充缺失的关键路径测试。
