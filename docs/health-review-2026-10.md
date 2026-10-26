# go-daily 生产健康体检

> 体检日期：2026 年 10 月 26–27 日
> 起点：`main` @ `df4964b`；修复截至 `84e3115`
> 方法：只用原始数据下结论（Vercel 日志、Supabase SQL / 日志 / advisors、Stripe API、PostHog 原始事件、两个锁文件、构建产物、生产响应头）。每条结论附可复现的出处。

---

## 0. 结论

go-daily 在生产上是健康的：RLS 覆盖全部 9 张表，付费数据与 Stripe 逐条对得上，运行时依赖 0 个已知漏洞，coach 近 30 天 0 次失败，live 评测 16/16、judge 校准 10/10。

真正的风险集中在三处，都不是代码质量问题：

1. **数据库没有任何备份**（free 计划不含备份）。这是唯一的中等风险，修复成本为零。
2. **测试守住了大部分逻辑，却漏掉了收费和配额的关键不变量。** 变异测试得分 53.4%：Stripe 幂等、权益到期时间、访客 IP 限额都有“改坏了测试也照样通过”的情况。已补测试，得分提到 75.8%。
3. **体检本身发现了 3 个生产缺陷，均已修复**：服务端埋点在函数冻结时丢失（15 次里丢 2 次）；每日邮件 cron 有潜在死循环，一旦触发会给同一个人重复发信；数据库函数对浏览器开放。

真实使用量很低：每周访客 33–55 人，付费用户 0 个，外部收入 0。按体检开始时定下的分档，维护投入应该只放在**安全、数据和付费链路**上（§6）。

---

## 1. 健康标准对照

| #   | 指标        | 目标                                      | 实测                                                                                                              | 状态                                      |
| --- | ----------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 0   | 真实使用量  | 基准值                                    | 每周访客 33–55；每周解题 28–55（9-28 那周 157 题，其中一人做了 91 题）；近 30 天 coach 调用 15 次（7 人）；付费 0 | 已测                                      |
| 1   | API 错误    | 每个 5xx 都能解释                         | 1 小时快照：50 个请求，只有 200/308/404（唯一的 404 是 `/xmlrpc.php` 扫描器）                                     | ⚠️ 无法验证 30 天                         |
| 2   | 可用性      | 月可用率 ≥ 99.5%                          | 没有外部监控                                                                                                      | ❌ 无数据                                 |
| 3   | 付费链路    | 投递 100%；对账 0 差异                    | 2 个订阅与 `subscriptions` 表完全一致；`stripe_events` 22 行，0 未处理、0 错误                                    | ✅ 对账；⚠️ 近 30 天 0 个事件             |
| 4   | 数据可恢复  | 有备份、能恢复                            | 没有备份                                                                                                          | ❌                                        |
| 5   | 页面性能    | p75 LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1    | CrUX “No Data”；Lighthouse 13.5 手机端（10-27）：性能 95，FCP 0.9s、LCP 2.6s、TBT 120ms、CLS 0.011                | ⚠️ 实验室 LCP 超线 0.1s；真实用户数据不足 |
| 6   | AI 成本     | 每位付费用户 < 订阅价 20%                 | 0 付费用户；10-26 的 25 次 eval 调用扣费约 0.03 元                                                                | ✅（可忽略）                              |
| 7   | 安全与依赖  | 漏洞 0；安全头 ≥ A；advisor 无未解释 WARN | 漏洞 0；Observatory B（75）→ **B+（80）**；函数相关的 8 条 WARN → 0，剩 1 条 leaked password（Pro 计划才有）      | ⚠️ 安全头未达 A                           |
| 8   | 测试有效性  | 变异得分 ≥ 70%                            | 53.4% → **75.8%**                                                                                                 | ✅（修复后）                              |
| 9   | AI 教练质量 | live 16/16，judge 校准 10/10              | 16/16；10/10（每例 3/3）                                                                                          | ✅                                        |

---

## 2. 发现与处理状态

