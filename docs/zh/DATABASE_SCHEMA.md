# 数据库 Schema 参考手册

本文档描述 go-daily 的 Supabase (Postgres) 数据库结构，基于 `supabase/migrations/` 中的迁移文件。

---

## 数据表

### 1. `profiles` (用户档案)

用户注册时通过 `handle_new_user()` 触发器自动创建。

| 列名                       | 类型          | 约束                                                                                                               | 说明                     |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `user_id`                  | `uuid`        | PK, FK → `auth.users(id)` ON DELETE CASCADE                                                                        | Supabase Auth 用户 ID    |
| `locale`                   | `text`        | NOT NULL, DEFAULT `'en'`, CHECK IN (`zh`,`en`,`ja`,`ko`)                                                           | 首选语言                 |
| `timezone`                 | `text`        | NOT NULL, DEFAULT `'UTC'`                                                                                          | IANA 时区，用于日期计算  |
| `kyu_rank`                 | `integer`     | 可空                                                                                                               | 自报围棋段位             |
| `display_name`             | `text`        | 可空                                                                                                               | 公开显示名               |
| `email_opt_out`            | `boolean`     | NOT NULL, DEFAULT `false`                                                                                          | 退订所有邮件             |
| `deleted_at`               | `timestamptz` | 可空                                                                                                               | 软删除时间戳             |
| `welcome_email_sent_at`    | `timestamptz` | 可空                                                                                                               | 欢迎邮件发送时间         |
| `daily_email_last_sent_on` | `date`        | 可空                                                                                                               | 最近一次每日题目邮件日期 |
| `email_unsubscribe_token`  | `text`        | NOT NULL, DEFAULT `replace(gen_random_uuid()::text, '-', '')`, UNIQUE INDEX `profiles_email_unsubscribe_token_idx` | 一键退订令牌             |
| `created_at`               | `timestamptz` | NOT NULL, DEFAULT `now()`                                                                                          | —                        |
| `updated_at`               | `timestamptz` | NOT NULL, DEFAULT `now()`                                                                                          | —                        |

**RLS**: 用户仅可读写自己的行 (`auth.uid() = user_id`)。

**触发器**: `handle_new_user()` 在 `auth.users` INSERT 后触发，从 `raw_user_meta_data` 提取 locale/timezone 创建档案。

---

### 2. `attempts` (练习记录)

仅追加的题目练习日志。镜像 `types/index.ts` 中的 `AttemptRecord`。

| 列名                  | 类型          | 约束                            | 说明                       |
| --------------------- | ------------- | ------------------------------- | -------------------------- |
| `id`                  | `bigserial`   | PK                              | 自增 ID                    |
| `user_id`             | `uuid`        | NOT NULL, FK → `auth.users(id)` | 所有者                     |
| `puzzle_id`           | `text`        | NOT NULL                        | 题目标识符                 |
| `date`                | `text`        | NOT NULL                        | 客户端本地 YYYY-MM-DD      |
| `user_move_x`         | `integer`     | 可空                            | 用户落子 X 坐标            |
| `user_move_y`         | `integer`     | 可空                            | 用户落子 Y 坐标            |
| `correct`             | `boolean`     | NOT NULL                        | 是否正确                   |
| `duration_ms`         | `integer`     | 可空                            | 用时（可选）               |
| `client_solved_at_ms` | `bigint`      | NOT NULL                        | 客户端解题时间（epoch ms） |
| `created_at`          | `timestamptz` | NOT NULL, DEFAULT `now()`       | —                          |

**约束**: `UNIQUE (user_id, puzzle_id, client_solved_at_ms)` — 全局去重键。

**索引**:

- `attempts_user_time_idx` on `(user_id, client_solved_at_ms DESC)`
- `attempts_user_puzzle_idx` on `(user_id, puzzle_id)`
- `attempts_user_date_idx` on `(user_id, date)`

**RLS**: 用户可 SELECT 和 INSERT 自己的行。无 UPDATE/DELETE（仅追加）。

---

### 3. `coach_usage` (教练使用量)

按用户按日的 AI 教练使用计数器。

| 列名      | 类型      | 约束                            | 说明             |
| --------- | --------- | ------------------------------- | ---------------- |
| `user_id` | `uuid`    | NOT NULL, FK → `auth.users(id)` | 所有者           |
| `day`     | `date`    | NOT NULL                        | 用户时区的日历日 |
| `count`   | `integer` | NOT NULL, DEFAULT `0`           | 当日教练消息数   |

