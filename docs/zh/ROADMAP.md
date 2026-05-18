# Phase 3 路线图

**生成日期**: 2026-05-18
**仓库 HEAD**: `9078346`

目标是把 go-daily 从功能完整的每日题库，推进为学习价值明确、可留存、可转化、可运营的围棋学习系统。路线图按 P0 / P1 / P2 推进，每次只做一个明确主题。

## P0：事实源与内容质量

P0-A / P0-B / P0-C / P0-D 已完成首轮落地，后续仍可按验证结果小步修正。当前执行项是 P2-E。

| 子项 | 目标                         | 交付                                                                             |
| ---- | ---------------------------- | -------------------------------------------------------------------------------- |
| P0-A | 同步事实源，建立内容质量分层 | 更新项目状态、修正文档 drift、新增内容质量模型、提出 `coachEligibleIds` 迁移方案 |
| P0-B | 改造内容队列                 | `queue:content` 输出补主线、补错招、重复治理、入门扩展队列，并补脚本测试         |
| P0-C | Coach 准入分层落地           | UI / API 明确区分基础解释、完整 Coach、变例追问，不破坏现有准入                  |
| P0-D | 内容编辑工作流               | 首批 20-50 道题补齐 `solutionSequence` / `wrongBranches`，形成人工审核清单       |

## P1：真实学习闭环

围绕 `onboarding → first puzzle → result → coach → review → next recommendation` 做最小可用闭环。P1-A / P1-B / P1-C / P1-D / P1-E 已完成首轮落地，后续按真实使用反馈小步加固。

| 子项 | 目标                    | 交付                                                                                                            |
| ---- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| P1-A | onboarding 变成训练入口 | 新用户选水平后直接完成一题，并看到下一步                                                                        |
| P1-B | result 增加错因理解     | 引入 `missed-vital-point`、`shape-reading`、`liberty-counting`、`endgame-value`、`opening-direction` 等错因归类 |
| P1-C | 下一题推荐              | 根据难度、对错、错因、历史 attempts、onboarding level 推荐继续练习或 review                                     |
| P1-D | review / stats 升级     | 展示今日该练什么、积压、弱项、趋势、复习完成率                                                                  |
| P1-E | CoachDialogue 克制升级  | 展示配额状态感、能力等级、建议问题、错误重试；不泄露具体敏感配额细节                                            |

P1 首轮真实交付：onboarding 首题闭环、result 错因理解、下一题推荐、review / stats insight、CoachDialogue 克制升级。

## P2：发布、增长与运营

P2-A / P2-B / P2-C / P2-D 已完成首轮落地。当前执行项是 P2-E：发布材料。

P2-C 已补齐可在本地重复运行的生产烟测：关键页面/API smoke、性能预算、SEO、PWA/offline、错误体验、邮件 dry-run 与 Stripe 本地校验。P2-D 已补强 AI 安全与成本控制：promptGuard 红队测试、Coach 成本保护、Sentry/PostHog 隐私审计。非目标仍是：不部署、不真实发送邮件、不真实创建 Stripe 支付、不访问或修改外部系统。

| 子项 | 目标           | 交付                                                                                            |
| ---- | -------------- | ----------------------------------------------------------------------------------------------- |
| P2-A | 商业化文案审计 | 已完成首轮落地：避免“无限”“保证提高”“专业级”等不可证明表述                                      |
| P2-B | Funnel 与事件  | 已完成首轮落地：梳理 activation / retention / conversion 的 PostHog 事件                        |
| P2-C | 生产烟测       | 已完成首轮落地：本地 smoke test、性能预算、SEO、PWA/offline、错误体验、邮件、Stripe             |
| P2-D | AI 安全与成本  | 已完成首轮落地：promptGuard 红队测试、Coach 成本保护、Sentry/PostHog 隐私审计                   |
| P2-E | 发布材料       | LAUNCH_CHECKLIST、GitHub 展示、英文 case study、收入实验计划、用户访谈脚本、30/60/90 天 roadmap |

## 当前推进原则

- 文档事实必须来自代码、报告和命令输出。
- 逻辑变更必须补测试；UI 关键路径变更补组件或页面测试。
- 涉及全局行为时运行 `validate:puzzles`、`validate:messages`、`lint`、`typecheck`、`test`、`build`。
- 不部署、不推送、不改外部系统、不暴露 secrets。
- 不破坏 attempt dedup key：`puzzleId-solvedAtMs`。
