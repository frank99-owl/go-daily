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
8. [测试（TODO）](#8-测试todo)

---

## 1. 本地开发快速上手

### 前置要求

| 工具 | 版本 |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10（随 Node.js 一起安装） |

### 步骤

```bash
# 1. 克隆仓库
git clone <repo-url>
cd go-daily

# 2. 安装依赖
npm install

# 3. 创建本地环境变量文件（AI 教练需要）
cp .env.example .env.local
# 编辑 .env.local，填入 DEEPSEEK_API_KEY

# 4. 启动开发服务器（Turbopack，热更新）
npm run dev
# 访问 http://localhost:3000
```

> **不配置 DEEPSEEK_API_KEY 也能运行**——所有功能正常，只是 AI 教练面板会显示「服务暂不可用」。

### 推荐 VS Code 插件

- **Tailwind CSS IntelliSense** — `@theme` token 自动补全
- **ESLint** — 保存时实时报错
- **Prettier** — 格式化（项目使用 `eslint-config-next` 内置规则，无单独 `.prettierrc`）

---

## 2. npm 脚本速查

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发服务器（Turbopack，端口 3000） |
| `npm run build` | 生产构建（自动触发 `validate:puzzles`） |
| `npm run start` | 启动生产服务器（需先 `build`） |
| `npm run lint` | 运行 ESLint |
| `npm run validate:puzzles` | 验证所有题目数据的完整性 |
| `npm run import:puzzles` | 从 GitHub SGF 仓库导入经典死活题 |

---

## 3. 项目结构

```
go-daily/
├── app/                  # Next.js App Router 页面和 API
│   ├── api/coach/        # AI 教练 Route Handler
│   ├── puzzles/          # 题库页和 [id] 动态路由
│   ├── result/           # 结果页
│   ├── review/           # 复习页
│   └── stats/            # 统计页
├── components/           # 共享 UI 组件
├── content/
│   ├── messages/         # 四语言翻译 JSON
│   └── puzzles/          # 题目数据（TypeScript）
├── docs/                 # 项目文档（中英双语）
├── lib/                  # 工具函数（i18n、storage、coach、localized 等）
├── scripts/              # 构建脚本（验证、导入）
├── types/                # 全局 TypeScript 类型定义
└── public/               # 静态资产
```

完整架构说明见 [docs/architecture.md](./docs/architecture.md)。

---

## 4. 代码风格

### TypeScript

- **strict 模式**（`tsconfig.json`），不允许 `any`（特殊情况需注释说明）
- 路径别名：`@/*` 映射到项目根目录，避免 `../../../` 相对路径
- 类型定义集中在 `types/index.ts`，不分散在各文件

### React

- 涉及浏览器 API（`localStorage`、`sessionStorage`、`window`）的逻辑只在客户端运行：
  - 标记 `"use client"` 的组件文件
  - 或 `useEffect` 内部（服务端渲染阶段跳过）
- 纯函数（如 `lib/puzzleStatus.ts`）不得 import `window`——便于测试

### i18n

- UI 文案统一通过 `useLocale()` 的 `t` 对象访问
- 题目 `prompt` / `solutionNote` 字段统一用 `localized(text, locale)`，不直接索引
- 新增翻译 key 必须同时更新 4 个语言文件

### 样式

- 使用 Tailwind v4 的 `@theme` token（定义在 `app/globals.css`）
- 不使用内联 `style={{}}`（除非需要动态计算的值，如 canvas 尺寸）
- 颜色、间距等设计 token 优先复用已有变量

---

## 5. 添加题目

### 手动添加（精选题）

1. 在 `content/puzzles/index.ts` 中添加一个 `Puzzle` 对象
2. 运行 `npm run validate:puzzles` 验证
3. 详细字段说明见 [docs/puzzle-authoring.md](./docs/puzzle-authoring.md)

### 批量导入（SGF）

```bash
# 将 SGF 文件放入 scripts/sgf/
npm run import:puzzles
```

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
   npm run lint          # 无 ESLint 报错
   npm run validate:puzzles  # 题目数据验证通过
   npm run build         # 生产构建成功
   ```
3. 提交 PR，描述中说明：
   - 改了什么
   - 为什么改
   - 如何测试（截图或操作步骤）

---

## 8. 测试（TODO）

> ⚠️ 当前项目**没有**自动化测试套件。这是已知的技术债务。

优先补充的测试方向：

| 层级 | 目标模块 | 推荐框架 |
|---|---|---|
| 单元测试 | `lib/puzzleStatus.ts`（纯函数） | Vitest |
| 单元测试 | `lib/localized.ts`（回退逻辑） | Vitest |
| 单元测试 | `scripts/validatePuzzles.ts`（验证规则） | Vitest |
| 组件测试 | `GoBoard`（canvas 渲染） | Playwright / Storybook |
| E2E 测试 | 首页落子 → 结果页流程 | Playwright |

贡献测试代码非常欢迎！

---

*相关文档：[docs/architecture.md](./docs/architecture.md) · [docs/puzzle-authoring.md](./docs/puzzle-authoring.md) · [docs/i18n.md](./docs/i18n.md)*
