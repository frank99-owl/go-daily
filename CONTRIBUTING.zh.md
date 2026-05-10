# 贡献指南

**语言：** [中文（本页）](CONTRIBUTING.zh.md) · [English](CONTRIBUTING.md)

感谢你对 go-daily 的关注。我们保持较高的工程标准，以确保在 4 种语言和全球市场中提供稳定一致的用户体验。

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
cp .env.example .env.local
npm install
npm run dev
```

请使用 `package.json` 中声明的 Node.js **22.5+**。本地匿名模式可以不配置 Supabase 项目；支付、登录、同步、邮件和生产安全流程需要 `.env.example` 中对应的环境变量。

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

### PR 前检查

发起 PR 前请尽量在本地执行与 CI 对齐的检查：

```bash
npm run format:check
npm run lint
npm run validate:puzzles
npm run validate:messages
npx tsc --noEmit
npm run test
npm run build
```

## 4. Commit 规范

我们遵循 Conventional Commits 规范：

- `feat`: 新功能
- `fix`: 修补 Bug
- `docs`: 文档变更
- `refactor`: 代码重构（既不修复 Bug 也不添加功能）
- `chore`: 构建过程或辅助工具的变动

## 5. 提交 PR

1. Fork 本仓库；如果你有直接权限，也可以从 `main` 创建功能分支。
2. 保持 PR 聚焦在一个变更或一组紧密相关的变更上。
3. 为任何新逻辑包含测试。
4. 如果你修改了核心行为，请同步更新 `docs/` 中的文档。
5. 确认“PR 前检查”通过；如有命令无法运行，请在 PR 中说明。

## 6. 贡献授权

本仓库当前采用源码可见、限制竞争性使用的许可证。提交 PR、补丁或其他贡献即表示你确认自己有权贡献这些内容，并授权 Frank 以永久、全球、免版税的方式在 go-daily 项目中使用、修改、再授权和分发这些贡献，包括根据公开的源码可见许可证以及 Frank 单独授予的商业授权使用。

请勿提交保密的第三方代码、未经授权的题库内容、版权素材或你无权贡献的数据。如果项目未来调整许可证条款，本节应与许可证文本一起复核。

(C) 2026 Frank.
