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

> 完整文档索引：[docs/README.md](docs/README.md) | 更新日志：[CHANGELOG.md](CHANGELOG.md)

我们针对不同语言环境进行了深度本地化。请参阅以下中文文档以了解项目的核心逻辑：

1.  **[项目理念与战略](docs/zh/CONCEPT.md)**：为什么做 go-daily？我们的市场定位、商业哲学与”精益”运营。
2.  **[技术架构深度解析](docs/zh/ARCHITECTURE.md)**：深入了解 `proxy.ts` 请求生命周期、三态持久化引擎及九大领域 `lib/` 布局。
3.  **[产品规格与功能逻辑](docs/zh/PRODUCT_SPECS.md)**：SM-2 算法参数映射、订阅权益引擎以及 AI 教练准入逻辑的详细说明。
4.  **[运维与质量保障](docs/zh/OPERATIONS_QA.md)**：生产环境部署指南、`productionPreflight` 发布前检查以及测试套件策略。
5.  **[实时项目看板](docs/zh/PROJECT_STATUS.md)**：跟踪当前 Sprint 进度与生产环境就绪状态。
6.  **[API 路由参考](docs/zh/API_REFERENCE.md)**：所有 API 路由的完整目录，含请求/响应 Schema。
7.  **[数据库 Schema](docs/zh/DATABASE_SCHEMA.md)**：Supabase 表定义、索引与 RLS 策略。
8.  **[法律与合规](docs/zh/LEGAL_COMPLIANCE.md)**：全球化扩张的多司法管辖区法律策略。

---

## 🚀 快速上手

### 1. 环境要求

- Node.js 22.5+（见 `package.json` 的 `engines`）
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

访问 `http://localhost:3000`。中间件会自动根据浏览器偏好重定向到对应的语言路径。

---

## 🛠️ 技术栈

- **前端**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Framer Motion.
- **后端**: Supabase (Auth/Postgres), Upstash (Redis 限流).
- **AI**: DeepSeek Chat API.
- **商业**: Stripe 动态定价, Resend 邮件系统.

---

(C) 2026 Frank. 保留所有权利。
