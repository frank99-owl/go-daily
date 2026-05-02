# go-daily 项目状态与下一步路线图

**生成日期**: 2026-05-01
**仓库 HEAD**: `ae8ecce`
**版本状态**: v2.7 代码库优化版

---

## 一、Phase 2 完成总结

所有订阅相关逻辑（Stripe、权益引擎、多设备同步）已完成实现并审计通过。法务框架现已支持 10 多个全球司法管辖区，以通过 Stripe 支付验证。

## 二、架构审计

- **一致性**：`lib/` 中的所有逻辑（SRS、Auth、Coach）现已与文档 100% 对齐。
- **路径修复**：实现了全局 **页脚 (Footer)** 及多管辖区法律路由，修复了 404 隐患。
- **UI 逻辑**：通过优化垂直呼吸感 (`pb-24`)，修复了 `Today` 和 `Random` 页面的布局遮挡问题。

## 三、近期进展 (v2.8)

- **Upstash Redis 限流**：生产环境使用 Upstash Redis 实现跨实例速率限制，无环境变量时回退到内存限流。
- **PWA 图标**：新增 192×192 和 512×512 PNG 图标，支持 Android/Chrome 安装提示。
- **OG 图片本地化**：社交分享图片现在根据用户语言环境（zh/en/ja/ko）渲染。
- **ja.json 翻译修复**：移除了 3 条日语 UI 字符串中混入的韩文和中文字符。
- **环境变量集中校验**：`lib/env.ts` 基于 Zod 的惰性单例替代分散的 `process.env` 读取。
- **错误页面国际化**：所有错误边界（`error.tsx`、`global-error.tsx`、`not-found.tsx`）支持 4 种语言。
- **主题色集中化**：53 处硬编码 `#00f2ff` 颜色替换为 `var(--color-accent)` CSS 变量。
- **代码分块**：`CoachDialogue`、`ShareCard`、`BoardShowcase` 通过 `next/dynamic` 懒加载。
- **SEO hreflang**：`buildHreflangAlternates()` 辅助函数为所有页面路由添加 `alternates.languages`。
- **无障碍**：Heatmap ARIA 语义（`role="grid"`、`aria-label`），UserMenu 键盘导航（方向键、Home/End）。
- **路由边界**：today、result、review、puzzles 路由添加 `loading.tsx` + `error.tsx`。
- **测试套件**：81 个测试文件，约 631 个测试用例，覆盖逻辑、UI 和 API 层。

## 三（续）、近期改进 (v1.1 加固)

- **内存安全限流**：`MemoryRateLimiter`（5 万条上限）和访客 IP 计数器（1 万条上限）现在会淘汰过期条目，防止 serverless 实例内存无限增长。
- **统一请求体解析**：所有写入 API 路由使用 `lib/apiHeaders.ts` 的 `parseMutationBody()` —— CSRF、Content-Type、大小限制和 JSON 校验的单一来源。
- **Unicode 注入防御**：`promptGuard.ts` 在模式匹配前应用 NFKC 归一化，折叠全角和同形字符。
- **Coach 体验优化**：通用错误增加重试按钮、思考状态动画指示器、切换导师时骨架屏加载。
- **Stripe Webhook 加固**：读取请求体前校验 1 MB 大小限制（HTTP 413）。
- **GoBoard 禁用状态**：棋盘不可交互时以 50% 透明度渲染。

## 四、后续即时步骤 (Phase 3)

1. **生产环境烟感测试**：验证 DNS/SMTP 及 Stripe Live Webhook。
2. **教练全面上线**：继续批量批准剩余题目用于 Pro 会员教学。
3. **内容深度**：从 19×19 死活扩展至 9×9/13×13 入门路径及布局/官子专题。

---

详情请参阅 [docs/zh/CONCEPT.md](docs/zh/CONCEPT.md)。