| 级别 | 发现                                                                             | 分类   | 状态                                   |
| ---- | -------------------------------------------------------------------------------- | ------ | -------------------------------------- |
| 中   | 数据库无备份                                                                     | 有问题 | ⏳ 待决定（§5-D）                      |
| 中   | 每日邮件 cron 潜在死循环，update 失败时会重复发信                                | 有问题 | ✅ `5d1fe96`                           |
| 中   | Stripe 幂等、`lib/stripe/server.ts`、权益到期计算缺测试                          | 有问题 | ✅ `c3b1d4a`                           |
| 低   | 服务端 coach 埋点在函数冻结时丢失（15 次丢 2 次）                                | 有问题 | ✅ `7b88a7c`                           |
| 低   | 7 个数据库函数对 anon / authenticated 开放，`search_path` 可变                   | 有问题 | ✅ 迁移 0011 已应用                    |
| 低   | Email provider 对 API 开放注册，界面却隐藏了入口                                 | 有问题 | ⏳ 待决定（§5-C/F）                    |
| 低   | 每日邮件默认订阅：54 人在收，近 30 天活跃 9 人，已退订 11 人                     | 有问题 | ⏳ 待决定（§5-E）                      |
| 低   | locale cookie 无 `Secure`；CSP 多放行了 DeepSeek                                 | 有问题 | ✅ `84e3115`，复扫 B+（80）            |
| 低   | 内存兜底的 IP 限额在计数表满时会把被检查的地址自己淘汰掉                         | 有问题 | ✅ `7813b75`（生产用 Redis，不受影响） |
| 低   | 桌面端 release 的 tag 不含桌面源码，发布脚本不指定提交                           | 有问题 | ✅ `5dad2c7`，tag 已移到 `2366f54`     |
| 低   | 首屏 JS 每个页面都在 450 KB gzip 以上                                            | 有问题 | ⏳ 视增长目标而定（§6）                |
| 低   | 题目页 `<title>` 只有编号，description 按题型套模板                              | 有问题 | ⏳ 先看 Search Console                 |
| 低   | `www` 跳转是 307（临时）                                                         | 有问题 | ⏳ Vercel Domains 改 308               |
| 信息 | 桌面端 4.5 个月下载 9 次                                                         | 信息   | §6                                     |
| 信息 | 死代码 `incrementCoachUsage` / `incrementGuestUsage`、失效的 `fast-uri` override | 有问题 | ✅ 已删                                |

---

## 3. 各项证据

### 3.1 用量与错误（步骤 2）

- **用量**：PostHog HogQL 按周统计 `$pageview` 的独立访客和 `puzzle_solved`；30 天漏斗：开始入门 46 → 完成首题 36；开始做题 73 → 至少解出一题 52。Supabase `auth.users` 共 65 个，近 60 天新增 18 个，全部来自 Google 登录。
- **coach**：`coach_usage` + `guest_coach_usage` 记录 15 次调用（登录用户 4 次、访客 11 次），PostHog 的 `coach_request_completed` 只有 13 条，`coach_request_failed` 从未出现。差的 2 条，原因是服务端在 `controller.close()` 之后才发送埋点，函数随即被冻结。修复后先发送、再关闭，最多等 2 秒（`ANALYTICS_FLUSH_BUDGET_MS`）。**验收**：下一批真实调用中，PostHog 条数等于 `coach_usage` 条数。
- **5xx**：Vercel Hobby 的运行日志只保留约 1 小时，30 天的 `[api-5xx]` 无法事后统计。Supabase 24 小时日志里没有 Postgres 错误。
- **更正**：10-22 的提交说 PostHog 的外部脚本“从未运行过”，这不准确。原始事件里有 2 条 `$web_vitals`（10-05、10-09），应改为“绝大多数时候被拦截，偶尔能运行”。

### 3.2 付费链路（步骤 3）

- Stripe live 账户里 2 个订阅（均已取消），与 `subscriptions` 表逐条一致；3 次完成的结账中，有一次是 $1 的冒烟测试（`production_smoke_refundable`），当天退款。唯一的付费订阅是站长本人的，外部收入 $0。
- webhook endpoint 已启用，订阅的正好是代码处理的 6 种事件。`stripe_events` 共 22 行（05-03 至 07-10），0 未处理、0 错误。
- 测试模式的端到端结账按决定没有执行，只做了对账。

### 3.3 数据库（步骤 4）

