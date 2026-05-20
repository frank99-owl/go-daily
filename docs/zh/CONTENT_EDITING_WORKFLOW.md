# 内容编辑工作流

**生成日期**: 2026-05-18
**阶段**: P0-D

本文件定义首批 Coach 内容补齐的人工工作流。它不生成题目答案，也不直接批准任何题进入完整 AI 教练；目标是把 `queue:content` 的运营队列转成可执行、可复核、可回滚的小批量编辑清单。

## 一、输入与输出

输入：

- `npm run queue:content` 输出的四类队列：补主线、补错招分支、重复治理、入门扩展。
- 当前题库数据：`content/puzzles.*` 与 `content/data/puzzleIndex.json`。
- 质量事实源：`docs/zh/CONTENT_QUALITY_MODEL.md`。

输出：

- `npm run plan:content-batch`
- 本地报告：`reports/content-batch/latest.json` 与 `reports/content-batch/latest.md`
- P0-D 首批复核清单：`reports/content-review/latest.json` 与 `reports/content-review/latest.md`
- 默认首批选择 **32 道题**，属于 20-50 道题的小批量范围。
- 报告只包含候选、缺失字段、审核清单和排序理由；**不包含自动生成的 `solutionSequence` 或 `wrongBranches` 内容**。

## 二、单题补齐流程

每道候选题按以下顺序处理：

1. **盘面核验**：确认 `correct` 与当前 `stones`、`toPlay` 一致，必要时用棋盘组件或 SGF 辅助核对。
2. **补主线**：填写 `solutionSequence`。只记录经过人工确认的主线，不把模型推断的变化直接写入题库。
3. **补错招分支**：填写 2-3 个常见 `wrongBranches`，每个分支必须有 `userWrongMove`、`refutation` 和四语言 `note`。
4. **本地校验**：运行 `npm run validate:puzzles`，确保坐标、颜色、字段结构合法。
5. **人工复核**：至少完成一次独立复核后，才允许把题目标记为完整 `coach-ready`。

## 三、重复组治理流程

重复组不先删除。先判断它们是否是：

- 同盘面但解说角度不同：整理成同形题 / 变化题候选。
- 同盘面但来源、标签、难度不同：记录差异，决定是否保留多题。
- 完全无差异重复：复核后再考虑去重。

未经整理的重复组不能直接标记为 `variation-ready`。

## 四、入门扩展流程

入门扩展只产出目标，不直接造题。新增 9×9 / 13×13 题时必须满足：

- 来源合法，或明确为原创内容。
- 先补 `prompt`、`solutionNote` 和基础题目字段。
- 不急于补 Coach 深字段；小棋盘入门题优先保证低摩擦练习价值。
- 合并前运行 `validate:puzzles`、`sync:puzzle-index` 和相关测试。

## 五、验收口径

- 首批报告包含 20-50 道现有题候选。
- 报告明确列出每题缺失 `solutionSequence`、`wrongBranches` 或两者。
- 报告明确 `generatedSolutionContent=false`、`requiresHumanReview=true`、`writesPuzzleData=false`。
- 编辑题库内容前后都必须可通过 `validate:puzzles`。
- 不修改 attempt dedup key：`puzzleId-solvedAtMs`。

## 六、P0-D 首批落地记录

P0-D 首批已在 `content/data/classicalPuzzles.json` 中补齐 20 道题的 `solutionSequence` 与 `wrongBranches`。这些题来自 `queue:content` 主线补齐候选，错招坐标均取自现有解析中明确点名的劣选，写入前已检查正解点和错手点在棋盘内且未被占用。

首批题目 ID：

`p-00605`、`p-00721`、`p-01022`、`p-01034`、`p-00657`、`p-00758`、`p-00837`、`p-00473`、`p-00503`、`p-00580`、`p-00607`、`p-00610`、`p-00681`、`p-00711`、`p-00419`、`p-00509`、`p-00587`、`p-02109`、`p-02121`、`p-02128`。

对应人工审核清单位置：

- `reports/content-review/latest.md`
- `reports/content-review/latest.json`
- `content/data/contentReviewBatches.json`

这批题只视为 `coach-ready` 首批补齐，不视为 `variation-ready`；重复组 / 同形变化关系仍需单独治理。

## 七、批次状态表

当前机器可读批次状态维护在 `content/data/contentReviewBatches.json`，并由 `npm run validate:puzzles` 校验：

| 批次                          | 状态       | 范围                   | 题数 | 人工复核 | 自动生成答案 |
| ----------------------------- | ---------- | ---------------------- | ---- | -------- | ------------ |
| `p0-d-coach-ready-2026-05-18` | `approved` | `coach-ready-backfill` | 20   | required | false        |

内部 review checklist 以该 JSON 文件为准；文档只解释流程，不再作为唯一事实源。
