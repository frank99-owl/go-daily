# go-daily 项目状态与下一步路线图

**生成日期**: 2026-05-18
**仓库 HEAD**: `fb406d6`
**版本状态**: Phase 3 学习系统化基线

---

## 一、当前基线

go-daily 已具备每日围棋题库、四语言本地化、DeepSeek 流式 AI 教练、SRS 复习、Supabase 同步、Stripe 订阅与多地区法律页面。当前阶段的重点不再是补齐基础功能，而是把这些能力组织成可持续留存和转化的学习系统。

最近一次本地验证结果：

- **题库校验**：`npm run validate:puzzles` 通过，当前为 **3033** 道题。
- **i18n 校验**：`npm run validate:messages` 通过，**4 个语言 × 393 个 key path** 对齐。
- **测试套件**：`npm run test` 通过，**91 个测试文件，732 个测试用例**。
- **Lint / 类型检查**：`npm run lint` 与 `npx tsc --noEmit` 均通过。
- **生产构建**：`npm run build` 通过，Next.js **16.2.6**，生成 **131** 个静态页面。

## 二、已完成能力

- **Upstash Redis 限流**：生产环境使用 Upstash Redis 做跨实例限流。当 `NODE_ENV === "production"` 且未设置 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 时，`createRateLimiter()` 返回桩实现，**首次**调用 `isLimited()` 时抛出错误（便于无 Upstash 凭证也能完成 `next build`；开发环境可同时省略两者并使用 `MemoryRateLimiter`）。
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
- **访客教练持久化**：Supabase `guest_coach_usage` 按设备/自然日累计匿名教练用量（仅 `service_role`）；IP 维度限制仍在内存中用于防滥用。
- **棋盘模块**：核心逻辑收敛为四个模块（`board.ts`、`goRules.ts`、`judge.ts`、`sgf.ts`），已移除旧的 `boardDisplay.ts`。
- **文档同步**：API 参考包含 `/api/health`、`/api/admin/*`、`/api/auth/device`，并写明 **`POST /api/coach` 为 SSE（Server‑Sent Events）** 以及 Postgres **RPC** 递增用量；**管理接口**：`/api/admin/verify` 使用 `ADMIN_EMAILS` + `ADMIN_PIN`，**`/api/admin/grants` 使用 `ADMIN_USER_IDS`**；数据库文档包含按权益判定的 `user_devices`、`manual_grants`、`guest_coach_usage` 以及 **`0007_atomic_coach_usage_increment.sql`** 说明；多语言 **`CONCEPT.md`** 对 Pro 的表述与配额一致（并非「无限次」教练——见 **`PRODUCT_SPECS`**）；README / 文档索引与九大领域布局一致；`docs/README.md` 说明仓库公开时的密钥与隐私注意。

## 三、内容质量现状

最近一次内容报告来自 `reports/*/latest.md` 与 P0-D 本地复核清单，生成时间为 2026-05-18。

- **题库结构**：3033 道题全部为 19×19；难度 3 占 46.5%，难度 4 占 35.1%；题型以 `tesuji` 为主（1822，道 60.1%），`life-death` 1187 道，`endgame` 和 `opening` 各 12 道。
- **内容解释**：全量审计显示 3033 道均达到 `explained`，没有缺字段、缺正解或明显占位解释；190 条解析超过 500 字，需要抽查是否冗长或重复。
- **教练完整度**：`coachEligibleIds.json` 当前包含 3033 个 ID，但 `getCoachAccess()` 还会叠加运行时质量校验；P0-D 已给 20 道题补齐 `solutionSequence` 与 `wrongBranches`，`queue:content` 当前报告 **20** 道 `coach-ready` 候选 / 已批准完整 Coach 题。其余 **3013** 道仍不能把“有文字解析”视为“完整 AI 教练题”。
- **质量抽样**：195 个抽样题全部建议复审；P0-D 首批之外的题仍普遍缺 `solutionSequence` 与 `wrongBranches`，高难题、重复相邻题和随机样本仍需继续补强。
- **重复题**：89 个部分重复组，共 243 道题；没有完全重复组。重复组多为同盘面但解析不同，应优先合并为变例或标注为同主题练习，而不是简单删除。

