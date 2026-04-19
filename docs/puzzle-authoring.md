# 加题工作流

> English version: [puzzle-authoring.en.md](./puzzle-authoring.en.md)

这份文档告诉你三件事：
1. 一道谜题从 0 到线上需要什么
2. 三种加题路径 —— 手写 curated · 批量 SGF 导入 · 未来的新源
3. 怎么在本地一键验证数据，不让脏题上线

## 一道题需要什么

最小字段（所有谜题都必须有）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 全库唯一。curated 推荐 `YYYY-MM-DD` 或 `ld-001`；导入题用 `cho-e-001` 这种带前缀格式 |
| `boardSize` | `9 \| 13 \| 19` | 棋盘路数 |
| `stones` | `Stone[]` | 起始盘面。坐标 0-indexed，从左上 `(0,0)` 起 |
| `toPlay` | `"black" \| "white"` | 谁先走 |
| `correct` | `Coord[]` | **第一步**的合法解点（支持多正解） |
| `tag` | `PuzzleTag` | `life-death` / `tesuji` / `endgame` / `opening` |
| `difficulty` | `1..5` | 1 最简单 |
| `prompt` | `LocalizedText` | 四语言题目描述（zh/en/ja/ko）|
| `solutionNote` | `LocalizedText` | 四语言解答说明 —— **AI 陪练把这当 ground truth** |

可选但推荐（curated 尤其值得写齐）：

| 字段 | 说明 |
|---|---|
| `solutionSequence` | 完整正解变化 · 结果页「播放正解」会用 |
| `wrongBranches` | 常见错棋及反驳手段 · coach 有这个会更有料 |
| `isCurated` | `true`（默认省略即是）= 完整陪练；`false` = 仅入库，不走陪练 |
| `source` | 来源标签，比如 `"Cho Chikun · Life & Death · Elementary"` |
| `date` | `YYYY-MM-DD`，导入题用占位值 `"2026-04-18"` |

完整 schema 见 [`data-schema.md`](./data-schema.md)。

## 路径 A：手写一道 curated 题

curated 题 = 有完整 4 语言解说、开启 AI 陪练、参与每日轮换的 first-class 题目。这是**未来绝大多数 Frank 亲自加的题**走的路径。

### 步骤

1. **确定盘面**。在纸上 / 棋谱软件里画好 —— 初始 stones 和正解第一手
2. **记录坐标**。内部坐标系是 **0-indexed `(x, y)` 从左上**。19 路的 R17（星位）对应 `(x=15, y=2)`。SGF 字母映射：a=0, b=1, ..., s=18
3. **在 `content/puzzles.ts` 加一条**：

```ts
// content/puzzles.ts
import type { Puzzle } from "@/types";
import { IMPORTED_PUZZLES } from "@/lib/importedPuzzles";

const CURATED_PUZZLES: Puzzle[] = [
  {
    id: "2026-05-01",
    date: "2026-05-01",
    boardSize: 19,
    stones: [
      { x: 2, y: 2, color: "black" },
      { x: 3, y: 2, color: "black" },
      // ...
    ],
    toPlay: "black",
    correct: [
      { x: 2, y: 1 }, // 主解
      { x: 1, y: 2 }, // 同效变化（如果有）
    ],
    solutionSequence: [
      { x: 2, y: 1, color: "black" },
      { x: 3, y: 1, color: "white" },
      { x: 4, y: 2, color: "black" },
    ],
    wrongBranches: [
      {
        userWrongMove: { x: 4, y: 4 },
        refutation: [
          { x: 5, y: 5, color: "white" },
          { x: 5, y: 4, color: "black" },
        ],
        note: {
          zh: "白五五挡住后黑无法做活。",
          en: "White's shoulder hit at 5-5 prevents black from making two eyes.",
          ja: "白の5-5のカタツキで黒は二眼が作れない。",
          ko: "백의 5-5 어깨짚기로 흑은 두 눈을 낼 수 없다.",
        },
      },
    ],
    isCurated: true,
    tag: "life-death",
    difficulty: 2,
    prompt: {
      zh: "黑先活",
      en: "Black to play and live",
      ja: "黒先活",
      ko: "흑선활",
    },
    solutionNote: {
      zh: "关键是 2-1 的『虎口』，让白无法夺眼。",
      en: "The vital point is the 2-1 'tiger's mouth' — it denies White the eye-gouging move.",
      ja: "2-1 の急所（虎の口）が要。白の眼取りを許さない。",
      ko: "2-1 급소(호구)가 포인트 — 백의 눈 빼앗기를 막는다.",
    },
    source: "Frank · 2026 spring", // 可选
  },
];

export const PUZZLES: Puzzle[] = [...CURATED_PUZZLES, ...IMPORTED_PUZZLES];
```

4. **跑校验**：

```bash
npm run validate:puzzles
# ✓ Validated 101 puzzles (1 curated, 100 library)
```

5. **本地试玩**：

```bash
npm run dev
# 打开 http://localhost:3000/puzzles/2026-05-01
```

6. **提交前 `npm run build`** —— `prebuild` 钩子会自动跑校验，确保不会破站。

### 最容易踩的坑

