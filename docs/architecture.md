# 架构总览

> English version: [architecture.en.md](./architecture.en.md)

一张纸看懂 go-daily 怎么组织起来的：层边界在哪、数据怎么流、谁调谁。

## 技术栈速览

| 层   | 选型                                                      | 说明                                                              |
| ---- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| 框架 | Next.js 16 (App Router, Turbopack)                        | 全部走 App Router；server component 为默认，`"use client"` 为显式 |
| 语言 | TypeScript strict                                         | `tsconfig.json` 打开 strict，`noImplicitAny` 等默认生效           |
| UI   | React 19 + Tailwind v4 + Framer Motion                    | Tailwind v4 新 `@theme` 语法在 `app/globals.css`                  |
| 图标 | lucide-react                                              | 已接入 Shuffle / ChevronLeft / ChevronRight / Play / Check 等     |
| LLM  | DeepSeek `deepseek-chat`（OpenAI 兼容 SDK）               | 通过 `app/api/coach/route.ts` 代理                                |
| Auth | Supabase Auth（OAuth + magic link）                       | `lib/supabase/` 下的 client/server/middleware/service 分层        |
| DB   | Supabase Postgres + RLS                                   | profiles / attempts / subscriptions / user_devices / srs_cards    |
| 存储 | localStorage（匿名）+ IndexedDB 队列 + Supabase（登录后） | `lib/syncStorage.ts` 统一封装三种运行时状态                       |
| 分析 | PostHog                                                   | `lib/posthog/` 客户端初始化 + 类型化事件封装                      |
| 监控 | Sentry + Vercel Analytics + Speed Insights                | `sentry.*.config.ts` + `instrumentation.ts`                       |
| 邮件 | Resend                                                    | `lib/email.ts` HTTP API 接入（欢迎信、每日 Cron、付款失败提醒）   |

## 层次结构

```
┌─────────────────────────────────────────────────────────────────────┐
│  proxy.ts       Next.js middleware: locale negotiation + 308 重定向   │
│                  + Supabase session refresh                           │
│  app/           路由 · 页面组件（Server / Client 分明）                │
│  components/    UI 复用单元（GoBoard · ShareCard · Nav · LocalizedLink）│
│  lib/           纯逻辑层（board · judge · storage · i18n · syncStorage │
│                 · localePath · deviceRegistry · mergeOnLogin …）      │
│  content/       数据（puzzles.ts · puzzles.server.ts ·                │
│                 messages/*.json · data/*.json · games/ ·               │
│                 curatedPuzzles.ts · editorial*.ts）                    │
│  types/         类型定义（Puzzle · AttemptRecord · …）                │
│  scripts/       构建 / 作者工具（validatePuzzles · importTsumego        │
│                 · auditPuzzles · auditPuzzleSources · queueContent ·   │
│                 · syncPuzzleIndex · supabaseHealthcheck）              │
│  supabase/      数据库迁移（migrations/*.sql）                         │
└─────────────────────────────────────────────────────────────────────┘
```

**依赖方向**：`proxy` → `app` → `components` → `lib` → `types`/`content`。反向依赖是禁区。

## 路由表

所有用户面页面都在 `/{locale}/...` 下。根路径 `/` 会被 middleware 重定向到协商出的 locale（如 `/en`）。