## 四、内容提升路线

1. **先建立分层事实**：把题目区分为 `basic-explained`、`coach-eligible`、`coach-ready`、`variation-ready`。当前全库可视为 `coach-eligible` 的基础候选；P0-D 首批 20 道已进入 `coach-ready`，其余题仍主要是“有正解与解析，缺少主线和错误分支”。
2. **优先补高价值题**：从难度 4-5、重复组、稀缺标签（`endgame` / `opening`）开始人工或半自动补 `solutionSequence` 与 `wrongBranches`，每批小规模进入 review。
3. **把重复组变成教学资产**：同盘面不同解析的重复组优先整理为“同形题 / 变化题”，保留可解释差异；完全没有差异时再考虑去重。
4. **控制题库结构偏差**：新增内容优先补 9×9/13×13 入门路径、官子和布局专题，避免继续扩大 19×19 中级手筋的单点集中。
5. **用报告驱动队列**：`audit:puzzles` 看全量分布，`report:quality` 抽查解释深度，`report:duplicates` 找可转化为变例的组，`queue:content` 只输出真正 `coach-ready` 的上线候选。

## 五、学习闭环设计

产品下一阶段应围绕 `onboarding → first puzzle → result → coach → review → next recommendation` 组织体验：

- **Onboarding**：收集训练水平与目标，给出“今天先做什么”的明确入口，而不是只介绍功能。
- **First puzzle**：第一题要低摩擦，用户应得到清晰的题型、难度和落子反馈。
- **Result**：结果页不仅显示对错，还要解释“为什么这手成立 / 为什么错手失败”，并给出下一步动作。
- **Coach**：仅在 `coach-ready` 或已批准题上强调完整教练；`basic-explained` 题可以提供受限问答或静态解析，避免 AI 编造变例。
- **Review**：错题进入 SRS，复习时突出上次错误点和本次目标。
- **Next recommendation**：下一题由难度、题型、近期错误和 SRS 到期共同决定；目标是形成可持续的每日练习链路。

## 六、近期改进 (v1.1 加固)

- **内存安全限流**：`MemoryRateLimiter`（5 万条上限）和访客 IP 计数器（1 万条上限）现在会淘汰过期条目，防止 serverless 实例内存无限增长。
- **统一请求体解析**：主要 JSON 写入路由（`/api/coach`、`/api/auth/device`、`/api/puzzle/attempt`、`/api/puzzle/reveal`）使用 `lib/apiHeaders.ts` 的 `parseMutationBody()`（默认 **2 KB**，教练 **8 KB**、reveal **3 KB**）。Stripe 等路由另行做同源与 JSON 解析。
- **Unicode 注入防御**：`promptGuard.ts` 在模式匹配前应用 NFKC 归一化，并折叠常见 Cyrillic/Greek 同形字符。
- **Coach 体验优化**：通用错误增加重试按钮、思考状态动画指示器、切换导师时骨架屏加载。
- **Stripe Webhook 加固**：读取请求体前校验 1 MB 大小限制（HTTP 413）。
- **GoBoard 禁用状态**：棋盘不可交互时以 50% 透明度渲染。

## 七、后续即时步骤 (Phase 3)

1. **内容分层落地**：将报告中的 `explained`、`coach-ready`、`hasVariationSupport` 转成产品可用的准入策略和运营队列；详见 [CONTENT_QUALITY_MODEL.md](CONTENT_QUALITY_MODEL.md)。
2. **下一批 Coach 题打磨**：继续从 `queue:content` / `plan:content-batch` 选择 20-50 道高价值题补齐 `solutionSequence` 与 `wrongBranches`，通过 `queue:content` 进入批准列表。
3. **学习闭环实现**：先做最小闭环，不追求复杂推荐模型；优先让新用户完成首题、理解结果、进入复习或下一题。
4. **生产环境烟感测试**：在明确发布窗口后验证 DNS/SMTP 及 Stripe Live Webhook；该动作会影响外部系统，需单独审批。

---

详情请参阅 [docs/zh/CONCEPT.md](docs/zh/CONCEPT.md)。
