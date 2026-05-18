# 产品规格与功能逻辑 (PRODUCT_SPECS)

本文件定义了 go-daily 核心功能的操作逻辑，与当前的权益引擎和订阅引擎实现保持同步。

## 1. 权益引擎 (`lib/entitlements.ts`)

go-daily 使用集中的**查找表 (Lookup Table)** 来管理权限，而非分散的布尔值检查。这确保了增加新层级（如“终身会员”）仅需更新一个常量。

| 功能            | 游客（未登录）  | 免费版            | Pro 版                     |
| --------------- | --------------- | ----------------- | -------------------------- |
| **AI 教练配额** | 3 次/日, 5次/月 | 10 次/日, 30次/月 | **每日 50+ · 每月 1,000+** |
| **设备限制**    | —               | 1 台设备          | 3 台设备                   |
| **云端同步**    | 无              | 单设备            | 多设备                     |
| **广告**        | 有              | 有                | 无                         |

面向读者的 **Pro** 配额按 **50+ / 日**、**1,000+ / 月** 表述；精确计数仅以 `lib/entitlements.ts` 为准。

除上表按设备的配额外，访客教练在服务端另有 **按 IP 的 UTC 自然日日上限**（`GUEST_IP_DAILY_LIMIT`，当前为每 IP 每日 **20** 次，见 `guestCoachUsage.ts`）。IP 计数在配置 Upstash 时落 **Redis**；否则为进程内 `Map`（1 万键上限、跨日清理后按插入顺序淘汰最旧键）。不改变表中按设备的计数。

已登录浏览器通过 `POST /api/auth/device` 登记或刷新自己的 `user_devices` 记录。该端点会先合并 Stripe 订阅状态与 `manual_grants`，再执行 Free / Pro 设备限制。

### 缓存策略 (Next.js 16)

我们利用 `'use cache'` 指令和 `cacheTag`。当 Stripe Webhook 更新订阅时，我们会调用 `revalidateTag('entitlements:' + userId)`，确保 UI 即时反映新状态。

### 手动授予 Pro（`manual_grants` / `lib/entitlementsServer.ts`）

运营可通过 `manual_grants` 表与 `/api/admin/grants` 在不经 Stripe 的情况下按邮箱授予 Pro。`lib/entitlementsServer.ts` 的 `resolveViewerPlan()` 先用 `getViewerPlan()`（Stripe 订阅状态）得到基础档位；若用户尚非 Pro，且存在未过期的手动授予，则升为 Pro。`/api/admin/grants` 对运营账号校验 `ADMIN_USER_IDS`（会话用户 UUID 白名单）；`/admin` 界面的邮箱白名单与 PIN 校验为另一套机制（见 `API_REFERENCE`）。

## 2. 间隔复习 (SRS) 逻辑 (`lib/puzzle/srs.ts`)

我们实现了改进后的 SuperMemo-2 (SM-2) 算法。

- **初始状态**：易难度因子 (Ease Factor) 2.5，间隔 0。
- **质量映射**：
  - 做错 -> 2 (触发立即重新入队)
  - 做对 -> 5 (根据 Ease Factor 计算下一个间隔)
- **排期**：题目按 `due_date` 升序排列。Pro 用户可以清理积压，实现错题管理的“收件箱清零”。

## 3. 订阅管理 (`lib/stripe/`)

- **结账**：使用 Stripe Adaptive Pricing，根据用户 IP 自动将 $4.9 USD 转换为相应的本地货币（如 日元/韩元）。
- **幂等处理**：每个 Stripe 事件在处理前都会记录在 `stripe_events` 表中。如果事件被重复投递，系统将跳过处理。
- **试用期**：所有 Pro 订阅强制执行 7 天试用，并要求预先提供支付方式，以最大化转化率。

## 4. 题库集合与筛选 (`lib/puzzle/puzzleCollections.ts`)

题库支持按标签和难度进行筛选浏览：

