# go-daily 生产部署手册

> English version: [deployment.en.md](./deployment.en.md)

---

## 目录

1. [适用范围](#1-适用范围)
2. [部署前准备](#2-部署前准备)
3. [环境变量清单](#3-环境变量清单)
4. [Vercel 部署步骤](#4-vercel-部署步骤)
5. [持久化限流配置（可选）](#5-持久化限流配置可选)
6. [部署后验证](#6-部署后验证)
7. [常见问题排查](#7-常见问题排查)
8. [回滚方案](#8-回滚方案)

---

## 1. 适用范围

本文档面向**将 go-daily 部署到 Vercel 生产环境**的操作人员。按本文档执行后，站点应达到"低流量公开可用"状态。

**当前代码基线的生产就绪状态**（截至 2026-04-21）：

| 能力                         | 状态      | 说明                                            |
| ---------------------------- | --------- | ----------------------------------------------- |
| 核心功能（做题、题库、统计） | ✅ 可用   | 无需额外配置即可工作                            |
| AI 教练                      | ✅ 可用   | 需配置 `DEEPSEEK_API_KEY`                       |
| 限流                         | ✅ 可用   | 默认 `MemoryRateLimiter`；配置 Upstash 后持久化 |
| 观测                         | ✅ 已接入 | `Vercel Analytics` + `Speed Insights`           |
| Sentry                       | ❌ 未接入 | 本轮明确不上                                    |

---

## 2. 部署前准备

### 2.1 前置条件

| 项               | 要求              |
| ---------------- | ----------------- |
| 代码仓库         | GitHub 仓库已推送 |
| Vercel 账号      | 已有 Vercel 账号  |
| DeepSeek API Key | 已有有效密钥      |

### 2.2 本地预检（在提交部署前执行）

```bash
npm run format:check   # Prettier 格式检查通过
npm run lint           # ESLint 无报错
npm run test           # 全部测试通过（49/49）
npm run validate:puzzles  # 题目数据校验通过
npm run build          # 生产构建成功
```

> 任何一步失败都应在本地修复后再部署。

---

## 3. 环境变量清单

**以下变量在 Vercel 项目 Settings → Environment Variables 中配置，三个环境（Production / Preview / Development）全部勾选。**

### 核心变量

| 变量名                 | 必填 | 默认值                        | 说明                                          |
| ---------------------- | ---- | ----------------------------- | --------------------------------------------- |
| `DEEPSEEK_API_KEY`     | ✅   | —                             | DeepSeek API 密钥，AI 教练功能依赖            |
| `NEXT_PUBLIC_SITE_URL` | —    | `https://go-daily.vercel.app` | 生产域名，用于 canonical URL、robots、sitemap |

### AI 教练变量

| 变量名        | 必填 | 默认值          | 说明                    |
| ------------- | ---- | --------------- | ----------------------- |
| `COACH_MODEL` | —    | `deepseek-chat` | AI 教练使用的模型标识符 |

### 限流变量

| 变量名                     | 必填 | 默认值  | 说明                                         |
| -------------------------- | ---- | ------- | -------------------------------------------- |
| `RATE_LIMIT_WINDOW_MS`     | —    | `60000` | 限流窗口（毫秒）                             |
| `RATE_LIMIT_MAX`           | —    | `10`    | 每窗口每 IP 最大请求数                       |
| `UPSTASH_REDIS_REST_URL`   | —    | —       | Upstash Redis REST URL，配置后启用持久化限流 |
| `UPSTASH_REDIS_REST_TOKEN` | —    | —       | Upstash Redis REST Token                     |

> 当 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN` 同时配置时，限流自动切换为 `UpstashRateLimiter`，实现跨实例共享的持久化限流。否则使用 `MemoryRateLimiter`（进程内存，单实例有效）。

---

## 4. Vercel 部署步骤

### Step 1：导入项目

1. 登录 Vercel Dashboard
2. 点击 "Add New Project"
3. 选择 go-daily 的 GitHub 仓库
4. Framework Preset 选择 **Next.js**

### Step 2：配置环境变量

在 "Configure Project" 页面：

1. 添加 `DEEPSEEK_API_KEY`，值为你的 DeepSeek API 密钥
2. 添加 `NEXT_PUBLIC_SITE_URL`，值为你的生产域名（如 `https://go-daily.vercel.app`）
3. 可选：添加 `COACH_MODEL`（默认 `deepseek-chat`）
4. 可选：添加 `RATE_LIMIT_WINDOW_MS` 和 `RATE_LIMIT_MAX`
5. 可选：添加 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`（如需持久化限流）
6. 确保三个环境（Production / Preview / Development）全部勾选

### Step 3：部署

点击 "Deploy"。Vercel 会自动执行 `npm run build`（包含 `prebuild` 钩子里的 `validate:puzzles`）。

构建成功后会获得一个 Production URL（如 `https://go-daily.vercel.app`）。

### Step 4：验证域名（如有自定义域名）

如需绑定自定义域名：

1. Vercel Dashboard → 项目 → Settings → Domains
2. 添加域名并按提示配置 DNS
3. 等待 SSL 证书自动签发（通常 1-2 分钟）

---

## 5. 持久化限流配置（可选）

**默认行为**：未配置 Upstash 时，使用 `MemoryRateLimiter`，限流状态保存在进程内存中。这对于单实例或低流量场景已足够。

**何时需要 Upstash**：Vercel Serverless 多实例部署时，每个实例有独立的计数器。如果你需要严格的跨实例限流，配置 Upstash Redis。

### 5.1 准备 Redis 实例

1. 注册 [Upstash](https://upstash.com/) 账号
2. 创建一个 Redis 数据库
3. 记录 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`

### 5.2 配置环境变量

在 Vercel 中添加：

```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

无需修改代码——`lib/rateLimit.ts` 中的 `createRateLimiter()` 工厂函数会自动检测这些环境变量并切换实现。

> **故障降级**：若 Redis 连接异常（网络超时、实例不可用），`app/api/coach/route.ts` 会捕获限流错误并在日志中输出 `[RateLimitError]`，随后继续处理请求（fail-open）。这意味着 Redis 故障时 AI 教练服务仍可用，但限流暂时失效。

### 5.3 验证

快速发送 11 次 `/api/coach` 请求，确认第 11 次返回 429（无论打到哪个实例）。

---

## 6. 部署后验证

### 6.1 基础功能检查清单

| 检查项   | 操作                        | 期望结果                          |
| -------- | --------------------------- | --------------------------------- |
| 首页加载 | 打开 `/`                    | 页面正常渲染，无 500/404          |
| 每日一题 | 打开 `/today`               | 棋盘渲染，可落子                  |
| 判题     | 在 `/today` 点击正确/错误点 | 正确跳转 `/result`，显示对/错横幅 |
| 题库     | 打开 `/puzzles`             | 题库列表加载，可筛选/搜索         |
| 统计     | 打开 `/stats`               | 连胜/准确率/热力图正常显示        |
| AI 教练  | 在 `/result` 点击教练按钮   | 可对话，回复与题目相关            |

### 6.2 API 验证

```bash
# 测试健康状态（直接访问首页）
curl -s -o /dev/null -w "%{http_code}" https://your-domain.com/
# 期望：200

# 测试教练 API（合法请求）
curl -X POST https://your-domain.com/api/coach \
  -H "Content-Type: application/json" \
  -d '{
    "puzzleId": "cld-001",
    "locale": "zh",
    "userMove": {"x": 18, "y": 0},
    "isCorrect": true,
    "history": [{"role": "user", "content": "为什么这一步是对的？", "ts": 0}]
  }'
# 期望：200，返回 {"reply": "..."}

# 测试限流（快速发送 11 次）
for i in {1..11}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://your-domain.com/api/coach \
    -H "Content-Type: application/json" \
    -d '{"puzzleId":"test","locale":"zh","userMove":{"x":0,"y":0},"isCorrect":true,"history":[{"role":"user","content":"test","ts":0}]}'
done
# 期望：前 10 次 200 或 404，第 11 次 429
```

### 6.3 环境变量生效检查

```bash
# 检查 NEXT_PUBLIC_SITE_URL 是否生效
curl -s https://your-domain.com/ | grep -i "og:url\|canonical"
# 应看到你的生产域名，而非默认值
```

---

## 7. 常见问题排查

### Q1: 构建失败

**现象**：Vercel 构建日志显示 `validate:puzzles` 报错。

**排查**：

```bash
# 本地复现
npm run validate:puzzles
```

常见原因：

- `content/data/importedPuzzles.json` 损坏
- 手动编辑 curatedPuzzles.ts 后格式错误
- 多语言字段缺失

### Q2: AI 教练返回 500

**现象**：`/result` 页点击教练后显示「服务暂不可用」。

**排查**：

1. Vercel Dashboard → 项目 → Settings → Environment Variables
2. 确认 `DEEPSEEK_API_KEY` 已配置且三个环境全部勾选
3. 查看 Vercel Runtime Logs（Functions 标签）确认错误详情

### Q3: 限流不生效 / 时紧时松

**现象**：快速发送请求，有时被 429 有时通过。

**原因**：未配置 Upstash 时，`MemoryRateLimiter` 不跨实例共享。Vercel Serverless 的负载均衡会把请求分发到不同实例，每个实例有独立的计数器。

**解决**：如需严格限流，按第 5 节配置 Upstash Redis。

### Q4: 页面 404

**现象**：除首页外所有页面 404。

**原因**：Vercel 的 Framework Preset 可能没选对，或者 `next.config.js` 配置有误。

**解决**：

1. 确认 Framework Preset 为 Next.js
2. 检查 Build Command 是否为 `npm run build`
3. Output Directory 应为 `.next`

### Q5: 自定义域名 HTTPS 不生效

**现象**：域名已绑定但浏览器显示不安全。

**解决**：

1. 确认 DNS 记录已指向 Vercel（CNAME 或 A 记录）
2. Vercel Dashboard → Domains 中查看状态
3. SSL 证书自动签发，通常 1-2 分钟内完成

---

## 8. 回滚方案

### 8.1 代码回滚（部署了有问题的代码）

**方式一：Vercel Dashboard 回滚**

1. Vercel Dashboard → 项目 → Deployments
2. 找到上一个正常版本的 Deployment
3. 点击 "..." → "Promote to Production"

**方式二：Git 回滚 + 重新部署**

```bash
git revert HEAD  # 或 git reset --hard <last-good-commit>
git push origin main
# Vercel 会自动重新部署
```

### 8.2 环境变量回滚

如果问题由环境变量变更引起：

1. Vercel Dashboard → Settings → Environment Variables
2. 修改/删除有问题的变量
3. 触发重新部署（可以 push 一个空 commit）

```bash
git commit --allow-empty -m "trigger: redeploy"
git push origin main
```

### 8.3 紧急下线

如需立即停止服务：

1. Vercel Dashboard → 项目 → Settings → General
2. 点击 "Pause" 暂停项目
3. 或删除自定义域名的 DNS 记录

---

_相关文档：[README.md](../README.md) · [architecture.md](./architecture.md) · [ai-coach.md](./ai-coach.md)_