- **健康**：9/9 张表开启 RLS（`pg_tables.rowsecurity`），用户表策略均为 `auth.uid() = user_id`，`stripe_events` / `guest_coach_usage` / `manual_grants` 对客户端全拒。应用查询平均 ≤ 16 ms、最慢 42 ms（`pg_stat_statements`）。库大小 13 MB。
- **备份**：Supabase 文档（Database Backups）写明自动备份只覆盖 Pro 及以上计划，并建议 free 计划自己用 `db dump` 做异地备份。
- **函数权限**：迁移 0011 收回 PUBLIC / anon / authenticated 对 6 个配额函数和 `handle_new_user` 的 EXECUTE，并把配额函数的 `search_path` 固定为空。验证：`has_function_privilege` 逐个角色核对；service_role 以 limit 0 调用（不会写入）正常返回；anon 调用返回 `permission denied`；安全 advisor 里函数相关的 8 条 WARN 降到 0；剩下的 1 条是 leaked password protection，只有 Pro 计划才能开启。
- **Auth**：`/auth/v1/settings` 返回 `email: true`、`disable_signup: false`，但生产登录页只有 Google 和访客两个入口。7 个 email 账号都带密码，而 app 从未调用过带密码的注册，所以它们都不是从界面注册的。`NEXT_PUBLIC_ENABLE_EMAIL_LOGIN` 在 Production 中存在，但界面没有邮箱入口，说明它的值不是 `"true"`。leaked password protection 只有 Pro 计划才有。
- **每日邮件 cron**：skip 分支不标记行，update 失败的行也会再次被查出，`while(true)` 会空转到函数超时，并且每一轮都重发邮件。原测试的 mock 只返回一次数据，所以没有发现。修复后用有状态的假表测试，两个循环用例在旧代码上会失败。**验收**：每天 00:00 UTC 的运行中，Supabase edge_logs 里每个收件人的 `getUserById` 只出现一次（10-26 那次：53 人，各 1 次）。

### 3.4 依赖与供应链（步骤 5）

- OSV.dev `querybatch`：npm 612 个 name@version、0 个漏洞（npm 别名包已用真实包名补查）；`npm audit` 结果一致。
- Cargo 有 6 条通告：glib unsoundness、4 个 crate 停止维护，都只出现在 Linux 构建中（`cargo tree --target aarch64-apple-darwin` 里不存在）；tokio `AsyncFd` 在 macOS 构建里没有启用 `net` feature，不会被编译。
- 带安装脚本的包恰好 4 个，`allowScripts` 都设为 `false`；所有包都来自 registry 且带 integrity；CI 只用 GitHub 官方 Actions，默认 token 只读。
- 桌面端 release 的问题：`gh release create` 没有带 `--target`，tag 被打在远端 main（eea5d3a）上。脚本现在会在构建前检查四项，四项都已实测（第三项只验证了正向路径）。

### 3.5 测试有效性（步骤 6）

Stryker 10.1.1（`--no-save` 临时安装；provenance 来自 stryker-js 的 v10.1.1 tag）对 `lib/coach`、`lib/stripe` 生成 1501 个变异体：

| 模块                               | 之前  | 之后  |
| ---------------------------------- | ----- | ----- |
| `stripeEventStore`（webhook 幂等） | 31%   | 92%   |
| `lib/stripe/server.ts`             | 0%    | 91%   |
| `stripeWebhookHelpers`             | 37%   | 87%   |
| `coachStreamHandler`               | 32%   | 86%   |
| `guestCoachUsage`                  | 16%   | 94%   |
| 整体                               | 53.4% | 75.8% |

剩下的存活变异体大多在日志文案、analytics / 邮件字段、prompt 文本（由 eval 覆盖）里，以及 `variationGroups.json` 为空时到达不了的 variation-ready 等级。

### 3.6 前端与搜索（步骤 7）

