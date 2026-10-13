# 内容质量模型与 Coach 准入

**更新日期**: 2026-10-13（历史报告生成于 2026-05-18）
**报告来源**: `reports/puzzle-audit/latest.md`、`reports/quality/latest.md`、`reports/duplicates/latest.md`、`reports/content-queue/latest.md`、`reports/content-review/latest.md`

本文件解释题库质量分层及其验证边界。批准列表与运行时准入共同决定 Coach 能力；字段完整、合法着手和教学正确性是不同的证据。

## 一、当前事实

- **题库规模**：3033 道题，日期范围 2024-04-19 至 2026-04-26。
- **索引状态**：computed summaries 3033，index summaries 3033，stale / missing 均为 0。
- **棋盘尺寸**：3033 道全部为 19×19，当前没有 9×9 / 13×13 入门内容。
- **难度分布**：Level 1: 208，Level 2: 129，Level 3: 1409，Level 4: 1064，Level 5: 223。难度 3 占 46.5%，难度 4 占 35.1%。
- **标签分布**：`tesuji` 1822 道（60.1%），`life-death` 1187 道，`endgame` 12 道，`opening` 12 道。
- **解释质量**：历史全量审计为 `explained=3033`。本次重放复核发现 32 条非法错招分支，已保存到 `quarantinedCoachBranches.json` 并撤回完整 Coach 批准；当前批准数为 2998。静态解析保留，棋理仍需独立复核。
- **抽样质量**：195 个抽样题全部建议复审；P0-D 首批之外的题已补齐 `solutionSequence` 和 `wrongBranches`。
- **重复局面**：89 个部分重复组，覆盖 243 道题；完全重复组为 0。
- **分层数据源**：基础准入 ID 为 3033，完整 Coach 批准 ID 为 2998，变例组为 0。`getCoachAccess()` 同时要求批准与运行时质量通过；批准不是独立专业棋理审核的证明。
- **教学深度**：现有主线均只有一手，保留的错招反驳也只有一手。适合解释首手；完整计算路径、典型误区及同形迁移效果仍需精品内容批次验证。

## 二、四层内容模型

| 分层              | 最低字段 / 条件                                                       | 允许体验                                   | 不允许承诺                             |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------- |
| `basic-explained` | 有 `correct`、四语言 `prompt`、四语言 `solutionNote`                  | 每日题、题库浏览、结果页静态解析、基础复习 | 不承诺 AI 能诊断错招或讲完整变化       |
| `coach-eligible`  | 通过 `checkCoachEligibility()` 的基础质量门槛，可进入运营队列         | 受限 AI 基础解释、首题池、内容补强候选     | 不把它称为完整 Coach-ready             |
| `coach-ready`     | 有合法 `solutionSequence` 和 `wrongBranches`，通过解释门槛且经批准    | 按已有解析与分支提供 AI 教练               | 不自动证明棋理正确、完整变化或学习效果 |
| `variation-ready` | 重复组 / 同形题被人工整理成变化关系，有主线、错招、主题标签和差异说明 | 专题训练、弱项归因、下一题推荐、复盘路径   | 不把未经整理的重复题直接当成专题       |

当前基础候选为 3033 题，完整 Coach 批准为 2998 题；其余 35 题包括 32 题的分支隔离与 3 题原有内容缺口。`variation-ready=0`。这些数量表示实现准入，不代表教学正确率。

## 三、Coach 准入策略

现状：

1. `content/data/coachBasicEligibleIds.json` 表示基础解释准入，当前覆盖 3033 道题。
2. `content/data/coachReadyIds.json` 表示完整 Coach 批准，当前为 2998 道。
3. `content/data/variationGroups.json` 表示已整理的变例专题关系，当前为 0 组。
4. `lib/coach/coachEligibility.ts` 根据合法正解、解析质量及变化重放返回能力；非法变化不能授予完整教练，非法正解会阻止 Coach。
5. `lib/coach/coachAccess.ts` 只有在“分层数据源 + 运行时质量通过”同时成立时返回完整 Coach 可用。
6. 32 条原非法分支留在隔离数据及 `blocked` 复核批次中。恢复批准需要独立读棋，不能只满足字段或合法落子检查。

P0-A 迁移状态：

1. 旧 `coachEligibleIds.json` 已于 2026-06-10 删除（确认零代码引用后执行，原计划见 TECH_DEBT）。
2. 完整 Coach 要求 `qualityTier === "coach-ready"` 且题目在 `coachReadyIds.json` 中。
3. `variation-ready` 要求题目在已复核的 `variationGroups.json` 中。
4. `validate:puzzles` 会校验三个分层数据源、变例组和 `contentReviewBatches.json` 的一致性。
5. UI 文案已按 `basic-explained` / `coach-eligible` / `coach-ready` / `variation-ready` 展示能力边界。

## 四、内容队列优先级

下一版 `queue:content` 不应只输出 `coach-ready`。它应输出四类运营列表：

| 队列       | 目标                                    | 排序依据                                     |
| ---------- | --------------------------------------- | -------------------------------------------- |
| 补主线     | 为高价值题补 `solutionSequence`         | 难度 4-5、解析长度稳定、非重复或代表性重复组 |
| 补错招分支 | 为可教练题补 `wrongBranches`            | 高错误价值、常见死活/手筋误区、已有主线      |
| 重复治理   | 把 89 个部分重复组整理成同形题 / 变化题 | group size、同源同提示、解析差异、稀缺标签   |
| 入门扩展   | 补 9×9 / 13×13、`endgame`、`opening`    | 当前缺口最大、适合 onboarding、低难度优先    |

P0-B 已改造 `scripts/queueContent.ts` 并补 `tests/scripts/queueContent.test.ts`，当前脚本输出补主线、补错招分支、重复治理、入门扩展四类队列。

## 五、验收口径

- `validate:puzzles` 必须继续通过，不能破坏 `PuzzleSchema`。
- `validate:messages` 必须继续通过，不能制造 i18n key drift。
- 完整 Coach 可用题数必须由 `coachReadyIds.json`、`queue:content` 和 `getCoachAccess()` 共同解释，不再只看基础准入数量。
- 任何逻辑迁移不得修改 attempt dedup key：`puzzleId-solvedAtMs`。
- 不允许把 `lib/coach/coachState.ts`、`lib/supabase/service.ts`、`lib/stripe/server.ts` 这类 server-only 模块引入 client。