**PK**: `(user_id, day)`

**RLS**: 用户可 SELECT 自己的行。

**写入**：仅通过 `service_role`，使用 Postgres RPC `increment_coach_usage(p_user_id uuid, p_day text)`（迁移 `0007_atomic_coach_usage_increment.sql`）对整日计数做原子自增（`lib/coach/coachState.ts` → `incrementCoachUsage`）。

---

### 4. `subscriptions` (订阅)

Stripe 订阅状态。仅由 Webhook 处理器写入。

| 列名                     | 类型          | 约束                      | 说明                                               |
| ------------------------ | ------------- | ------------------------- | -------------------------------------------------- |
| `user_id`                | `uuid`        | PK, FK → `auth.users(id)` | 所有者                                             |
| `stripe_customer_id`     | `text`        | NOT NULL                  | Stripe 客户 ID                                     |
| `stripe_subscription_id` | `text`        | NOT NULL                  | Stripe 订阅 ID                                     |
| `plan`                   | `text`        | NOT NULL                  | 计划标识（如 `pro_monthly`）                       |
| `status`                 | `text`        | NOT NULL                  | Stripe 状态（`active`、`trialing`、`canceled` 等） |
| `current_period_end`     | `timestamptz` | 可空                      | 当前计费周期结束时间                               |
| `cancel_at_period_end`   | `boolean`     | NOT NULL, DEFAULT `false` | 是否计划取消                                       |
| `trial_end`              | `timestamptz` | 可空                      | 试用期结束时间                                     |
| `first_paid_at`          | `timestamptz` | 可空                      | 首次成功付款时间戳                                 |
| `coach_anchor_day`       | `integer`     | CHECK (1–31)              | 教练配额窗口的计费锚定日                           |
| `updated_at`             | `timestamptz` | NOT NULL, DEFAULT `now()` | —                                                  |

**索引**: `subscriptions_customer_idx` on `(stripe_customer_id)`

**RLS**: 用户可 SELECT 自己的行。写入仅通过 `service_role`。

---

### 5. `srs_cards` (间隔复习卡片)

按用户按题目的间隔复习排期。

| 列名               | 类型          | 约束                             | 说明                      |
| ------------------ | ------------- | -------------------------------- | ------------------------- |
| `user_id`          | `uuid`        | NOT NULL, FK → `auth.users(id)`  | 所有者                    |
| `puzzle_id`        | `text`        | NOT NULL                         | 题目标识符                |
| `ease_factor`      | `numeric`     | NOT NULL, DEFAULT `2.5`          | SM-2 易度因子（最小 1.3） |
| `interval_days`    | `integer`     | NOT NULL, DEFAULT `0`            | 距下次复习的天数          |
| `due_date`         | `date`        | NOT NULL, DEFAULT `current_date` | 下次复习日期              |
| `last_reviewed_at` | `timestamptz` | 可空                             | 最近复习时间戳            |

**PK**: `(user_id, puzzle_id)`

**索引**: `srs_due_idx` on `(user_id, due_date)`

**RLS**: 所有者拥有完整 CRUD 权限。

---

### 6. `stripe_events` (Webhook 幂等账本)

防止重复处理 Webhook 事件。

| 列名                    | 类型          | 约束                      | 说明                           |
| ----------------------- | ------------- | ------------------------- | ------------------------------ |
| `id`                    | `text`        | PK                        | Stripe 事件 ID (`evt_...`)     |
| `event_type`            | `text`        | NOT NULL                  | Stripe 事件类型字符串          |
| `received_at`           | `timestamptz` | NOT NULL, DEFAULT `now()` | 首次接收时间                   |
| `processed_at`          | `timestamptz` | 可空                      | 处理完成时间                   |
| `processing_started_at` | `timestamptz` | 可空                      | 处理开始时间（用于过期锁检测） |
| `last_error`            | `text`        | 可空                      | 处理失败时的错误消息           |

**索引**: `stripe_events_processing_idx` on `(processed_at, processing_started_at)`

**RLS**: 无公开访问 (`FOR SELECT USING (false)`)。所有操作通过 `service_role`。

---

### 7. `user_devices` (设备注册表)

基于权益的设备席位限制注册表（Free：1 台；Pro：3 台；手动授予在服务端按 Pro 解析）。