- **安全头**：Mozilla Observatory B（75），推送 `84e3115` 后复扫为 B+（80）。扣分有两项：`script-src 'unsafe-inline'`（−20，为保留静态渲染而接受）和 cookie 无 `Secure`（−5，已修）。HSTS：`.app` 整个顶级域都在 preload 列表中（hstspreload.org `preloaded`）。
- **JS 体积**：每个路由首屏 450–465 KB gzip（读取 `.next/server/app/**/page_client-reference-manifest.js` 统计）；生产首页实测 17 个文件，传输 451 KB，解压后 1,386 KB。主要构成（gzip 后）：PostHog 约 104 KB、Next/React 约 120 KB、Supabase 约 68 KB、framer-motion 约 49 KB、4 种语言的全部文案约 46 KB（每个访客只用得到其中一种）。
- **SEO**：sitemap 12,204 个 URL（7.7 MB，在上限内），canonical、hreflang、x-default 都齐全；登录页带 `noindex`。题目页标题形如 “Puzzle p-00419”。robots.txt 里 `Disallow: /login`、`/account` 没有命中带语言前缀的真实路径，但已有 `noindex` 兜底，没有实际影响。`www` 的 307 跳转来自 Vercel（响应中有 `x-vercel-id`）。

---

## 4. 无法验证

| 项                                    | 原因                                                      | 去哪里看                                                    |
| ------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| 30 天 5xx、可用性                     | Hobby 日志只保留 1 小时，没有外部监控                     | —                                                           |
| 近期 webhook 投递                     | 30 天内没有 Stripe 事件                                   | 下一次真实付费时看 Stripe → Webhooks                        |
| Core Web Vitals 真实用户数据          | CrUX 显示 “No Data”（访问量不足）                         | 实验室数据见 §1 第 5 项                                     |
| 收录、软 404、标题                    | Chrome 里登录的 Google 账号下没有任何 Search Console 资源 | 确认是否在别的账号下验证过；没有就需要添加资源并做 DNS 验证 |
| 邮件送达、退信、投诉                  | 没有 Resend 的访问权限                                    | Resend → Logs，看 30 天的 bounced / complained              |
| 邮件带来的回访                        | 链接没有归因参数                                          | —                                                           |
| Supabase SMTP 配置                    | 管理面接口拿不到                                          | Supabase → Auth → SMTP Settings                             |
| `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN` 的值 | 按规定不拉取环境变量的值                                  | Vercel → Settings → Environment Variables                   |
| 恢复演练、测试模式结账                | 只给了方案 / 按决定跳过                                   | —                                                           |

---

## 5. 待决定

- **C / F**：邮箱登录的去留。不要 → 删掉 env，并开启 Supabase CAPTCHA（Turnstile 免费）；要 → 先改前端，让它传 `captchaToken`。
- **D**：备份。建议每周跑一次 `supabase db dump`，加密后放到异地（需要你先执行 `supabase login`），并按恢复演练方案做一次实际恢复。
- **E**：每日邮件。三选一：在登录文案里写明会发每日邮件；对 N 天不活跃的用户停发；改成主动订阅（opt-in）。
- PostHog 的 `anonymize_ips`：合规偏好。
- `www` 跳转：Vercel → Domains → www.go-daily.app 改为 308。

---

## 6. 以目前的真实使用量，哪些值得做

**值得做（成本低，防的是不可逆的损失）**

1. 备份（D）。数据一旦丢失无法挽回，修复成本为零。
2. 每日邮件策略（E）。每天发出的信里，大部分收件人已经 30 天以上不活跃，投诉会拖累发信地址的信誉，而订阅开通和扣款失败的通知也从同一个地址发出（`lib/stripe/stripeWebhookEmail.ts` → `lib/email.ts`）。
3. 关闭或保护 email 注册入口（C/F）。改动小，能关掉一个无人使用的攻击面。

**有条件才值得做**

5. 题目页标题、JS 体积。只有在决定做自然流量增长，或者 Search Console / CrUX 显示确实有问题时才值得做。最便宜的两项是：只加载当前语言的文案（约 −35 KB gzip），以及延迟加载 PostHog（约 −104 KB 移出首屏）。

**不值得做**

6. 桌面端维护。4.5 个月下载 9 次，却要每月处理 519 个 crate 的依赖更新。可以考虑停止它的 Dependabot cargo 更新，或者直接归档。
7. 继续追剩下的存活变异体、为去掉 `unsafe-inline` 改用 CSP nonce、升级 Vercel Pro 换更长的日志保留、Supabase PITR。以目前的流量，投入远大于收益。