| 路由                     | 说明                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `/{locale}/`             | Landing page：视差滚动 + AlphaGo 第 4 局演示                      |
| `/{locale}/today`        | 每日一题：异步获取当日 puzzle，交给 `TodayClient` 做交互          |
| `/{locale}/puzzles`      | 全量题库：异步获取 summary 列表，筛选 / 排序 / 搜索               |
| `/{locale}/puzzles/[id]` | 按 ID 打开一题；curated 题 SSG，其余 ISR（24h）                   |
| `/{locale}/result`       | 判题后的回显：对/错横幅、解答播放、AI 陪练、分享卡                |
| `/{locale}/review`       | 错题复习：Pro 服务端 SRS due 队列；Free 最近 20 条错题 + 升级 CTA |
| `/{locale}/stats`        | 战绩：连胜 · 正确率 · 总量 · 热力图                               |
| `/{locale}/about`        | 项目介绍页（原开发者页）                                          |
| `/api/coach`             | LLM 代理（POST JSON，zod schema 校验）                            |
| `/api/report-error`      | 客户端错误上报端点（缓冲 + 重试），服务端写日志并转发 Sentry      |
| `/api/stripe/checkout`   | Stripe Checkout Session 创建（server-side redirect）              |
| `/api/stripe/portal`     | Stripe Customer Portal Session 创建                               |
| `/api/stripe/webhook`    | Stripe Webhook 接收（验签 + 幂等 + service-role 写 DB）           |
| `/auth/callback`         | OAuth / magic link 回调：exchange code for session                |
| `/manifest.webmanifest`  | 动态本地化 PWA manifest（按协商 locale 返回对应语言）             |

**Server vs Client 分界约定**：`page.tsx` 尽量只做「异步取 puzzle · 构造 props · 传给 Client 组件」，重活都在 `*Client.tsx` 里。因为需要读 `localStorage` / 浏览器 API，所有带历史/偏好的交互都必然是 client 组件。

## 核心数据流

### 做一道题（落子 → 判题 → 结果页）

入口可以是 `/{locale}/today`（每日一题）或直接通过 `/{locale}/puzzles/[id]` 打开特定题目：

```
 用户点击棋盘 (GoBoard onPlay)
       ↓
 TodayClient.setPending(coord)
       ↓
 用户点「确认落子」 → TodayClient.submit()
       ↓
 judgeMove(puzzle, move)   ← lib/judge.ts，查 puzzle.correct[]
       ↓
 saveAttempt({ puzzleId, date, userMove, correct, solvedAtMs })
       ↓                    ← lib/storage.ts（匿名）或 lib/syncStorage.ts（登录后）
 router.push(`/{locale}/result?id=${puzzle.id}`)
       ↓
 ResultClient 读 URL id → getPuzzle(id) → 渲染
       ├─ getAttemptFor(id)       // 最近一次（对/错横幅）
       └─ getAttemptsFor(id)      // 累计历史（第 N 次 · 对 X 错 Y）
```

### 登录用户的同步流程

```
 用户登录（OAuth callback）
       ↓
 registerDevice(userId)     ← lib/deviceRegistry.ts
       ↓
 检查 device access（免费用户限 1 台设备）
       ↓
 planMerge(local, remote)   ← lib/mergeOnLogin.ts
       ↓
 如有冲突 → UI 提示用户选择（merge / keep-local / keep-remote）
       ↓
 applyMergeDecision() → sync()  ← lib/syncStorage.ts
       ↓
 本地 + 云端双写（IndexedDB 队列 + 指数退避重试）
```

### 每日一题（日期 → 轮换索引 → 具体题目）

`lib/puzzleOfTheDay.ts` 用"日期 → 索引"模子：

1. `todayLocalKey()` 返回本地 `YYYY-MM-DD`
2. `getPuzzleForDate(date)` 用 `date - ROTATION_ANCHOR`（锚点 `2026-04-18`）得到天偏移
3. 对题库长度取模，稳定拿到当天那道

**不再匹配 `puzzle.date` 字段** —— 导入题的 `date` 是占位符，不该参与调度。纯靠模数算法；到达末尾自动循环。

### 读历史战绩（`/stats` 与 `/review`）

```
loadAttempts()                    // lib/storage.ts
     ↓
AttemptRecord[] （时序 append-only）
     ↓
派生视图（按需在组件内 useMemo）：
  - getStatusFor(id, list)        → solved / attempted / unattempted
  - getHistoryFor(id, list)       → { history, total, correct, wrong }
  - computeStatusTallies(ids, list)
  - lastAttemptMsMap(list)
  - computeStreak / computeAccuracy
```