- **坐标系搞反**：内部 `(x, y)` = 列、行，从左上起。别写成"从下往上"
- **`correct` 只写了第一手，忘了 `solutionSequence`**：陪练还能跑（有 `solutionNote`），但结果页「播放正解」不会动
- **漏翻译某语言**：`prompt` / `solutionNote` 任一语言为空字符串，校验会拦住。有 `localized()` fallback 兜底所以不会 crash，但校验依然 fail 强制补齐
- **ID 重复**：校验会指出第一次/第二次出现的 index

## 路径 B：批量 SGF 导入

当前的 `lib/importedPuzzles.ts`（100 题 Cho Chikun 初级死活）就是这样来的。

### 命令

```bash
npm run import:puzzles
```

背后跑的是 `scripts/importTsumego.ts`：

1. 从 GitHub 抓 `sanderland/tsumego`（MIT 协议）的 `Cho Chikun Encyclopedia Life And Death - Elementary` 集合
2. 前 100 道，SGF 坐标转 `(x, y)`
3. 写入 `lib/importedPuzzles.ts`（带 auto-generated 横幅，不要手改）

### 设计约定

- 导入题统一 `isCurated: false` —— 因为没有手写 4 语言 solutionNote，陪练自动 gate off（见 `ResultClient.tsx` 的条件渲染），避免 LLM 胡说
- `prompt` 是通用模板：「黑先，找到正确的急所」
- `solutionNote` 是泛指："经典死活题，点「查看正解」看到急所" —— 结果页会显示，但陪练读不到它
- `source` 带版权标签

### 调整来源

想换一个集合？改 `scripts/importTsumego.ts` 顶部的常量：

```ts
const COLLECTION = "Cho Chikun Encyclopedia Life And Death - Elementary";
const CATEGORY = "1a. Tsumego Beginner";
const HOW_MANY = 100;
```

其他可选 collection 见 [sanderland/tsumego 仓库](https://github.com/sanderland/tsumego) 的 `problems/` 目录。

## 路径 C：未来的其他源

如果之后接入新源（比如 OGS 公开对局、Frank 自己的 SGF 文件夹、某 API）—— 推荐沿用 **importTsumego 的套路**：

1. 新建 `scripts/importX.ts`，读取源数据，转成 `Puzzle[]`
2. 写到独立文件 `lib/importedX.ts`（auto-generated 横幅 + 不手改约定）
3. 在 `content/puzzles.ts` 里 merge：

```ts
export const PUZZLES: Puzzle[] = [
  ...CURATED_PUZZLES,
  ...IMPORTED_PUZZLES,
  ...IMPORTED_X_PUZZLES,  // 新源
];
```

4. 给新 script 加一条 `package.json` 命令（如 `"import:ogs": "tsx scripts/importOgs.ts"`）
5. **必做**：给 ID 加独特前缀避免撞车（`cho-e-001` vs `ogs-2024-001`）—— 校验会帮你抓到，但让 ID 可读性更好

**坚决不要**做的事：
- 直接往 `lib/importedPuzzles.ts` 里追加别的源的题 —— 这个文件是 auto-generated 的
- 跳过校验直接 commit —— 你一个人 work 的时候可能没事，但 CI/部署会当场炸

## 校验规则清单

`scripts/validatePuzzles.ts` 会挑出这些硬错：

| 规则 | 含义 |
|---|---|
| `id` | 重复或空 |
| `boardSize` | 不是 9 / 13 / 19 |
| `difficulty` | 不是 1..5 整数 |
| `tag` | 不在允许的 enum 里 |
| `toPlay` | 不是 black / white |
| `correct` | 空数组 / 越界 |
| `stones` | 越界 / 坐标重合 / 非法颜色 |
| `solutionSequence` | 越界 / 非法颜色（可选存在） |
| `wrongBranches` | refutation 越界 / 缺 note 某语言 |
| `prompt` | 四语言任一为空 |
| `solutionNote` | 四语言任一为空（仅 `isCurated !== false` 时强制） |

**不校验的软错**（留给人工 review）：
- 难度标注是否准确
- tag 分类是否合理
- 正解是否对弈中真的成立（这要棋力，不是机械检查）
- 翻译是否地道

## 常见排错

| 症状 | 可能原因 |
|---|---|
| `npm run build` 失败，报 `✗ 1 issue(s)` | 跑 `npm run validate:puzzles` 看详细错误 |
| 新 curated 题不出现在 `/puzzles` 列表 | 检查是不是 merge 进 `PUZZLES` 导出；重启 dev server |
| 陪练出现但没读懂解答 | `solutionNote` 写得太简；陪练只能基于这个 + `solutionSequence` + `wrongBranches` grounding |
| 切到日语解答显示其他语言 | `localized()` fallback 起作用了 —— 说明 `solutionNote.ja` 为空，校验本该拦下，检查有没有绕过 |
| 结果页没有「查看正解」按钮 | 当前 UI 逻辑：`showAnswer` 取决于 `puzzle.correct[0]` 存在。只要 `correct[]` 非空就会显示 |

## 延伸阅读

- [`data-schema.md`](./data-schema.md) —— 每个字段的语义细节
- [`i18n.md`](./i18n.md) —— 翻译字段的写作风格建议
- [`ai-coach.md`](./ai-coach.md) —— `solutionNote` 是怎么被陪练使用的