- **标签 (Tags)**: `life-death` (死活)、`tesuji` (手筋)、`endgame` (官子)、`opening` (布局)，定义于 `PuzzleTagSchema`。
- **难度 (Difficulty)**: 1–5 级。每道题目拥有单一难度评级。
- **集合页面**: `/puzzles/tags/{tag}` 和 `/puzzles/difficulty/{level}` 使用 `PuzzleListClient` 组件渲染筛选视图。

## 5. 内容质量分层

题库内容不能只用“是否有正解”来判断是否适合 AI 教练。当前共享结构由 `types/schemas.ts` 定义：`correct` 与 `solutionNote` 是基础字段，`solutionSequence` 与 `wrongBranches` 是可选的深度教学字段。

产品层按四档理解题目质量：

| 分层              | 判定依据                                                          | 产品用途                                     |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `basic-explained` | 有正解和四语言解析，但未进入运营准入列表                          | 每日题、结果页解析、基础复习                 |
| `coach-eligible`  | 通过 `checkCoachEligibility()` 基础质量门槛，且可进入内容运营队列 | 受限 AI 基础解释、首题池、内容补强候选       |
| `coach-ready`     | 有正解、解析、`solutionSequence` 与 `wrongBranches`，并经批准     | 可上线完整 AI 教练，允许围绕变例进行追问     |
| `variation-ready` | 重复组或同形题被整理成明确变化关系，可解释差异与次序              | 专题训练、错因归纳、下一题推荐和高级复盘路径 |

实现上，`lib/coach/coachEligibility.ts` 已返回 `qualityTier` 与 `hasVariationSupport`。当前 `coachEligibleIds.json` 仍是历史白名单，运行时还会经过 `getCoachAccess()` 的质量校验；迁移时应先保留双门控，再把白名单语义拆成基础解释准入、完整教练批准和变例专题关系。只有达到 `coach-ready` 并进入批准列表的题目，才应被视为完整 AI 教练题。`basic-explained` / `coach-eligible` 题可以提供静态解析或受限问答，但不应承诺完整变例讲解。

## 6. 学习闭环

目标路径是 `onboarding → first puzzle → result → coach → review → next recommendation`：

| 步骤                | 用户应得到的反馈                                   | 系统依据                                     |
| ------------------- | -------------------------------------------------- | -------------------------------------------- |
| Onboarding          | 当前适合的训练强度、题型入口和今日目标             | 训练水平偏好、语言环境、登录状态             |
| First puzzle        | 清晰题型、难度、当前轮到谁下、即时落子反馈         | 题库索引、每日选题、棋盘规则                 |
| Result              | 对错、正解、关键形状解释、是否进入复习             | `correct`、`solutionNote`、attempt 记录      |
| Coach               | 可追问的讲解边界；只有完整题提供主线与错误分支问答 | `qualityTier`、配额、批准列表、人设          |
| Review              | 上次错因、本次复习目标、SRS 下一次时间             | attempt 历史、`reviewSrs.ts`                 |
| Next recommendation | 下一道更适合的题，而不是单纯随机                   | 难度、标签、SRS 到期、近期错误、内容质量分层 |

该闭环的核心指标不是题库总量，而是首题完成率、结果页继续率、Coach 使用后的次日回访、错题复习完成率和 Pro 转化触点质量。

## 7. AI 安全与成本边界

Coach 请求的安全与成本控制由 `/api/coach`、`lib/promptGuard.ts`、`lib/coach/*`、`lib/rateLimit.ts` 和观测封装共同承担：