关键约定：`lib/puzzleStatus.ts` **不 import `window`**，所有函数都是 `AttemptRecord[] → X` 的纯函数。这样 SSR 安全、可单元测试。

## 关键模块坐标

| 模块                         | 路径                                 | 一句话                                                                                 |
| ---------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| 数据入口（环境感知）         | `content/puzzles.ts`                 | `getPuzzle()` / `getAllSummaries()` — server 读 full，client 读 index                  |
| 服务端全量数据               | `content/puzzles.server.ts`          | 从 `data/*.json` 加载完整 `Puzzle[]`；仅在服务端运行                                   |
| 客户端轻量索引               | `content/data/puzzleIndex.json`      | `PuzzleSummary[]` 供列表页/复习页等轻量消费                                            |
| 导入题集（自动生成）         | `content/data/classicalPuzzles.json` | `scripts/generateKatagoPuzzles.ts` 产出，不要手改                                      |
| 全量题库（自动生成）         | `content/data/classicalPuzzles.json` | 聚合后的完整题库 JSON                                                                  |
| 精选题                       | `content/curatedPuzzles.ts`          | 手写 curated 题，被 `puzzles.server.ts` 聚合                                           |
| 历史棋谱数据                 | `content/games/leeAlphagoG4.ts`      | 李世石 vs AlphaGo 第 4 局 SGF + 元数据（「神之一手」）                                 |
| 类型                         | `types/index.ts`                     | `Puzzle` / `AttemptRecord` / `PuzzleStatus` / `Locale` 等                              |
| zod schema                   | `types/schemas.ts`                   | 运行时校验 schema，API + validatePuzzles 共用                                          |
| 限流抽象                     | `lib/rateLimit.ts`                   | `RateLimiter` 接口 + `MemoryRateLimiter` / `UpstashRateLimiter` 自动切换               |
| 站点 URL                     | `lib/siteUrl.ts`                     | 读取 `NEXT_PUBLIC_SITE_URL`，用于 canonical / sitemap / robots                         |
| localStorage 读写            | `lib/storage.ts`                     | `loadAttempts` / `saveAttempt` / `getAttemptFor` / `getAttemptsFor`                    |
| 同步存储                     | `lib/syncStorage.ts`                 | 匿名透明透传 / 登录后双写（localStorage + IndexedDB 队列 → Supabase）                  |
| 登录合并                     | `lib/mergeOnLogin.ts`                | 纯函数：local vs remote 差异分析、决策矩阵、合并应用                                   |
| 设备标识                     | `lib/deviceId.ts`                    | per-browser UUID + UA 解析为友好标签                                                   |
| 设备注册                     | `lib/deviceRegistry.ts`              | Free-plan 单设备限制评估、拦截与 `user_devices` 读写                                   |
| 尝试去重键                   | `lib/attemptKey.ts`                  | `${puzzleId}-${solvedAtMs}` 标准去重键                                                 |
| 客户端 IP                    | `lib/clientIp.ts`                    | 从 CF-Connecting-IP / X-Forwarded-For / X-Real-IP 提取真实 IP                          |
| i18n URL 工具                | `lib/localePath.ts`                  | `localePath()` / `stripLocalePrefix()` / `negotiateLocaleFromHeader()`                 |
| Server 翻译辅助 / DICTS 入口 | `lib/metadata.ts`                    | `getMessages(locale)` + `DICTS` — server component / i18n Context / manifest 共享入口  |
| i18n Context                 | `lib/i18n.tsx`                       | `LocaleProvider`（接收 `initialLocale`）+ `useLocale()`                                |
| 多语言文本回退               | `lib/localized.ts`                   | `localized(text, locale)` 自带 en→zh→ja→ko fallback                                    |
| 本地化链接                   | `components/LocalizedLink.tsx`       | 自动给 href 加当前 locale 前缀的 `next/link` 包装                                      |
| Locale middleware            | `proxy.ts`                           | URL locale 检测 → 协商 → 308 重定向 + `x-locale` header + Supabase refresh             |
| Supabase 客户端              | `lib/supabase/client.ts`             | Browser-side Supabase client（RLS 保护）                                               |
| Supabase 服务端              | `lib/supabase/server.ts`             | Server Component / Route Handler 用（cookie 读写）                                     |
| Supabase middleware          | `lib/supabase/middleware.ts`         | `refreshSupabaseSession()` — middleware 中刷新 token                                   |
| Supabase service             | `lib/supabase/service.ts`            | Service-role client（ bypass RLS，仅 server 用）                                       |
| PostHog 客户端               | `lib/posthog/client.ts`              | `initPostHog()` + `posthog` 实例                                                       |
| PostHog 事件                 | `lib/posthog/eventTypes.ts`          | 客户端与服务端共享的类型化事件表                                                       |
| PostHog 服务端发送           | `lib/posthog/server.ts`              | Stripe webhook 订阅事件发送；未配置 key 时 no-op                                       |
| 状态派生                     | `lib/puzzleStatus.ts`                | 纯函数，消费 attempts 数组                                                             |
| 判题                         | `lib/judge.ts`                       | 一行：查 `puzzle.correct[]` 是否命中                                                   |
| 每日轮换                     | `lib/puzzleOfTheDay.ts`              | `getPuzzleForDate` + `todayLocalKey`                                                   |
| 随机抽题                     | `lib/random.ts`                      | `pickRandomPuzzle(pool: "all"│"unattempted"│"wrong")`                                  |
| 棋盘几何                     | `lib/board.ts`                       | `isInBounds` / `isOccupied` / `starPoints`                                             |
| 围棋规则引擎                 | `lib/goRules.ts`                     | `playMove`：落子、提子（单子/群提）、自禁检查                                          |
| SGF 解析器                   | `lib/sgf.ts`                         | `parseSgfMoves`：SGF 字符串 → 坐标序列                                                 |
| 棋谱快照构建                 | `lib/gameSnapshots.ts`               | `buildSnapshots`：从 SGF 落子序列生成每手盘面快照                                      |
| Coach prompt 工厂            | `lib/coachPrompt.ts`                 | 生成 4 语言 system prompt · 注入棋盘 + solution note                                   |
| 教练权限控制                 | `lib/coachAccess.ts`                 | `getCoachAccess()`：curated / approved / restricted 三态判断                           |
| 教练资格检查                 | `lib/coachEligibility.ts`            | `checkCoachEligibility()`：solutionNote 长度与质量检验                                 |
| 教练配额窗口                 | `lib/coachQuota.ts`                  | Free 自然月 / Pro 账单锚点月窗口计算（含 31 日短月回退）                               |
| 教练运行时装配               | `lib/coachState.ts`                  | `getCoachState()`：时区 + 用量聚合 + 设备限制 + entitlements 合成                      |
| 教练 Provider 抽象           | `lib/coachProvider.ts`               | `CoachProvider` 接口 + `ManagedOpenAICompatibleCoachProvider`（BYOK 预留扩展点）       |
| 订阅权限层                   | `lib/entitlements.ts`                | `ViewerPlan` / `Entitlements` / `getEntitlements()`（guest / free / pro 单一真相源）   |
| SRS 排期                     | `lib/srs.ts`                         | SM-2 ease / interval / due_date 计算                                                   |
| SRS 服务端队列修复           | `lib/reviewSrs.ts`                   | `/review` 从 attempts 重建/补写 `srs_cards` 并读取 due 队列                            |
| 设备注册                     | `lib/deviceRegistry.ts`              | `evaluateDeviceAccess()` / `registerDevice()`：Free 单设备评估与拦截                   |
| 登录后合并                   | `lib/mergeOnLogin.ts`                | `planMerge()` / `applyMergeDecision()`：本地 vs 远端 attempts 合并与用户决策           |
| 认证逻辑                     | `lib/auth.ts`                        | 登录状态查询、登出、删号辅助函数                                                       |
| 认证重定向                   | `lib/authRedirect.ts`                | 登录后回跳目标路径计算                                                                 |
| Stripe server 层             | `lib/stripe/server.ts`               | `getStripeClient()` / `getProPriceId()` / `getStripeTrialDays()`                       |
| 日期工具                     | `lib/dateUtils.ts`                   | `todayLocalKey()` 等日期格式化辅助                                                     |
| 错误报告                     | `lib/errorReporting.ts`              | 客户端错误上报封装（`/api/report-error` 的调用端；服务端再转发 Sentry）                |
| 数据导出                     | `lib/exportData.ts`                  | 用户数据导出（JSON 下载）                                                              |
| Prompt 防护                  | `lib/promptGuard.ts`                 | Coach API 输入过滤与安全校验                                                           |
| 题集管理                     | `lib/puzzleCollections.ts`           | 题目分组与精选集逻辑                                                                   |
| 存储完整性                   | `lib/storageIntegrity.ts`            | localStorage 数据校验与修复                                                            |
| 棋盘渲染                     | `components/GoBoard.tsx`             | Canvas 2D · HiDPI · 自动裁剪 · 支持 dark/classic 双主题                                |
| Landing Hero                 | `components/HeroSection.tsx`         | 视差滚动 · 多语言字体适配 · 背景图                                                     |
| 棋盘展示区                   | `components/BoardShowcase.tsx`       | 滚动驱动动画 · AlphaGo 第 4 局「神之一手」演示                                         |
| 演示棋盘                     | `components/DemoGameBoard.tsx`       | 历史棋谱逐手回放 · 阶段切换（idle/showGod/playing/ended）                              |
| 自定义光标                   | `components/GlobalCursor.tsx`        | 全局自定义鼠标光标（霓虹青光晕）                                                       |
| 陪练 UI                      | `components/CoachDialogue.tsx`       | 聊天 · 写 `sessionStorage`（key=`go-daily.coach.${puzzleId}.${locale}`）               |
| 登录卡片（Google + Guest）   | `components/AuthPromptCard.tsx`      | `/login` 与首页弹窗复用；email UI 受 `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN` 控制             |
| 首页登录提醒弹窗             | `components/HomeLoginReminder.tsx`   | 匿名 + 首页 + 首次：3s 浮现；支持 Esc / backdrop / 关闭键；prefers-reduced-motion 降级 |
| 分享卡                       | `components/ShareCard.tsx`           | 1080×1080 PNG 生成 + Web Share                                                         |
| 动态分享图                   | `app/opengraph-image.tsx`            | Next `ImageResponse` 生成 1200×630 OG / Twitter 图片                                   |
| 状态角标                     | `components/PuzzleStatusBadge.tsx`   | 三态小圆：solved / attempted / unattempted                                             |
| 客户端初始化                 | `components/ClientInit.tsx`          | 应用启动时同步队列刷新、设备注册、PostHog 识别                                         |
| 用户菜单                     | `components/UserMenu.tsx`            | 头像下拉菜单（账户 / 登出）                                                            |
| 热力图                       | `components/Heatmap.tsx`             | 做题活跃度日历热力图                                                                   |
| 难度图例                     | `components/DifficultyLegend.tsx`    | 题库页难度色标说明                                                                     |
| PostHog Provider             | `components/PostHogProvider.tsx`     | PostHog 客户端初始化与页面浏览追踪                                                     |

