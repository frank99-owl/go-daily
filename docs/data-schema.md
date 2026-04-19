# 数据结构参考

> 对应英文版：[data-schema.en.md](./data-schema.en.md)

---

## 目录

1. [Puzzle — 题目对象](#1-puzzle--题目对象)
2. [AttemptRecord — 作答记录](#2-attemptrecord--作答记录)
3. [CoachMessage — 教练对话消息](#3-coachmessage--教练对话消息)
4. [辅助类型](#4-辅助类型)
5. [客户端存储键](#5-客户端存储键)
6. [坐标系](#6-坐标系)
7. [`isCurated` 的影响](#7-iscurated-的影响)

---

## 1. Puzzle — 题目对象

源文件：`types/index.ts`，实际数据：`content/puzzles/index.ts`。

| 字段               | 类型                 | 必填 | 说明                                                                             |
| ------------------ | -------------------- | ---- | -------------------------------------------------------------------------------- |
| `id`               | `string`             | ✅   | 全局唯一。每日题用 `YYYY-MM-DD`；题库题用 `<tag>-<n>`，如 `ld1-0`                |
| `date`             | `string`             | ✅   | 本地日期 `YYYY-MM-DD`，用于每日轮换计算                                          |
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

---

## 3. CoachMessage — 教练对话消息

存储在 `sessionStorage`，生命周期与浏览器标签绑定，关闭即清空。

| 字段      | 类型                    | 说明                                     |
| --------- | ----------------------- | ---------------------------------------- |
| `role`    | `"user" \| "assistant"` | 消息角色                                 |
| `content` | `string`                | 消息正文（每条限 2000 字符，服务端截断） |
| `ts`      | `number`                | 客户端时间戳（仅展示用，服务端忽略）     |

**sessionStorage 键**：`coach-${puzzleId}-${locale}`  
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

| 存储             | 键                            | 内容                   | 生命周期         |
| ---------------- | ----------------------------- | ---------------------- | ---------------- |
| `localStorage`   | `go-daily.attempts`           | `AttemptRecord[]` JSON | 永久（手动清除） |
| `localStorage`   | `go-daily.locale`             | `Locale` 字符串        | 永久             |
| `sessionStorage` | `coach-${puzzleId}-${locale}` | `CoachMessage[]` JSON  | 标签页关闭即清空 |

> **localStorage 无上限保护**：目前没有自动清理。预计每条记录约 100 字节，10 万条约 10 MB，一般浏览器限额 5–10 MB。规模化后需要加入**滚动清理**（见 [extensibility.md](./extensibility.md)）。

---

## 6. 坐标系

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

## 7. `isCurated` 的影响

| 行为                | `isCurated === true`（含缺省） | `isCurated === false`             |
| ------------------- | ------------------------------ | --------------------------------- |
| AI 教练             | ✅ 启用                        | ❌ 禁用（按钮隐藏）               |
| 题库「精选」标签    | ✅ 显示                        | ❌ 不显示                         |
| `solutionNote` 验证 | ✅ 检查四语言非空              | ⚠️ 跳过内容检查（但字段仍需存在） |
| 结果页解法注释      | ✅ 展示                        | 不展示 / 降级显示                 |

**何时设 `isCurated: false`**：批量导入的 SGF 题目通常没有经人工审校的解题注释，强行启用 AI 教练会导致模型依赖空字符串作为基准事实而产生幻觉。标记为 `false` 可安全引入大量题目而不影响精选题的体验质量。

---

_相关文档：[architecture.md](./architecture.md) · [puzzle-authoring.md](./puzzle-authoring.md) · [extensibility.md](./extensibility.md)_
