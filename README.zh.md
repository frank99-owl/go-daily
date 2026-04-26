# go-daily

> 每日一题围棋死活练习 — 搭载苏格拉底式 AI 教练（**中 / EN / 日 / 한**）。

[English →](README.md) | [日本語 →](README.ja.md) | [한국어 →](README.ko.md)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)
![Stripe](https://img.shields.io/badge/Stripe-payments-626cd9?logo=stripe)

**go-daily** 是一个极简、专注于习惯养成的围棋 (Go / 囲碁 / 바둑) 练习平台。每天攻克一个关键点，并辅以苏格拉底式的 AI 教练，引导你思考棋形本质，而非直接给出答案。

---

## 📚 文档指南

为了保持工程卓越性和战略清晰度，我们的文档被组织为以下核心逻辑支柱：

### 🎯 [产品与战略](docs/CONCEPT.md) (英文)

- **[战略愿景](docs/CONCEPT.md)**：为什么做 go-daily？我们的市场定位与商业哲学。
- **[项目路线图](docs/CONCEPT.md)**：从 MVP 到全球化产品的里程碑。
- **[内容管理](docs/CONCEPT.md)**：我们如何筛选题目及管理 AI Coach 的“事实根据”。

### 🧱 [架构与设计](docs/ARCHITECTURE.md) (英文)

- **[系统设计](docs/ARCHITECTURE.md)**：高层技术架构与数据流向。
- **[数据库 Schema](docs/ARCHITECTURE.md)**：Postgres 表结构、RLS 安全策略与同步逻辑。
- **[项目布局](docs/ARCHITECTURE.md)**：目录结构与模块分组规范。

### 🛡️ [运维与质量](docs/OPERATIONS_QA.md) (英文)

- **[部署指南](docs/OPERATIONS_QA.md)**：生产环境基础设施配置（Vercel, Supabase, Stripe）。
- **[上线预检清单](docs/OPERATIONS_QA.md)**：发布前必须执行的 47 项检查。
- **[产品规格](docs/PRODUCT_SPECS.md)**：SRS 算法逻辑、订阅权限引擎与支付幂等逻辑。

---

## 🚀 快速上手

### 1. 环境要求

- Node.js 20+
- DeepSeek 或兼容 OpenAI 接口的 API Key。
- Supabase 项目（可选，匿名模式下无需配置）。

### 2. 安装

```bash
git clone https://github.com/frank99-owl/go-daily.git
cd go-daily
cp .env.example .env.local
npm install
```

### 3. 本地运行

```bash
npm run dev
```

访问 `http://localhost:3000`。中间件会自动根据浏览器偏好重定向到对应的语言路径（如 `/zh`）。

---

## 🛠️ 技术栈

- **前端**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Framer Motion.
- **后端**: Supabase (Auth/Postgres), Upstash (Redis 限流).
- **AI**: DeepSeek Chat API.
- **商业**: Stripe 动态定价, Resend 邮件系统.

---

(C) 2026 Frank. 本项目采用 MIT 协议。
