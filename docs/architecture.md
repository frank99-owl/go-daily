# 架构总览

> English version: [architecture.en.md](./architecture.en.md)

一张纸看懂 go-daily 怎么组织起来的：层边界在哪、数据怎么流、谁调谁。

## 技术栈速览

| 层   | 选型                                                 | 说明                                                              |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| 框架 | Next.js 16 (App Router, Turbopack)                   | 全部走 App Router；server component 为默认，`"use client"` 为显式 |
| 语言 | TypeScript strict                                    | `tsconfig.json` 打开 strict，`noImplicitAny` 等默认生效           |
| UI   | React 19 + Tailwind v4 + Framer Motion               | Tailwind v4 新 `@theme` 语法在 `app/globals.css`                  |
| 图标 | lucide-react                                         | 已接入 Shuffle / ChevronLeft / ChevronRight / Play / Check 等     |
| LLM  | DeepSeek `deepseek-chat`（OpenAI 兼容 SDK）          | 通过 `app/api/coach/route.ts` 代理                                |
| 状态 | `localStorage`（战绩）+ `sessionStorage`（陪练对话） | 零后端 · 不用账号系统                                             |

## 层次结构

```
┌─────────────────────────────────────────────────────────────┐
│  middleware.ts  请求拦截（i18n cookie → header 转发）         │
│  app/           路由 · 页面组件（Server / Client 分明）        │
│  components/    UI 复用单元（GoBoard · ShareCard · Nav …）    │
│  lib/           纯逻辑层（board · judge · storage · i18n …）  │
│  content/       数据（puzzles.ts · messages/*.json · games/） │
│  types/         类型定义（Puzzle · AttemptRecord · …）        │
│  scripts/       构建 / 作者工具（importTsumego · validatePuzzles）│
└─────────────────────────────────────────────────────────────┘
```

**依赖方向**：`middleware` → `app` → `components` → `lib` → `types`/`content`。反向依赖是禁区。

## 路由表

| 路由            | Server 组件                 | Client 组件                        | 作用                                                                        |
| --------------- | --------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| `/`             | `app/page.tsx`              | `HeroSection` + `BoardShowcase`    | Landing page：视差滚动 + AlphaGo 第 4 局演示                                |
| `/today`        | `app/today/page.tsx`        | `app/TodayClient.tsx`              | 每日一题：拿 `getPuzzleForDate(todayLocalKey())`，交给 `TodayClient` 做交互 |
| `/puzzles`      | `app/puzzles/page.tsx`      | `app/puzzles/PuzzleListClient.tsx` | 全量题库：筛选 / 排序 / 搜索                                                |
| `/puzzles/[id]` | `app/puzzles/[id]/page.tsx` | 复用 `TodayClient`                 | 按 ID 打开一题；`generateStaticParams()` 覆盖全量 `PUZZLES`                 |
| `/result`       | `app/result/page.tsx`       | `app/result/ResultClient.tsx`      | 判题后的回显：对/错横幅、解答播放、AI 陪练、分享卡                          |
| `/review`       | `app/review/page.tsx`       | `app/review/ReviewClient.tsx`      | 错题本：`attempted` 状态按最近尝试时间倒序                                  |
| `/stats`        | `app/stats/page.tsx`        | `app/stats/StatsClient.tsx`        | 战绩：连胜 · 正确率 · 总量 · 热力图                                         |
| `/developer`    | `app/developer/page.tsx`    | —                                  | 开发者页                                                                    |
| `/api/coach`    | `app/api/coach/route.ts`    | —                                  | LLM 代理（POST JSON）                                                       |

**Server vs Client 分界约定**：`page.tsx` 尽量只做「取 puzzle · 构造 props · 传给 Client 组件」，重活都在 `*Client.tsx` 里。因为需要读 `localStorage`，所有带历史/偏好的交互都必然是 client 组件。

## 核心数据流

### 做一道题（落子 → 判题 → 结果页）

入口可以是 `/today`（每日一题）或直接通过 `/puzzles/[id]` 打开特定题目：

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
       ↓                    ← lib/storage.ts，追加到 localStorage
 router.push(`/result?id=${puzzle.id}`)
       ↓
 ResultClient 读 URL id → PUZZLES.find → 渲染
       ├─ getAttemptFor(id)       // 最近一次（对/错横幅）
       └─ getAttemptsFor(id)      // 累计历史（第 N 次 · 对 X 错 Y）
