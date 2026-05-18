# 发布前清单 (LAUNCH_CHECKLIST)

**生成日期**: 2026-05-18
**基线**: Phase 3 P2-E 发布材料首轮

本清单用于把 go-daily 从“本地可验证”推进到“可审批发布”。当前阶段只整理材料和本地检查，不部署、不 push、不改 DNS/SMTP/Stripe/Supabase/Vercel 等外部系统。

## 一、本地已完成

| 范围               | 当前状态   | 依据                                                                           |
| ------------------ | ---------- | ------------------------------------------------------------------------------ |
| P0 内容质量基线    | 已完成首轮 | 3033 题审计、内容质量模型、首批 20 道 `coach-ready`                            |
| P1 学习闭环        | 已完成首轮 | onboarding 首题、result 错因、下一题推荐、review/stats、CoachDialogue 克制升级 |
| P2-A 商业文案审计  | 已完成首轮 | Pro 权益改为高额配额与同步/SRS，不承诺“无限”或“保证提高”                       |
| P2-B Funnel 事件   | 已完成首轮 | activation / retention / coach / conversion 事件边界已写入规格                 |
| P2-C 本地生产烟测  | 已完成首轮 | `preflight:prod`、邮件 dry-run、Stripe 本地边界、SEO/PWA/错误体验              |
| P2-D AI 安全与成本 | 已完成首轮 | promptGuard、Coach 成本保护、Sentry/PostHog 隐私审计                           |
| P2-E 发布材料      | 已完成首轮 | 本文件、README polish、英文 case study、收入实验、访谈脚本、30/60/90 roadmap   |

## 二、发布前人工确认

这些项目不一定改外部系统，但需要 Frank 在发布窗口前人工确认。

- **产品定位**：确认公开表述仍是“每日围棋练习 + AI 辅助理解”，不承诺棋力提升结果。
- **GitHub 展示**：检查 README、截图/演示链接、license、commercial terms、security policy 是否适合公开访客阅读。
- **内容边界**：确认当前只把首批 20 道题视为完整 `coach-ready`，其余题按基础解释或受限问答呈现。
- **定价与权益**：确认 Pro 对外只写每日 50+ / 每月 1,000+ Coach 配额、多设备同步、SRS、去广告。
- **合规文本**：确认隐私、条款、退款页面与当前 Stripe/邮件/AI 数据流一致。
- **客服路径**：确认公开邮箱、退款处理 SLA、漏洞报告渠道与实际可维护能力匹配。
- **数据最小化**：确认 PostHog/Sentry/DeepSeek 不接收邮箱、支付 ID、设备 ID、token、自由输入全文或 AI 对话全文。
- **手动回滚预案**：确认 Vercel 回滚、Stripe Checkout 关闭、商业开关 `NEXT_PUBLIC_IS_COMMERCIAL=false`、邮件暂停路径。

## 三、需要 Frank 单独批准的外部动作

以下动作会影响外部系统、公开可见状态、账单或真实用户，必须单独批准后才能执行。

| 动作                          | 风险                                 | 发布窗口前要求                                  |
| ----------------------------- | ------------------------------------ | ----------------------------------------------- |
| `git push`                    | 改变远端仓库状态，触发 CI 或公开代码 | 先确认 diff、commit 范围和目标分支              |
| 创建或更新 PR                 | 公开发布材料和代码状态               | 先确认标题、描述、是否 draft                    |
| 部署 Vercel                   | 影响线上访问和可能触发真实集成       | 先确认环境变量、回滚点、域名指向                |
| DNS / Cloudflare 修改         | 影响域名解析、缓存、TLS              | 先确认记录、TTL、回滚值                         |
| SMTP / Resend 配置            | 影响真实邮件送达与域名信誉           | 先确认 sender、SPF/DKIM、测试地址               |
| Supabase 生产迁移或策略修改   | 影响用户数据与权限                   | 先确认 migration、备份、RLS 行为                |
| Stripe live 产品/价格/Webhook | 影响真实支付、税务与订阅             | 先确认 live key、税务、退款政策、webhook secret |
| 真实邮件发送                  | 触达外部人员                         | 先确认收件人、正文、退订/联系路径               |
| 生产支付测试                  | 产生真实交易或退款流程               | 先确认金额、税费、退款方式                      |
| 公开发布公告                  | 形成外部承诺                         | 先确认文案、渠道、监控与客服值守                |

## 四、发布窗口建议顺序

1. 冻结本地 diff，确认待发布 commit 范围。
2. 跑本地验证：`validate:messages`、`lint`、`tsc --noEmit`、必要时 `preflight:prod` 和 `build`。
3. Frank 批准 push / PR。
4. 合并或部署前确认 Vercel 环境变量和 Upstash/Stripe/Resend/Supabase 生产配置。
5. 在明确发布窗口执行 live smoke：Stripe Webhook、邮件送达、关键页面、Coach 限流和错误上报。
6. 发布后 24 小时观察 Sentry、PostHog、Vercel logs、Stripe events 和邮件退信。

## 五、停止发布条件

- 生产环境缺少 Upstash Redis，且商业入口或 Coach 入口会对真实用户开放。
- Stripe live Webhook 未配置或事件幂等表不可写。
- 邮件域名 SPF/DKIM 未通过，且需要发送交易邮件。
- 发现 README、法律页或定价页仍包含不可证明承诺。
- Sentry/PostHog 出现邮箱、token、支付 ID、设备 ID 或自由输入全文。
- 关键路径 smoke 出现无法登录、无法完成题目、无法取消订阅或无法回滚的风险。