| 列名         | 类型          | 约束                            | 说明                     |
| ------------ | ------------- | ------------------------------- | ------------------------ |
| `user_id`    | `uuid`        | NOT NULL, FK → `auth.users(id)` | 所有者                   |
| `device_id`  | `text`        | NOT NULL                        | 客户端生成的设备指纹     |
| `first_seen` | `timestamptz` | NOT NULL, DEFAULT `now()`       | 该设备首次登录时间       |
| `last_seen`  | `timestamptz` | NOT NULL, DEFAULT `now()`       | 最近活动时间             |
| `user_agent` | `text`        | 可空                            | 浏览器 User-Agent 字符串 |

**PK**: `(user_id, device_id)`

**索引**: `user_devices_last_seen_idx` on `(user_id, last_seen DESC)`

**RLS**: 所有者拥有完整 CRUD 权限。

---

### 8. `guest_coach_usage`（访客教练用量）

按访客设备 ID 与自然日累计匿名 AI 教练消息次数（部署之间持久化）。

| 列名         | 类型          | 约束                      | 说明                     |
| ------------ | ------------- | ------------------------- | ------------------------ |
| `device_id`  | `text`        | NOT NULL，复合 PK 一部分  | 客户端访客设备指纹       |
| `day`        | `text`        | NOT NULL，复合 PK 一部分  | ISO `YYYY-MM-DD`（UTC）  |
| `count`      | `integer`     | NOT NULL，DEFAULT `0`     | 当日该设备的教练消息计数 |
| `created_at` | `timestamptz` | NOT NULL，DEFAULT `now()` | —                        |

**PK**: `(device_id, day)`

**RLS**：已启用但**无策略** —— 仅通过 `service_role` 访问（`lib/coach/guestCoachUsage.ts`）。

**写入**：通过 `increment_guest_coach_usage(p_device_id text, p_day text)` 原子自增（同一迁移）；由 `guestCoachUsage.ts` 的 `incrementGuestUsage` 调用。

---

### 9. `manual_grants`（手动授予 Pro）

运营人员按邮箱授予 Pro，无需走 Stripe 结账。

| 列名         | 类型          | 约束                        | 说明                 |
| ------------ | ------------- | --------------------------- | -------------------- |
| `email`      | `text`        | PK                          | 被授予用户邮箱       |
| `expires_at` | `timestamptz` | NOT NULL                    | 授予到期时间         |
| `granted_by` | `text`        | NOT NULL, DEFAULT `'admin'` | 审计标签（发放来源） |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()`   | —                    |

**RLS**：已启用但**无策略** —— 读写在受信任服务端路由通过 `service_role` 完成（`app/api/admin/grants`、权益解析）。

---

## RLS 策略总览

| 表                  | 策略名                       | 访问权限                                |
| ------------------- | ---------------------------- | --------------------------------------- |
| `profiles`          | `own profile`                | 完整 CRUD（仅限自己的行）               |
| `attempts`          | `own attempts select/insert` | SELECT + INSERT（仅限自己的行，仅追加） |
| `coach_usage`       | `own usage select`           | 仅 SELECT（写入通过 service_role）      |
| `subscriptions`     | `own subs select`            | 仅 SELECT（写入通过 service_role）      |
| `srs_cards`         | `own srs`                    | 完整 CRUD（仅限自己的行）               |
| `stripe_events`     | `no public stripe events`    | 无公开访问（仅 service_role）           |
| `user_devices`      | `own devices`                | 完整 CRUD（仅限自己的行）               |
| `guest_coach_usage` | （无）                       | 客户端不可访问（仅 service_role）       |
| `manual_grants`     | （无）                       | 客户端不可访问（仅 service_role）       |

---

## Postgres 函数（RPC）

| 函数                                                        | 作用                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `increment_coach_usage(p_user_id uuid, p_day text)`         | 对 `coach_usage` 的 `(user_id, day)` 执行 `INSERT … ON CONFLICT DO UPDATE`，返回新 `count` |
| `increment_guest_coach_usage(p_device_id text, p_day text)` | 对 `guest_coach_usage` 采用相同模式，返回新 `count`                                        |

两者用于消除并发教练请求下的读改写竞态。

---

## 扩展

- `pgcrypto` — 用于 `email_unsubscribe_token` 默认值中的 `gen_random_uuid()`。
