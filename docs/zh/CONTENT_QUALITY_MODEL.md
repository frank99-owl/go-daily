# 内容质量模型与 Coach 准入

**生成日期**: 2026-05-18
**仓库 HEAD**: `fb406d6`
**报告来源**: `reports/puzzle-audit/latest.md`、`reports/quality/latest.md`、`reports/duplicates/latest.md`、`reports/content-queue/latest.md`、`reports/content-review/latest.md`

本文件是 P0-A 的事实源，用于把 go-daily 的题库从“有题、有解析”提升为“可解释、可教练、可运营”的内容系统。这里描述目标模型和迁移路径，不直接改变现有 Coach 功能。

## 一、当前事实

- **题库规模**：3033 道题，日期范围 2024-04-19 至 2026-04-26。
- **索引状态**：computed summaries 3033，index summaries 3033，stale / missing 均为 0。
- **棋盘尺寸**：3033 道全部为 19×19，当前没有 9×9 / 13×13 入门内容。
- **难度分布**：Level 1: 208，Level 2: 129，Level 3: 1409，Level 4: 1064，Level 5: 223。难度 3 占 46.5%，难度 4 占 35.1%。
- **标签分布**：`tesuji` 1822 道（60.1%），`life-death` 1187 道，`endgame` 12 道，`opening` 12 道。
- **解释质量**：全量审计为 `explained=3033`；P0-D 首批补齐后，`queue:content` 报告 `coach-ready=20`，主线补齐候选为 2859。
- **抽样质量**：195 个抽样题全部建议复审；P0-D 首批之外的题仍普遍缺 `solutionSequence` 和 `wrongBranches`。
- **重复局面**：89 个部分重复组，覆盖 243 道题；完全重复组为 0。
- **现有白名单**：`content/data/coachEligibleIds.json` 含 3033 个 ID；但 `getCoachAccess()` 同时要求 ID 在白名单内且 `checkCoachEligibility()` 通过运行时质量校验，因此当前完整 Coach 可用题为 20，而不是 3033。

## 二、四层内容模型

| 分层              | 最低字段 / 条件                                                       | 允许体验                                   | 不允许承诺                       |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------ | -------------------------------- |
| `basic-explained` | 有 `correct`、四语言 `prompt`、四语言 `solutionNote`                  | 每日题、题库浏览、结果页静态解析、基础复习 | 不承诺 AI 能诊断错招或讲完整变化 |
| `coach-eligible`  | 通过 `checkCoachEligibility()` 的基础质量门槛，可进入运营队列         | 受限 AI 基础解释、首题池、内容补强候选     | 不把它称为完整 Coach-ready       |
| `coach-ready`     | 有 `solutionSequence` 和 `wrongBranches`，且经批准                    | 完整 AI 教练、错招诊断、主线讲解、建议追问 | 不自动代表已整理成专题变化关系   |
| `variation-ready` | 重复组 / 同形题被人工整理成变化关系，有主线、错招、主题标签和差异说明 | 专题训练、弱项归因、下一题推荐、复盘路径   | 不把未经整理的重复题直接当成专题 |

当前 3033 题的合理归类是：全库可作为 `coach-eligible` 的基础候选；P0-D 首批 20 道已达到 `coach-ready`，其余 3013 道仍主要停留在 `explained` / `coach-eligible`；`variation-ready=0`。这不是题库不可用，而是说明它适合做“结果页解析和基础练习”，还不适合大规模开放“变例追问和错招诊断”。

## 三、Coach 准入策略

现状：

1. `content/data/coachEligibleIds.json` 是历史白名单，当前覆盖 3033 道题。
2. `lib/coach/coachEligibility.ts` 根据正解、解析质量、`solutionSequence`、`wrongBranches` 返回 `qualityTier` 和 `hasVariationSupport`。
3. `lib/coach/coachAccess.ts` 只有在“白名单 + 运行时质量通过”同时成立时返回 `coachAvailable=true`。
4. P0-D 首批 20 道已补齐变例字段，`content-queue` 当前输出 20 个 `coach-ready` 候选；其余题仍进入补主线或重复治理等运营队列。

P0-A 迁移方案：

1. **不立刻删除或清空 `coachEligibleIds.json`**，避免破坏 onboarding、结果页 Coach 展示和现有测试假设。
2. **先在文档和运营语言中降级白名单语义**：它表示“基础解释候选 / 可进入内容队列”，不是“完整 Coach-ready”。
3. **新增分层数据结构前先保持运行时双门控**：完整 Coach 仍要求 `qualityTier === "coach-ready"` 或等价批准结果。
4. **后续小步迁移**：把 `coachEligibleIds.json` 拆成 `coachBasicEligibleIds`、`coachReadyIds`、`variationGroupIndex` 或等价结构；每一步都补脚本测试和 API / UI 断言。
5. **UI 文案同步**：对 `basic-explained` / `coach-eligible` 题，只展示“基础解释”或“当前题暂不支持深入变例”；对 `coach-ready` 题才展示完整教练入口。

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
- 完整 Coach 可用题数必须由 `queue:content` 和 `getCoachAccess()` 共同解释，不再只看 `coachEligibleIds.json` 长度。
- 任何逻辑迁移不得修改 attempt dedup key：`puzzleId-solvedAtMs`。
- 不允许把 `lib/coach/coachState.ts`、`lib/supabase/service.ts`、`lib/stripe/server.ts` 这类 server-only 模块引入 client。
