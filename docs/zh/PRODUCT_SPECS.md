# 产品规格与功能逻辑 (PRODUCT_SPECS)

本文件定义了 go-daily 核心功能的操作逻辑，与当前的权益引擎和订阅引擎实现保持同步。

## 1. 权益引擎 (`lib/entitlements.ts`)

go-daily 使用集中的**查找表 (Lookup Table)** 来管理权限，而非分散的布尔值检查。这确保了增加新层级（如“终身会员”）仅需更新一个常量。

| 功能            | 免费版            | Pro 版               |
| --------------- | ----------------- | -------------------- |
| **AI 教练配额** | 3 次/日, 20次/月  | 10 次/日, 50次/月    |
| **历史题库**    | 最近 30 天        | 全部 3,000+ 题目     |
| **设备限制**    | 1 台设备 (硬上限) | 无限制               |
| **复习模式**    | 最近 20 条错题    | 完整的 SM-2 SRS 逻辑 |
| **分享卡片**    | 计划中，尚未实现  | 计划中，尚未实现     |

### 缓存策略 (Next.js 16)

我们利用 `'use cache'` 指令和 `cacheTag`。当 Stripe Webhook 更新订阅时，我们会调用 `revalidateTag('entitlements:' + userId)`，确保 UI 即时反映新状态。

## 2. 间隔复习 (SRS) 逻辑 (`lib/srs.ts`)

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

## 5. 法律与合规呈现逻辑

系统采用 Apple 风格的“统一支柱”法律递送机制。

- **动态法律页脚**: 页脚链接至三大核心支柱：`/legal/privacy` (隐私)、`/legal/terms` (条款) 和 `/legal/refund` (退款)。
- **集成公示**:
  - **日本特商法 (Tokushoho)**: 直接集成于服务条款中。
  - **台湾消保法**: 直接集成于服务条款中。
  - **英国/欧盟 DMCCA**: 集成于退款政策中。
- **内容交付**: 所有法律文本均由 `app/[locale]/legal/_content.ts` 驱动。
