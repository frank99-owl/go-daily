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

### 缓存策略 (Next.js 16)

我们利用 `'use cache'` 指令和 `cacheTag`。当 Stripe Webhook 更新订阅时，我们会调用 `revalidateTag('entitlements:' + userId)`，确保 UI 即时反映新状态。

### 手动授予 Pro（`manual_grants` / `lib/entitlementsServer.ts`）

运营可通过 `manual_grants` 表与 `/api/admin/grants` 在不经 Stripe 的情况下按邮箱授予 Pro。`lib/entitlementsServer.ts` 的 `resolveViewerPlan()` 先用 `getViewerPlan()`（Stripe 订阅状态）得到基础档位；若用户尚非 Pro，且存在未过期的手动授予，则升为 Pro。

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

## 5. 法律与合规呈现逻辑

系统采用 Apple 风格的”统一支柱”法律递送机制。

- **动态法律页脚**: 页脚链接至三大核心支柱：`/legal/privacy` (隐私)、`/legal/terms` (条款) 和 `/legal/refund` (退款)。
- **集成公示**:
  - **日本特商法 (Tokushoho)**: 直接集成于服务条款中。
  - **台湾消保法**: 直接集成于服务条款中。
  - **英国/欧盟 DMCCA**: 集成于退款政策中。
- **内容交付**: 所有法律文本均由 `app/[locale]/legal/_content.ts` 驱动。

## 6. 无障碍与路由边界

- **Heatmap ARIA**: 活动热力图使用 `role=”grid”` 容器加 `aria-label`，每个日期单元格使用 `role=”gridcell”` 加描述性 `aria-label`。
- **UserMenu 键盘导航**: 下拉菜单支持 ArrowUp/Down 循环切换、Home/End 跳转首尾、Escape 关闭，打开时自动聚焦第一项。
- **路由加载/错误状态**: 关键路由（today、result、review、puzzles）配备 `loading.tsx`（骨架屏）和 `error.tsx`（本地化错误边界含重试）。共享组件：`PageSkeleton` 和 `PageError`。
- **CSS 变量主题**: 所有主题色引用 `var(--color-accent)`（定义于 `globals.css`）而非硬编码十六进制值，支持未来主题定制。