## 样式系统

Tailwind v4，`@theme` 在 `app/globals.css` 集中声明。组件里用 `bg-[color:var(--color-accent)]` 或 `bg-[color:var(--color-accent)]/10` 访问。

色盘（深色围棋主题）：

| token             | 值                          | 用途                |
| ----------------- | --------------------------- | ------------------- |
| `--color-board`   | `#1f1611`                   | 棋盘深色木纹填充    |
| `--color-board-2` | `rgba(0, 242, 255, 0.28)`   | 棋盘格线（霓虹青）  |
| `--color-stone-b` | `#0a0a0a`                   | 黑子                |
| `--color-stone-w` | `#eeeae0`                   | 白子（暖白）        |
| `--color-accent`  | `#00f2ff`                   | 主 accent（霓虹青） |
| `--color-success` | `#22c55e`                   | 对 ✓                |
| `--color-warn`    | `#ff3366`                   | 错 ✗（霓虹红）      |
| `--color-ink`     | `#edeae2`                   | 主文字              |
| `--color-ink-2`   | `rgba(237, 234, 226, 0.55)` | 次文字              |
| `--color-paper`   | `#0a0a0a`                   | 页面底色（深黑）    |
| `--color-line`    | `rgba(255, 255, 255, 0.08)` | 分割线              |
| `--color-linen`   | `#e3dccb`                   | 暖色浅色文字        |
| `--color-earth`   | `#4a3728`                   | 暖棕色              |

