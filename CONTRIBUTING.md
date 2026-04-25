# 贡献指南

> 对应英文版：[CONTRIBUTING.en.md](./CONTRIBUTING.en.md)

---

## 目录

1. [本地开发快速上手](#1-本地开发快速上手)
2. [npm 脚本速查](#2-npm-脚本速查)
3. [项目结构](#3-项目结构)
4. [代码风格](#4-代码风格)
5. [添加题目](#5-添加题目)
6. [添加翻译](#6-添加翻译)
7. [提交 Pull Request](#7-提交-pull-request)
8. [测试](#8-测试)

---

## 1. 本地开发快速上手

### 前置要求

| 工具    | 版本                         |
| ------- | ---------------------------- |
| Node.js | >= 20                        |
| npm     | >= 10（随 Node.js 一起安装） |

### 步骤

```bash
# 1. 克隆仓库
git clone <repo-url>
cd go-daily

# 2. 安装依赖
npm install

# 3. 创建本地环境变量文件（AI 教练需要）
cp .env.example .env.local
# 编辑 .env.local，填入 DEEPSEEK_API_KEY 和可选的 Supabase/PostHog/Sentry 变量

# 4. 启动开发服务器（Turbopack，热更新）
npm run dev
# 访问 http://localhost:3000，middleware 会自动重定向到 /{locale}
```

> **不配置 DEEPSEEK_API_KEY 也能运行**——所有功能正常，只是 AI 教练面板会显示「服务暂不可用」。
> **不配置 Supabase 也能运行**——应用会以匿名模式运行（localStorage 存储）。

### 推荐 VS Code 插件

- **Tailwind CSS IntelliSense** — `@theme` token 自动补全
- **ESLint** — 保存时实时报错
- **Prettier** — 格式化（配置在 `.prettierrc`）

---

## 2. npm 脚本速查

| 命令                        | 说明                                            |
| --------------------------- | ----------------------------------------------- |
| `npm run dev`               | 启动开发服务器（Turbopack，端口 3000）          |
| `npm run build`             | 生产构建（自动触发 `validate:puzzles`）         |
| `npm run start`             | 启动生产服务器（需先 `build`）                  |
| `npm run lint`              | 运行 ESLint                                     |
| `npm run validate:puzzles`  | 验证所有题目数据的完整性                        |
| `npm run sync:puzzle-index` | 从 canonical PUZZLES 重新生成轻量索引           |
| `npm run audit:puzzles`     | 内容 QA 报告（curated runway、coach readiness） |
| `npm run queue:content`     | 生成 ranked content 候选队列                    |
| `npm run supabase:health`   | Supabase 连接健康检查                           |
| `npm run format`            | Prettier 格式化全部文件                         |
| `npm run format:check`      | Prettier 格式检查（CI 用）                      |
| `npm run test`              | Vitest 单元测试 + 组件测试 + API 测试           |
| `npm run test:watch`        | Vitest 监听模式                                 |
| `npm run import:puzzles`    | 从 GitHub SGF 仓库导入经典死活题                |

---

## 3. 项目结构

```
go-daily/
├── app/                      # Next.js App Router 页面和 API
│   ├── [locale]/             # URL-based i18n: /zh/, /en/, /ja/, /ko/
│   │   ├── today/            # 每日一题
│   │   ├── puzzles/          # 题库页和 [id] 动态路由
│   │   ├── result/           # 结果页
│   │   ├── review/           # 复习页
│   │   ├── stats/            # 统计页
│   │   └── about/            # 项目介绍页（原开发者页）
│   ├── api/
│   │   ├── coach/            # AI 教练 Route Handler
│   │   └── report-error/     # 客户端错误上报
│   ├── auth/callback/        # OAuth 回调处理
│   └── manifest.ts           # 动态本地化 PWA manifest
├── components/               # 共享 UI 组件
├── content/
│   ├── messages/             # 四语言翻译 JSON
│   ├── puzzles.ts            # 环境感知数据入口
│   ├── puzzles.server.ts     # 服务端全量数据加载
│   ├── curatedPuzzles.ts     # 手写精选题
│   ├── data/                 # 大数据文件（auto-generated JSON）
│   │   ├── puzzleIndex.json
│   │   ├── classicalPuzzles.json
│   │   └── classicalPuzzles.json
│   └── games/                # 历史棋谱 SGF 数据
├── docs/                     # 项目文档（中英双语）
├── lib/                      # 工具函数
│   ├── supabase/             # client / server / middleware / service
│   ├── posthog/              # client / events
│   ├── localePath.ts         # locale 协商、URL 前缀/剥离
│   ├── syncStorage.ts        # 统一存储（localStorage + IndexedDB + Supabase）
│   ├── mergeOnLogin.ts       # anon -> authed 数据合并
│   ├── deviceId.ts           # per-browser UUID
│   ├── deviceRegistry.ts     # 免费版单设备限制
│   ├── attemptKey.ts         # 标准去重键
│   ├── clientIp.ts           # 真实客户端 IP 提取
│   ├── board / judge / storage / puzzleOfTheDay / i18n
│   ├── coachPrompt / rateLimit / puzzleStatus / goRules / sgf
│   └── gameSnapshots / siteUrl / exportData / storageIntegrity
├── scripts/                  # 构建脚本（验证、导入、审计、队列）
├── supabase/
│   └── migrations/0001_init.sql  # 数据库 schema
├── types/                    # 全局 TypeScript 类型定义 + zod schema
├── public/                   # 静态资产
└── proxy.ts                  # Next.js middleware: locale negotiation + Supabase session refresh
```

完整架构说明见 [docs/architecture.md](./docs/architecture.md)。

---

## 4. 代码风格

### TypeScript

- **strict 模式**（`tsconfig.json`），不允许 `any`（特殊情况需注释说明）
- 路径别名：`@/*` 映射到项目根目录，避免 `../../../` 相对路径
- 类型定义集中在 `types/index.ts`，不分散在各文件
- 新增 zod schema 统一放在 `types/schemas.ts`

### React

- 涉及浏览器 API（`localStorage`、`sessionStorage`、`window`）的逻辑只在客户端运行：
  - 标记 `"use client"` 的组件文件
  - 或 `useEffect` 内部（服务端渲染阶段跳过）
- 纯函数（如 `lib/puzzleStatus.ts`）不得 import `window`——便于测试

### i18n

- UI 文案统一通过 `useLocale()` 的 `t` 对象访问
- 题目 `prompt` / `solutionNote` 字段统一用 `localized(text, locale)`，不直接索引
- 新增翻译 key 必须同时更新 4 个语言文件
- 路由使用 `LocalizedLink` 组件自动加 locale 前缀，不要硬编码 `/{locale}/...`

### 样式

- 使用 Tailwind v4 的 `@theme` token（定义在 `app/globals.css`）
- 不使用内联 `style={{}}`（除非需要动态计算的值，如 canvas 尺寸）
- 颜色、间距等设计 token 优先复用已有变量

---

## 5. 添加题目

### 手动添加（精选题）

1. 在 `content/curatedPuzzles.ts` 中添加一个 `Puzzle` 对象
2. 运行 `npm run validate:puzzles` 验证
3. 详细字段说明见 [docs/puzzle-authoring.md](./docs/puzzle-authoring.md)

### 批量导入（SGF）

```bash
# 将 SGF 文件放入 scripts/sgf/
npm run import:puzzles
```

输出写入 `content/data/classicalPuzzles.json`（带 auto-generated 横幅，不要手改）。

批量导入的题目建议设 `isCurated: false`（禁用 AI 教练，防止幻觉）。

---

## 6. 添加翻译

1. 在 `content/messages/en.json` 中添加新 key（类型权威文件）
2. 在 `zh.json`、`ja.json`、`ko.json` 中添加对应翻译
3. TypeScript 会在编译时验证所有语言文件结构一致

详见 [docs/i18n.md](./docs/i18n.md)。

---

## 7. 提交 Pull Request

1. 从 `main` 分支新建功能分支：`git checkout -b feat/my-feature`
2. 本地完成开发，确保以下全部通过：
   ```bash
   npm run format:check        # Prettier 格式检查通过
   npm run lint                # 无 ESLint 报错
   npm run test                # 单元测试全绿（199/38）
   npm run validate:puzzles    # 题目数据验证通过
   npm run build               # 生产构建成功
   ```
3. 提交 PR，描述中说明：
   - 改了什么
   - 为什么改
   - 如何测试（截图或操作步骤）

---

## 8. 测试

项目使用 **Vitest** 进行单元测试，覆盖核心纯函数、组件和 API：

```bash
npm run test       # 运行全部测试
npm run test:watch # 监听模式
```

现有测试文件：

| 文件                                      | 覆盖内容                                    |
| ----------------------------------------- | ------------------------------------------- |
| `lib/board.test.ts`                       | `coordEquals` / `isInBounds` / `starPoints` |
| `lib/judge.test.ts`                       | 正解/非正解/多正解判断                      |
| `lib/goRules.test.ts`                     | 提子算法（单子提、群提、不自提）            |
| `lib/sgf.test.ts`                         | SGF 坐标解析、分支跳过                      |
| `lib/puzzleOfTheDay.test.ts`              | 每日轮换算法                                |
| `lib/storage.test.ts`                     | localStorage 读写与序列化                   |
| `lib/mergeOnLogin.test.ts`                | anon -> authed 数据合并决策                 |
| `lib/deviceRegistry.test.ts`              | 免费版单设备限制评估                        |
| `lib/localePath.test.ts`                  | locale 协商、URL 前缀/剥离                  |
| `tests/api/coach.test.ts`                 | Coach API 请求校验、限流、错误码            |
| `tests/components/CoachDialogue.test.tsx` | CoachDialogue 渲染与交互                    |
| `tests/components/GoBoard.test.tsx`       | GoBoard canvas 渲染与点击坐标               |

---

_相关文档：[docs/architecture.md](./docs/architecture.md) · [docs/puzzle-authoring.md](./docs/puzzle-authoring.md) · [docs/i18n.md](./docs/i18n.md)_