- **Prompt 注入防线**：用户历史消息先通过 `guardUserMessage()`；检测包含 NFKC 归一化、常见 Cyrillic/Greek 同形字符折叠、零宽字符移除、紧凑字符串匹配与关键词密度检查。注入请求会在题目查询、配额写入和模型调用前被拒绝。
- **请求与上下文预算**：Coach POST 请求体限制为 8 KB；历史消息最多保留最近 6 条，总字符预算 6,000，每条消息裁剪到 2,000 字符；上游模型输出 `max_tokens` 固定为 400，调用超时 25 秒。
- **配额与限流**：全局 IP 限流由 `createRateLimiter()` 负责，生产缺少 Upstash 时首次实际限流调用返回 503；访客另有设备日/月限额与 IP 日限额；登录用户通过数据库 RPC 原子检查并自增日/月配额，避免并发绕过。
- **扣费时机与回滚**：用量在模型流式返回前先扣除，防止用户中止连接规避计数；上游构造或流式失败时会回滚本次用量。明显非法请求、promptGuard 拦截、题目不可用和配额不足不会调用模型。
- **成本观测**：服务端 PostHog 仅记录模型名、provider、耗时和 token 计数，不记录用户输入、AI 回复、棋谱全文或内部 ID。若 provider 未返回 token usage，会以 `usageAvailable=false` 标记。

## 8. Funnel 与事件

PostHog 事件按 activation / retention / coach / conversion 四类维护，事件名与属性的单一事实源是 `lib/posthog/eventTypes.ts`。客户端只通过 `track()` 发送，服务端只通过 `captureServerEvent()` 发送；测试环境 mock 封装，不触发真实 PostHog 网络请求。

| 分类       | 事件                                                                                                                | 低敏属性边界                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Activation | `onboarding_started`, `first_move_played`, `first_puzzle_completed`, `result_viewed`, `next_recommendation_clicked` | `locale`, `source`, `level`, `tag`, `difficulty`, `contentTier`, `result`, `recommendationType` |
| Retention  | `review_page_viewed`, `review_item_opened`, `stats_page_viewed`, `review_recommendation_viewed`                     | `locale`, `source`, `plan`, `tag`, `difficulty`, `result`, `recommendationType`                 |
| Coach      | `coach_opened`, `coach_prompt_clicked`, `coach_response_completed`, `coach_error_shown`, `coach_quota_state_seen`   | `locale`, `source`, `contentTier`, `result`, `promptKey`                                        |
| Conversion | `pricing_viewed`, `checkout_click`, `upsell_viewed`, `upsell_cta_clicked`                                           | `locale`, `source`, `plan`, `interval`                                                          |

隐私边界：事件属性不发送原始棋谱全文、用户自由输入文本、AI 对话原文、邮箱、用户 ID、Stripe customer/subscription ID、设备 ID、reveal token 或其他令牌。服务端 PostHog `distinctId` 在封装层做 SHA-256 派生后再发送，避免把内部用户 ID 或支付系统 ID 作为原文暴露给分析系统。`captureServerEvent()` 会在发送前检查敏感属性 key 与敏感字符串值；命中时阻断该事件并只记录低敏告警。

## 9. 法律与合规呈现逻辑

系统采用 Apple 风格的”统一支柱”法律递送机制。

- **动态法律页脚**: 页脚链接至三大核心支柱：`/legal/privacy` (隐私)、`/legal/terms` (条款) 和 `/legal/refund` (退款)。
- **集成公示**:
  - **日本特商法 (Tokushoho)**: 直接集成于服务条款中。
  - **台湾消保法**: 直接集成于服务条款中。
  - **英国/欧盟 DMCCA**: 集成于退款政策中。
- **内容交付**: 所有法律文本均由 `app/[locale]/legal/_content.ts` 驱动。

## 10. 无障碍与路由边界

- **Heatmap ARIA**: 活动热力图使用 `role=”grid”` 容器加 `aria-label`，每个日期单元格使用 `role=”gridcell”` 加描述性 `aria-label`。
- **UserMenu 键盘导航**: 下拉菜单支持 ArrowUp/Down 循环切换、Home/End 跳转首尾、Escape 关闭，打开时自动聚焦第一项。
- **路由加载/错误状态**: 关键路由（today、result、review、puzzles）配备 `loading.tsx`（骨架屏）和 `error.tsx`（本地化错误边界含重试）。共享组件：`PageSkeleton` 和 `PageError`。
- **CSS 变量主题**: 所有主题色引用 `var(--color-accent)`（定义于 `globals.css`）而非硬编码十六进制值，支持未来主题定制。