```

### 每日一题（日期 → 轮换索引 → 具体题目）

`lib/puzzleOfTheDay.ts` 用"日期 → 索引"模子：

1. `todayLocalKey()` 返回本地 `YYYY-MM-DD`
2. `getPuzzleForDate(date)` 用 `date - ROTATION_ANCHOR`（锚点 `2026-04-18`）得到天偏移
3. 对 `PUZZLES.length` 取模，稳定拿到当天那道

**不再匹配 `puzzle.date` 字段** —— 导入题的 `date` 是占位符，不该参与调度。纯靠模数算法；到达末尾自动循环。

### 读历史战绩（`/stats` 与 `/review`）

所有页面共用同一条数据管道：

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

关键约定：`lib/puzzleStatus.ts` **不 import `window`**，所有函数都是 `AttemptRecord[] → X` 的纯函数。这样 SSR 安全、可单元测试、可在 server component 里复用（虽然目前没这样用）。

## 关键模块坐标

| 模块                 | 路径                               | 一句话                                                              |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| 全量题库             | `content/puzzles.ts`               | 导出 `PUZZLES` · `getPuzzleById()` · `getCuratedPuzzles()`          |
| 导入题集（自动生成） | `content/data/importedPuzzles.ts`  | `scripts/importTsumego.ts` 产出，不要手改                           |
| 历史棋谱数据         | `content/games/leeAlphagoG4.ts`    | 李世石 vs AlphaGo 第 4 局 SGF + 元数据（「神之一手」）              |
| 类型                 | `types/index.ts`                   | `Puzzle` / `AttemptRecord` / `PuzzleStatus` / `Locale` 等           |
| localStorage 读写    | `lib/storage.ts`                   | `loadAttempts` / `saveAttempt` / `getAttemptFor` / `getAttemptsFor` |
| 状态派生             | `lib/puzzleStatus.ts`              | 纯函数，消费 attempts 数组                                          |
| 判题                 | `lib/judge.ts`                     | 一行：查 `puzzle.correct[]` 是否命中                                |
| 每日轮换             | `lib/puzzleOfTheDay.ts`            | `getPuzzleForDate` + `todayLocalKey`                                |
| 随机抽题             | `lib/random.ts`                    | `pickRandomPuzzle(pool: "all"│"unattempted"│"wrong")`               |
| 棋盘几何             | `lib/board.ts`                     | `isInBounds` / `isOccupied` / `starPoints`                          |
| 围棋规则引擎         | `lib/goRules.ts`                   | `playMove`：落子、提子（单子/群提）、自禁检查                       |
| SGF 解析器           | `lib/sgf.ts`                       | `parseSgfMoves`：SGF 字符串 → 坐标序列                              |
| 棋谱快照构建         | `lib/gameSnapshots.ts`             | `buildSnapshots`：从 SGF 落子序列生成每手盘面快照                   |
| 多语言文本           | `lib/i18n.tsx`                     | `localized(text, locale)` 自带 en→zh→ja→ko fallback                 |
| i18n context         | `lib/i18n.tsx`                     | `LocaleProvider` + `useLocale()` · 存 `go-daily.locale`             |
| i18n middleware      | `middleware.ts`                    | cookie `go-daily.locale` → `x-locale` header，消除 SSR 语言闪烁     |
| Coach prompt 工厂    | `lib/coachPrompt.ts`               | 生成 4 语言 system prompt · 注入棋盘 + solution note                |
| 棋盘渲染             | `components/GoBoard.tsx`           | Canvas 2D · HiDPI · 自动裁剪 · 支持 dark/classic 双主题             |
| Landing Hero         | `components/HeroSection.tsx`       | 视差滚动 · 多语言字体适配 · 背景图                                  |
| 棋盘展示区           | `components/BoardShowcase.tsx`     | 滚动驱动动画 · AlphaGo 第 4 局「神之一手」演示                      |
| 演示棋盘             | `components/DemoGameBoard.tsx`     | 历史棋谱逐手回放 · 阶段切换（idle/showGod/playing/ended）           |
| 自定义光标           | `components/GlobalCursor.tsx`      | 全局自定义鼠标光标（霓虹青光晕）                                    |
| 陪练 UI              | `components/CoachDialogue.tsx`     | 聊天 · 写 `sessionStorage`（key=puzzleId+locale）                   |
| 分享卡               | `components/ShareCard.tsx`         | 1080×1080 PNG 生成 + Web Share                                      |
| 状态角标             | `components/PuzzleStatusBadge.tsx` | 三态小圆：solved / attempted / unattempted                          |

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

字体：Inter（拉丁）+ Playfair Display（标题衬线）+ Zhi Mang Xing（中文书法）+ Klee One（日文）+ Gowun Batang（韩文）+ 系统 CJK fallback 链。

## 构建与脚本

| 命令                       | 作用                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`              | 启本地 dev server（Turbopack）                                            |
| `npm run build`            | 生产构建。`prebuild` 钩子会先跑 `validate:puzzles`                        |
| `npm run lint`             | ESLint（flat config · Next.js + TypeScript 规则）                         |
| `npm run import:puzzles`   | 拉取 sanderland/tsumego 前 100 题，写入 `content/data/importedPuzzles.ts` |
| `npm run validate:puzzles` | 硬错校验：重复 ID / 越界 / 缺语言 / 非法枚举                              |
| `npm run format`           | Prettier 格式化全部文件                                                   |
| `npm run format:check`     | Prettier 格式检查（CI 用）                                                |
| `npm run test`             | Vitest 单元测试（board / judge / goRules / sgf）                          |

**关键设计**：`prebuild` → `validate:puzzles` 是一层「部署保险」。任何让站点 404 或 crash 的脏数据都会在 `npm run build` 里当场爆，不会上线。

## 延伸阅读

- 加题流程 → [`puzzle-authoring.md`](./puzzle-authoring.md)
- 数据 schema → [`data-schema.md`](./data-schema.md)
- 扩展到 1k / 10k 题的路线 → [`extensibility.md`](./extensibility.md)
- 多语言机制 → [`i18n.md`](./i18n.md)
- AI 陪练细节 → [`ai-coach.md`](./ai-coach.md)
- 本地开发 · 提交风格 → [`../CONTRIBUTING.md`](../CONTRIBUTING.md)
