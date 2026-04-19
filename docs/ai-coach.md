# AI 教练文档

> 对应英文版：[ai-coach.en.md](./ai-coach.en.md)

---

## 目录

1. [功能概述](#1-功能概述)
2. [API 接口规范](#2-api-接口规范)
3. [系统 Prompt 构建](#3-系统-prompt-构建)
4. [模型配置](#4-模型配置)
5. [速率限制](#5-速率限制)
6. [会话存储](#6-会话存储)
7. [`isCurated` 门控](#7-iscurated-门控)
8. [错误处理](#8-错误处理)
9. [环境变量](#9-环境变量)
10. [安全考量](#10-安全考量)

---

## 1. 功能概述

AI 教练是一个基于 DeepSeek 大模型的围棋辅导对话功能，在**结果页**（`app/result/`）展示，帮助用户理解自己的落子是否正确以及背后的棋理。

**功能特点**：

- 4 语言回复（根据用户当前界面语言）
- 知道用户的落点和对错——不要用户重复描述
- 系统 prompt 注入基准事实（正确答案、解法序列、错误变化），防止幻觉
- 采用苏格拉底式引导：正确时鼓励深入，错误时诊断误读、给出提示而非直接答案
- 每标签页生命周期的对话历史（sessionStorage）

---

## 2. API 接口规范

### 端点

```
POST /api/coach
Content-Type: application/json
```

### 请求体

```ts
type CoachRequest = {
  puzzleId: string; // 题目 ID，必须存在于 PUZZLES 数组
  locale: "zh" | "en" | "ja" | "ko";
  userMove: { x: number; y: number }; // 用户落点（0-indexed）
  isCorrect: boolean; // 是否正确
  history: CoachMessage[]; // 对话历史，至少 1 条（用户的第一句问话）
};
```

### 响应体（成功 200）

```ts
{
  reply: string;
}
```

### 错误响应

| HTTP 状态 | 原因                              |
| --------- | --------------------------------- |
| 400       | 参数缺失或格式错误                |
| 404       | `puzzleId` 不存在                 |
| 413       | 请求体超过 8 KB                   |
| 429       | 速率限制触发（每分钟 10 次）      |
| 500       | 服务器未配置 `DEEPSEEK_API_KEY`   |
| 502       | DeepSeek API 调用失败或返回空回复 |

### 请求约束

| 约束             | 值                       |
| ---------------- | ------------------------ |
| 最大请求体       | 8 KB                     |
| 最大对话历史     | 6 条（服务端截断）       |
| 每条消息最大长度 | 2 000 字符（服务端截断） |
| 速率限制         | 每 IP 每分钟 10 次       |

---

## 3. 系统 Prompt 构建

源文件：`lib/coachPrompt.ts` → `buildSystemPrompt()`

### 3.1 Prompt 结构

```
[角色设定]
  你是一位友好的围棋教练……
  苏格拉底式引导风格……
  回复简短（2–4 段）……
  以 solutionNote 和 correct[] 为基准，不得自行发明变化……

[POSITION]
  棋盘尺寸、坐标说明
  黑棋位置列表
  白棋位置列表
  轮到谁落子
  正确落点列表
  标签和难度

[STUDENT'S MOVE]
  用户落点 + 对错判定

[SOLUTION SEQUENCE]（如有）
  逐步正确序列

[COMMON WRONG BRANCHES]（如有）
  错误落点 → 对方应对序列

[SOLUTION NOTE]
  localized(puzzle.solutionNote, locale) ← 该语言的解题注释

[STYLE]
  locale 对应的语气风格（中文/英文/日文/韩文专属指令）
```

### 3.2 关键设计决策

**基准事实注入**：将 `solutionNote`、`solutionSequence`、`wrongBranches` 全部注入系统 prompt，模型无需推断棋理——只需解释已知正确答案。这是防止大模型在围棋判断上产生幻觉的核心手段。

**落点和对错前置**：用户提交落子时，对错结果已在客户端判定，服务端将其写入系统 prompt。教练在对话开始时就知道完整背景，用户无需重复。

**`localized()` 回退**：系统 prompt 使用 `localized(puzzle.solutionNote, locale)` 而非直接索引，确保即使某语言字段为空也能降级到其他语言。

---

## 4. 模型配置

```ts
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

const completion = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: openaiMessages,
  temperature: 0.6,
  max_tokens: 400,
});
```

| 参数          | 值                         | 说明                                     |
| ------------- | -------------------------- | ---------------------------------------- |
| `model`       | `deepseek-chat`            | DeepSeek V3（OpenAI 兼容 API）           |
| `baseURL`     | `https://api.deepseek.com` | DeepSeek 的 OpenAI 兼容端点              |
| `temperature` | `0.6`                      | 适中——保持棋理准确，允许语气自然变化     |
| `max_tokens`  | `400`                      | 约 300 汉字或 400 英文单词，保持回复简短 |

使用 `openai` npm 包（不是 Anthropic SDK），只需切换 `baseURL` 即可复用 OpenAI 客户端协议。

---

## 5. 速率限制

当前实现：进程内存 `Map<string, number[]>`，键为 IP 地址。

```ts
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 分钟窗口
const RATE_LIMIT_MAX = 10; // 窗口内最多 10 次
```

**限制**：进程级，不跨进程共享。Vercel Serverless 多实例部署时各实例独立计数。

**生产环境推荐**：迁移至 Redis（详见 [extensibility.md](./extensibility.md)）。

IP 提取优先级：`x-forwarded-for` → `x-real-ip` → 回退到 `"local"`。

---

## 6. 会话存储

客户端在 `sessionStorage` 中按 `coach-${puzzleId}-${locale}` 键存储对话历史（`CoachMessage[]`）。

```ts
interface CoachMessage {
  role: "user" | "assistant";
  content: string;
  ts: number; // 展示用时间戳，服务端忽略
}
```

**生命周期**：标签页关闭即清空。刷新页面保留，前往其他页面再返回也保留（同一标签页）。

**历史截断**：服务端只取最后 `MAX_HISTORY = 6` 条，防止 prompt 过长。

---

## 7. `isCurated` 门控

```ts
// app/result/ResultClient.tsx（示意）
{puzzle.isCurated !== false && (
  <CoachPanel puzzle={puzzle} ... />
)}
```

当 `puzzle.isCurated === false` 时，教练面板完全隐藏（不渲染、不请求 API）。

**原因**：批量导入的题目没有经人工审校的 `solutionNote`。把空字符串注入系统 prompt 会导致模型在无基准事实的情况下自由发挥，产生错误棋理解释。

---

## 8. 错误处理

### 客户端

网络错误或 API 错误时，对话框显示错误提示，不展示 loading 状态，允许用户重试。

### 服务端（`app/api/coach/route.ts`）

```ts
try {
  // DeepSeek API 调用
} catch (err) {
  console.error("[coach] upstream error:", err);
  return NextResponse.json(
    { error: "Coach is temporarily unavailable. Please try again later." },
    { status: 502 },
  );
}
```

所有错误均返回 JSON `{ error: string }`，HTTP 状态反映错误类型（见第 2 节）。

---

## 9. 环境变量

| 变量               | 必填 | 说明                                          |
| ------------------ | ---- | --------------------------------------------- |
| `DEEPSEEK_API_KEY` | ✅   | DeepSeek API 密钥，缺失时所有教练请求返回 500 |

**本地开发**：在项目根目录创建 `.env.local`：

```
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
```

**Vercel 部署**：在项目 Settings → Environment Variables 中配置，勾选 Production + Preview + Development。

---

## 10. 安全考量

| 风险             | 缓解措施                                                       |
| ---------------- | -------------------------------------------------------------- |
| 恶意大请求体     | 8 KB 上限（`content-length` 检查）                             |
| 暴力刷 API       | 进程级速率限制（生产建议 Redis）                               |
| 消息内容注入     | 每条 `content` 截断至 2 000 字符，历史最多 6 条                |
| 伪造 `puzzleId`  | 服务端从 `PUZZLES` 数组查找，不存在返回 404                    |
| 系统 Prompt 泄露 | 客户端只收到 `reply`，系统 prompt 仅在服务端构建，不随响应返回 |
| API Key 泄露     | 存储在服务端环境变量，不暴露给浏览器                           |

---

_相关文档：[architecture.md](./architecture.md) · [data-schema.md](./data-schema.md) · [extensibility.md](./extensibility.md)_