GoBoard 支持 `boardStyle` prop（`"dark"` / `"classic"`）：

- `dark`：深色木纹棋盘 + 霓虹青格线（Landing page、首页默认）
- `classic`：传统木色棋盘（题库页等保留原风格）

字体：Inter（拉丁）+ Playfair Display（标题衬线）+ Zhi Mang Xing（中文书法）+ Yuji Syuku（日文毛笔书道）+ Gowun Batang（韩文）+ 系统 CJK fallback 链。

## 构建与脚本

| 命令                        | 作用                                                                            |
| --------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`               | 启本地 dev server（Turbopack）                                                  |
| `npm run build`             | 生产构建。`prebuild` 钩子会先跑 `validate:puzzles`                              |
| `npm run lint`              | ESLint（flat config · Next.js + TypeScript 规则）                               |
| `npm run import:puzzles`    | 拉取 public domain sources 前 100 题，写入 `content/data/classicalPuzzles.json` |
| `npm run sync:puzzle-index` | 从 canonical `PUZZLES` 重新生成 `content/data/puzzleIndex.json`                 |
| `npm run validate:puzzles`  | 硬错校验：重复 ID / 越界 / 缺语言 / 非法枚举（zod schema + 自定义规则）         |
| `npm run audit:puzzles`     | 内容 QA 报告：curated runway、coach readiness、index 一致性                     |
| `npm run queue:content`     | 生成 ranked coach-ready / curated-runway 候选队列                               |
| `npm run supabase:health`   | Supabase 连接健康检查                                                           |
| `npm run format`            | Prettier 格式化全部文件                                                         |
| `npm run format:check`      | Prettier 格式检查（CI 用）                                                      |
| `npm run test`              | Vitest 单元测试（544 tests / 68 files）                                         |

**关键设计**：`prebuild` → `validate:puzzles` 是一层「部署保险」。任何让站点 404 或 crash 的脏数据都会在 `npm run build` 里当场爆，不会上线。

**构建策略**：

- Curated puzzle detail pages（`/{locale}/puzzles/[id]`）在构建时 SSG
- 其余 puzzle detail pages 使用 ISR，`revalidate = 86400`（24h）
- 静态页面总数从 ~4,900 降至 ~300，构建时间显著缩短

## 延伸阅读

- 加题流程 → [`puzzle-authoring.md`](./puzzle-authoring.md)
- 数据 schema → [`data-schema.md`](./data-schema.md)
- 扩展到 1k / 10k 题的路线 → [`extensibility.md`](./extensibility.md)
- 多语言机制 → [`i18n.md`](./i18n.md)
- AI 陪练细节 → [`ai-coach.md`](./ai-coach.md)
- 本地开发 · 提交风格 → [`../CONTRIBUTING.md`](../CONTRIBUTING.md)
