# 数据结构参考

> 对应英文版：[data-schema.en.md](./data-schema.en.md)

---

## 目录

1. [Puzzle — 题目对象](#1-puzzle--题目对象)
2. [AttemptRecord — 作答记录](#2-attemptrecord--作答记录)
3. [CoachMessage — 教练对话消息](#3-coachmessage--教练对话消息)
4. [辅助类型](#4-辅助类型)
5. [客户端存储键](#5-客户端存储键)
6. [Supabase 数据库表](#6-supabase-数据库表)
7. [坐标系](#7-坐标系)
8. [`isCurated` 的影响](#8-iscurated-的影响)

---

## 1. Puzzle — 题目对象

类型定义：`types/index.ts`
运行时校验：`types/schemas.ts`（zod）
curated 数据：`content/curatedPuzzles.ts`
generated 数据：`content/data/classicalPuzzles.json`、`content/data/classicalPuzzles.json`
聚合入口：`content/puzzles.ts`（环境感知）/ `content/puzzles.server.ts`（服务端全量）

| 字段               | 类型                 | 必填 | 说明                                                                             |
| ------------------ | -------------------- | ---- | -------------------------------------------------------------------------------- |
| `id`               | `string`             | ✅   | 全局唯一。每日题用 `YYYY-MM-DD`；题库题用 `<tag>-<n>`，如 `ld1-0`                |
| `date`             | `string`             | ✅   | 本地日期 `YYYY-MM-DD`，导入题用占位值 `"2026-04-18"`；**不参与每日轮换**         |
| `boardSize`        | `9 \| 13 \| 19`      | ✅   | 棋盘尺寸                                                                         |
| `stones`           | `Stone[]`            | ✅   | 初始局面预置棋子，不得重叠                                                       |
| `toPlay`           | `"black" \| "white"` | ✅   | 由谁落子                                                                         |
| `correct`          | `Coord[]`            | ✅   | 判题用的正确落点（**第一手**），非空                                             |
| `solutionSequence` | `Stone[]`            | —    | 完整正确变化序列（多手），结果页动画回放用                                       |
| `wrongBranches`    | `WrongBranch[]`      | —    | 常见错误变化及应对序列，供 AI 教练参考                                           |
| `isCurated`        | `boolean`            | —    | 缺省视为 `true`；显式设 `false` 时关闭 AI 教练（防止幻觉）并隐藏题库精选标签     |
| `tag`              | `PuzzleTag`          | ✅   | `"life-death" \| "tesuji" \| "endgame" \| "opening"`                             |
| `difficulty`       | `1..5`               | ✅   | 整数，1 最简单                                                                   |
| `prompt`           | `LocalizedText`      | ✅   | 四语言题目描述，如 `{ zh:"黑先活", en:"Black to live", ja:"…", ko:"…" }`         |
| `solutionNote`     | `LocalizedText`      | ✅\* | 四语言解题注释，AI 教练的基准事实（\* `isCurated === false` 时验证器不检查内容） |
| `source`           | `string`             | —    | 可选来源说明（SGF 文件名、书目等）                                               |

### 1.1 Stone

```ts
type Stone = Coord & { color: "black" | "white" };
// 即 { x: number; y: number; color: "black" | "white" }
```

### 1.2 WrongBranch

```ts
interface WrongBranch {
  userWrongMove: Coord; // 用户的错误落点
  refutation: Stone[]; // 对方的应对序列
  note: LocalizedText; // 四语言说明（AI 教练参考用）
}
```

### 1.3 PuzzleSummary（轻量索引）

`content/data/puzzleIndex.json` 中存储的是 `PuzzleSummary[]`，只包含列表页需要的最小字段：

```ts
type PuzzleSummary = {
  id: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  source: string;
  date: string;
  prompt: LocalizedText;
  isCurated: boolean;
  boardSize: 9 | 13 | 19;
  tag: PuzzleTag;
};
```

客户端题库页和复习页只消费 `PuzzleSummary`，不加载完整 `Puzzle` 数据。

---

## 2. AttemptRecord — 作答记录

每次落子提交后在客户端 **追加** 一条，不覆盖历史。

| 字段         | 类型            | 说明                             |
| ------------ | --------------- | -------------------------------- |
| `puzzleId`   | `string`        | 对应 `Puzzle.id`                 |
| `date`       | `string`        | 本地日期 `YYYY-MM-DD`            |
| `userMove`   | `Coord \| null` | 用户落点；null 表示放弃/无效提交 |
| `correct`    | `boolean`       | 是否正确                         |
| `solvedAtMs` | `number`        | Unix 毫秒时间戳（提交时刻）      |

**设计原则**：只追加、不修改。同一题目可有多条记录（多次尝试），这保证了：

- 准确率统计的真实性
- 连续天数（Streak）计算
- 练习热力图（每日做题次数）

**去重键**：`${puzzleId}-${solvedAtMs}`（`lib/attemptKey.ts`），用于本地备份合并和云端同步去重。

---

## 3. CoachMessage — 教练对话消息

存储在 `sessionStorage`，生命周期与浏览器标签绑定，关闭即清空。

| 字段      | 类型                    | 说明                                     |
| --------- | ----------------------- | ---------------------------------------- |
| `role`    | `"user" \| "assistant"` | 消息角色                                 |
| `content` | `string`                | 消息正文（每条限 2000 字符，服务端截断） |
| `ts`      | `number`                | 客户端时间戳（仅展示用，服务端忽略）     |

**sessionStorage 键**：`go-daily.coach.${puzzleId}.${locale}`
每个（题目 × 语言）组合独立存储，切换语言后对话不混用。

---

## 4. 辅助类型

```ts
// 四种语言
type Locale = "zh" | "en" | "ja" | "ko";

// 四语言文本对象
type LocalizedText = Record<Locale, string>;

// 坐标（0-indexed，原点在左上角）
type Coord = { x: number; y: number };

// 颜色
type Color = "black" | "white";

// 题目标签枚举
type PuzzleTag = "life-death" | "tesuji" | "endgame" | "opening";

// 三态状态（从 AttemptRecord[] 推导，不持久化）
type PuzzleStatus = "solved" | "attempted" | "unattempted";
```

`PuzzleStatus` 是**纯函数计算**结果（`lib/puzzleStatus.ts`），不单独存储。
判断规则：

- `solved` → 该题至少有一条 `correct: true` 的记录
- `attempted` → 有记录但全部 `correct: false`
- `unattempted` → 无任何记录

---

## 5. 客户端存储键

| 存储             | 键                                     | 内容                   | 生命周期         |
| ---------------- | -------------------------------------- | ---------------------- | ---------------- |
| `localStorage`   | `go-daily.attempts`                    | `AttemptRecord[]` JSON | 永久（手动清除） |
| `localStorage`   | `go-daily.locale`                      | `Locale` 字符串        | 永久             |
| `localStorage`   | `go-daily.device-id`                   | per-browser UUID       | 永久             |
| `sessionStorage` | `go-daily.coach.${puzzleId}.${locale}` | `CoachMessage[]` JSON  | 标签页关闭即清空 |

登录用户额外使用：

| 存储         | 键                       | 内容                     | 说明                      |
| ------------ | ------------------------ | ------------------------ | ------------------------- |
| IndexedDB    | `go-daily.sync.queue.v1` | 待同步 `AttemptRecord[]` | `lib/syncStorage.ts` 队列 |
| localStorage | `go-daily.sync.failed`   | 上次同步失败 ISO 时间戳  | 用于 UI 显示同步状态      |

> **localStorage 无上限保护**：目前没有自动清理。预计每条记录约 100 字节，10 万条约 10 MB，一般浏览器限额 5–10 MB。规模化后需要加入**滚动清理**（见 [extensibility.md](./extensibility.md)）。

---

## 6. Supabase 数据库表

Schema 定义在 `supabase/migrations/*.sql`。

### 6.1 profiles

| 字段                       | 类型          | 说明                                   |
| -------------------------- | ------------- | -------------------------------------- |
| `user_id`                  | `uuid` PK     | 关联 `auth.users(id)`                  |
| `locale`                   | `text`        | 用户偏好语言（zh/en/ja/ko）            |
| `timezone`                 | `text`        | 时区，默认 UTC                         |
| `kyu_rank`                 | `integer`     | 棋力等级（可选）                       |
| `display_name`             | `text`        | 显示名（可选）                         |
| `email_opt_out`            | `boolean`     | 邮件退订                               |
| `welcome_email_sent_at`    | `timestamptz` | 欢迎邮件发送时间，防重复发送           |
| `daily_email_last_sent_on` | `date`        | 每日题目邮件最近发送日期               |
| `email_unsubscribe_token`  | `text`        | 退订链接 token（随机 UUID 文本，唯一） |
| `deleted_at`               | `timestamptz` | 软删除标记                             |
| `created_at`               | `timestamptz` | 创建时间                               |
| `updated_at`               | `timestamptz` | 更新时间                               |

**RLS**: 用户只能读写自己的 profile。

### 6.2 attempts

| 字段                  | 类型           | 说明                    |
| --------------------- | -------------- | ----------------------- |
| `id`                  | `bigserial` PK | 自增主键                |
| `user_id`             | `uuid`         | 关联 `auth.users(id)`   |
| `puzzle_id`           | `text`         | 题目 ID                 |
| `date`                | `text`         | 本地日期 YYYY-MM-DD     |
| `user_move_x`         | `integer`      | 用户落点 X（可为 null） |
| `user_move_y`         | `integer`      | 用户落点 Y（可为 null） |
| `correct`             | `boolean`      | 是否正确                |
| `duration_ms`         | `integer`      | 答题耗时（毫秒，可选）  |
| `client_solved_at_ms` | `bigint`       | 客户端 Unix 毫秒时间戳  |
| `created_at`          | `timestamptz`  | 服务端记录时间          |

**约束**: `UNIQUE (user_id, puzzle_id, client_solved_at_ms)` — 防止重复写入。  
**RLS**: 用户只能 SELECT/INSERT 自己的 attempts（append-only，无 update/delete）。

### 6.3 coach_usage

| 字段      | 类型      | 说明                  |
| --------- | --------- | --------------------- |
| `user_id` | `uuid`    | 关联 `auth.users(id)` |
| `day`     | `date`    | 日期                  |
| `count`   | `integer` | 当日使用次数          |

**RLS**: 用户只能读取自己的 usage。写入通过 service_role。

**月额度计算**：不额外建月表，月计数 = 按月窗口对 `day` 区间做 `SUM(count)`。

- Free：窗口 = 用户时区**自然月**（优先 `profiles.timezone`，回退浏览器时区，再回退 UTC）。
- Pro：窗口 = **账单锚点月**（`subscriptions.first_paid_at` / `coach_anchor_day`）。

两种窗口的实现见 `lib/coachQuota.ts`；运行时装配见 `lib/coachState.ts`。

### 6.4 subscriptions

| 字段                     | 类型          | 说明                                                                                        |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------- |
| `user_id`                | `uuid` PK     | 关联 `auth.users(id)`                                                                       |
| `stripe_customer_id`     | `text`        | Stripe Customer ID                                                                          |
| `stripe_subscription_id` | `text`        | Stripe Subscription ID                                                                      |
| `plan`                   | `text`        | 订阅计划标识                                                                                |
| `status`                 | `text`        | active / trialing / 等                                                                      |
| `current_period_end`     | `timestamptz` | 当前 Stripe 周期结束时间                                                                    |
| `cancel_at_period_end`   | `boolean`     | 是否到期取消                                                                                |
| `trial_end`              | `timestamptz` | 试用结束时间                                                                                |
| `first_paid_at`          | `timestamptz` | **首次真实扣费成功时间**；trial 阶段保持 `null`；由 `invoice.paid` webhook 在首次收到时写入 |
| `coach_anchor_day`       | `integer`     | `1..31`，从 `first_paid_at` 提取的账单锚点日；驱动 Pro 的 Coach 月额度窗口                  |
| `updated_at`             | `timestamptz` | 更新时间                                                                                    |

**写入**: 仅通过 Stripe webhook + service_role。  
**RLS**: 用户只能读取自己的 subscription。

**锚点写入规则**：

- `first_paid_at` 仅在**首次真实扣费成功**时写入（`invoice.paid` 且金额 > 0），已有值则保持不变。
- `coach_anchor_day` 由 `first_paid_at` 的日期部分提取；年付用户同样走该锚点做每月 Coach 额度重置。
- 锚点为 `31` 日时，短月自动回退到该月最后一天（计算在 `lib/coachQuota.ts` 的 `getBillingAnchoredMonthWindow` 里）。
- `invoice.payment_failed` 会把本地 `status` 写为 `past_due`，让 `entitlements` 立即降级；后续成功付款事件再恢复 Stripe 当前状态。

### 6.5 srs_cards

Phase 2 SRS 复习调度表。

| 字段               | 类型          | 说明                     |
| ------------------ | ------------- | ------------------------ |
| `user_id`          | `uuid`        | 关联 `auth.users(id)`    |
| `puzzle_id`        | `text`        | 题目 ID                  |
| `ease_factor`      | `numeric`     | 记忆难度系数（默认 2.5） |
| `interval_days`    | `integer`     | 间隔天数                 |
| `due_date`         | `date`        | 到期复习日期             |
| `last_reviewed_at` | `timestamptz` | 上次复习时间             |

**RLS**: 用户拥有完整 CRUD。

**写入规则**：登录态浏览器在保存 attempt 后 best-effort upsert；Pro `/review` 服务端会按 `attempts.client_solved_at_ms` 从旧到新重放，补齐缺失的 `srs_cards` 并只展示 `due_date <= 今天` 的卡片。首次答对不建卡；做错建 immediately due 卡；已有卡答对后按 SM-2 间隔推进。

### 6.6 stripe_events

Webhook 幂等性账本。

| 字段                    | 类型          | 说明                                     |
| ----------------------- | ------------- | ---------------------------------------- |
| `id`                    | `text` PK     | Stripe event ID                          |
| `event_type`            | `text`        | 事件类型                                 |
| `received_at`           | `timestamptz` | 接收时间                                 |
| `processed_at`          | `timestamptz` | 成功处理时间；非空表示重复事件可直接跳过 |
| `processing_started_at` | `timestamptz` | 当前处理占用时间；用于并发 webhook 退避  |
| `last_error`            | `text`        | 上一次处理失败摘要                       |

**RLS**: 禁止任何 public 读取（`SELECT using (false)`）。写入仅通过 service_role。

### 6.7 user_devices

Free-plan 单设备限制。

| 字段         | 类型          | 说明                  |
| ------------ | ------------- | --------------------- |
| `user_id`    | `uuid`        | 关联 `auth.users(id)` |
| `device_id`  | `text`        | per-browser UUID      |
| `first_seen` | `timestamptz` | 首次出现时间          |
| `last_seen`  | `timestamptz` | 最后活跃时间          |
| `user_agent` | `text`        | 浏览器 UA 字符串      |

**PK**: `(user_id, device_id)`  
**RLS**: 用户只能读写自己的 devices。

---

## 7. 坐标系

```
(0,0) ──── x ────► (boardSize-1, 0)
  │
  y
  │
  ▼
(0, boardSize-1)
```

- 原点 **(0, 0)** 在棋盘**左上角**
- `x` 向右递增，`y` 向下递增
- 全部坐标均为 **0-indexed 整数**，范围 `[0, boardSize-1]`
- 与 SGF 标准坐标不同（SGF 以字母编码且原点可变），导入脚本负责转换

---

## 8. `isCurated` 的影响

| 行为                | `isCurated === true`（含缺省） | `isCurated === false`             |
| ------------------- | ------------------------------ | --------------------------------- |
| AI 教练             | ✅ 启用                        | ❌ 禁用（按钮隐藏）               |
| 题库「精选」标签    | ✅ 显示                        | ❌ 不显示                         |
| `solutionNote` 验证 | ✅ 检查四语言非空              | ⚠️ 跳过内容检查（但字段仍需存在） |
| 结果页解法注释      | ✅ 展示                        | 不展示 / 降级显示                 |

**何时设 `isCurated: false`**：批量导入的 SGF 题目通常没有经人工审校的解题注释，强行启用 AI 教练会导致模型依赖空字符串作为基准事实而产生幻觉。标记为 `false` 可安全引入大量题目而不影响精选题的体验质量。

---

_相关文档：[architecture.md](./architecture.md) · [puzzle-authoring.md](./puzzle-authoring.md) · [extensibility.md](./extensibility.md)_
