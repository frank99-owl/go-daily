# 贡献指南

感谢你对 go-daily 的关注！我们保持着极高的工程标准，以确保在 4 种语言和全球市场中提供无缝的用户体验。

## 1. 开发原则

- **领域驱动逻辑**：所有核心业务逻辑必须位于 `lib/` 下的相应领域中（例如 `lib/coach/`, `lib/storage/`）。避免逻辑泄露到 UI 组件中。
- **类型安全**：我们使用严格的 TypeScript。所有共享数据结构必须派生自 `types/schemas.ts` 中的 Zod Schema。
- **外科手术式修改**：倾向于聚焦且最小化的改动。如果你发现了无关的 Bug，请另开一个 Issue/PR。

## 2. 目录结构规范

添加新功能时，请遵循”九域分域”模式：

- `lib/auth/`: 身份验证与会话管理。
- `lib/board/`: 围棋规则、SGF 解析、棋盘渲染与落子校验。
- `lib/coach/`: AI 提示词工程与配额逻辑。
- `lib/i18n/`: 国际化文本与路径协商。
- `lib/puzzle/`: 题目加载、元数据与状态。
- `lib/storage/`: 分层持久化（LocalStorage, IndexedDB, Supabase）。
- `lib/posthog/`: 服务端分析事件追踪。
- `lib/stripe/`: Stripe SDK 封装与计费逻辑。
- `lib/supabase/`: Supabase 客户端初始化与辅助函数。

## 3. 工作流

### 本地设置

```bash
npm install
npm run dev
```

### 国际化校验

提交前，请确保 4 种语言的 Key 完全一致：

```bash
npm run validate:messages
```

### 测试

我们使用 Vitest。所有逻辑变动都要求编写单元测试。

```bash
npm run test          # 运行所有测试
npm run test:coverage # 检查覆盖率（目标：70%+）
```

## 4. Commit 规范

我们遵循 Conventional Commits 规范：

- `feat`: 新功能
- `fix`: 修补 Bug
- `docs`: 文档变更
- `refactor`: 代码重构（既不修复 Bug 也不添加功能）
- `chore`: 构建过程或辅助工具的变动

## 5. 提交 PR

1.  Fork 本仓库并从 `main` 分支创建你的功能分支。
2.  确保 `npm run prebuild` 通过（校验题库数据与四套语言的文案 Key）。发起 PR 前请在本地执行 `npm run lint` —— CI 还会跑格式检查、Lint、类型检查、测试与生产构建。
3.  为任何新逻辑包含测试。
4.  如果你修改了核心行为，请同步更新 `docs/` 中的文档。

(C) 2026 Frank.
