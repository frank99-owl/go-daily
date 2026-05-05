# データベーススキーマリファレンス

本文書では、`supabase/migrations/` のマイグレーションファイルから生成された go-daily の Supabase (Postgres) スキーマについて説明します。

---

## テーブル一覧

### 1. `profiles`

ユーザープロフィール。サインアップ時に `handle_new_user()` トリガーによって自動作成されます。

| カラム                     | 型            | 制約                                                                                                               | 説明                                     |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `user_id`                  | `uuid`        | PK, FK → `auth.users(id)` ON DELETE CASCADE                                                                        | Supabase Auth ユーザー ID                |
| `locale`                   | `text`        | NOT NULL, DEFAULT `'en'`, CHECK IN (`zh`,`en`,`ja`,`ko`)                                                           | 優先言語                                 |
| `timezone`                 | `text`        | NOT NULL, DEFAULT `'UTC'`                                                                                          | 日付計算に使用する IANA タイムゾーン     |
| `kyu_rank`                 | `integer`     | nullable                                                                                                           | 自己申告の囲碁級位                       |
| `display_name`             | `text`        | nullable                                                                                                           | 公開表示名                               |
| `email_opt_out`            | `boolean`     | NOT NULL, DEFAULT `false`                                                                                          | 全メールのオプトアウト                   |
| `deleted_at`               | `timestamptz` | nullable                                                                                                           | 論理削除タイムスタンプ                   |
| `welcome_email_sent_at`    | `timestamptz` | nullable                                                                                                           | ウェルカムメール送信日時                 |
| `daily_email_last_sent_on` | `date`        | nullable                                                                                                           | 最後にデイリーパズルメールを送信した日付 |
| `email_unsubscribe_token`  | `text`        | NOT NULL, DEFAULT `replace(gen_random_uuid()::text, '-', '')`, UNIQUE INDEX `profiles_email_unsubscribe_token_idx` | ワンクリック配信停止トークン             |
| `created_at`               | `timestamptz` | NOT NULL, DEFAULT `now()`                                                                                          | —                                        |
| `updated_at`               | `timestamptz` | NOT NULL, DEFAULT `now()`                                                                                          | —                                        |

**RLS**: ユーザーは自身の行のみ読み書き可能（`auth.uid() = user_id`）。

**トリガー**: `handle_new_user()` は `auth.users` への INSERT 後に発火し、`raw_user_meta_data` から locale/timezone を取得してプロフィールを作成します。

---

### 2. `attempts`

パズル解答ログ（追記専用）。`types/index.ts` の `AttemptRecord` に対応します。

| カラム                | 型            | 制約                            | 説明                                      |
| --------------------- | ------------- | ------------------------------- | ----------------------------------------- |
| `id`                  | `bigserial`   | PK                              | 自動採番 ID                               |
| `user_id`             | `uuid`        | NOT NULL, FK → `auth.users(id)` | オーナー                                  |
| `puzzle_id`           | `text`        | NOT NULL                        | パズル識別子                              |
| `date`                | `text`        | NOT NULL                        | クライアントが認識したローカル YYYY-MM-DD |
| `user_move_x`         | `integer`     | nullable                        | ユーザーの着手の X 座標                   |
| `user_move_y`         | `integer`     | nullable                        | ユーザーの着手の Y 座標                   |
| `correct`             | `boolean`     | NOT NULL                        | 着手が正解かどうか                        |
| `duration_ms`         | `integer`     | nullable                        | 所要時間（任意）                          |
| `client_solved_at_ms` | `bigint`      | NOT NULL                        | 解答時のエポックミリ秒（クライアント側）  |
| `created_at`          | `timestamptz` | NOT NULL, DEFAULT `now()`       | —                                         |

**制約**: `UNIQUE (user_id, puzzle_id, client_solved_at_ms)` — グローバル重複排除キー。

**インデックス**:

- `attempts_user_time_idx`: `(user_id, client_solved_at_ms DESC)`
- `attempts_user_puzzle_idx`: `(user_id, puzzle_id)`
- `attempts_user_date_idx`: `(user_id, date)`

**RLS**: ユーザーは自身の行に対して SELECT および INSERT のみ可能。UPDATE/DELETE は不可（追記専用）。

---

### 3. `coach_usage`

ユーザーごとの1日あたり AI コーチ利用回数カウンター。

| カラム    | 型        | 制約                            | 説明                             |
| --------- | --------- | ------------------------------- | -------------------------------- |
| `user_id` | `uuid`    | NOT NULL, FK → `auth.users(id)` | オーナー                         |
| `day`     | `date`    | NOT NULL                        | ユーザーのタイムゾーンでの暦日   |
| `count`   | `integer` | NOT NULL, DEFAULT `0`           | その日のコーチメッセージ利用回数 |

**PK**: `(user_id, day)`

**RLS**: ユーザーは自身の行に対して SELECT のみ可能。

**書き込み**: `service_role` のみ。Postgres RPC `increment_coach_usage(p_user_id uuid, p_day text)`（マイグレーション `0007_atomic_coach_usage_increment.sql`）で原子的に日次カウントを加算（`lib/coach/coachState.ts` → `incrementCoachUsage`）。

---

### 4. `subscriptions`

Stripe のサブスクリプション状態。Webhook ハンドラーによってのみ書き込まれます。

| カラム                   | 型            | 制約                      | 説明                                                       |
| ------------------------ | ------------- | ------------------------- | ---------------------------------------------------------- |
| `user_id`                | `uuid`        | PK, FK → `auth.users(id)` | オーナー                                                   |
| `stripe_customer_id`     | `text`        | NOT NULL                  | Stripe カスタマー ID                                       |
| `stripe_subscription_id` | `text`        | NOT NULL                  | Stripe サブスクリプション ID                               |
| `plan`                   | `text`        | NOT NULL                  | プラン識別子（例: `pro_monthly`）                          |
| `status`                 | `text`        | NOT NULL                  | Stripe ステータス（`active`, `trialing`, `canceled` など） |
| `current_period_end`     | `timestamptz` | nullable                  | 現在の請求期間の終了日時                                   |
| `cancel_at_period_end`   | `boolean`     | NOT NULL, DEFAULT `false` | 期間終了時のキャンセル予約                                 |
| `trial_end`              | `timestamptz` | nullable                  | トライアル期間の終了日時                                   |
| `first_paid_at`          | `timestamptz` | nullable                  | 初回決済完了タイムスタンプ                                 |
| `coach_anchor_day`       | `integer`     | CHECK (1–31)              | コーチ割り当てウィンドウの請求サイクル基準日               |
| `updated_at`             | `timestamptz` | NOT NULL, DEFAULT `now()` | —                                                          |

**インデックス**: `subscriptions_customer_idx`: `(stripe_customer_id)`

**RLS**: ユーザーは自身の行に対して SELECT のみ可能。書き込みは `service_role` 経由でのみ行われます。

---

### 5. `srs_cards`

ユーザー×パズルの間隔反復スケジュール。

| カラム             | 型            | 制約                             | 説明                        |
| ------------------ | ------------- | -------------------------------- | --------------------------- |
| `user_id`          | `uuid`        | NOT NULL, FK → `auth.users(id)`  | オーナー                    |
| `puzzle_id`        | `text`        | NOT NULL                         | パズル識別子                |
| `ease_factor`      | `numeric`     | NOT NULL, DEFAULT `2.5`          | SM-2 簡易係数（最小値 1.3） |
| `interval_days`    | `integer`     | NOT NULL, DEFAULT `0`            | 次回復習までの日数          |
| `due_date`         | `date`        | NOT NULL, DEFAULT `current_date` | 次回復習日                  |
| `last_reviewed_at` | `timestamptz` | nullable                         | 最終復習タイムスタンプ      |

**PK**: `(user_id, puzzle_id)`

**インデックス**: `srs_due_idx`: `(user_id, due_date)`

**RLS**: オーナーが完全な CRUD 可能（`auth.uid() = user_id`）。

---

### 6. `stripe_events`

Webhook 冪等性レジャー。イベントの重複処理を防止します。

| カラム                  | 型            | 制約                      | 説明                             |
| ----------------------- | ------------- | ------------------------- | -------------------------------- |
| `id`                    | `text`        | PK                        | Stripe イベント ID（`evt_...`）  |
| `event_type`            | `text`        | NOT NULL                  | Stripe イベントタイプ文字列      |
| `received_at`           | `timestamptz` | NOT NULL, DEFAULT `now()` | イベント初回受信日時             |
| `processed_at`          | `timestamptz` | nullable                  | 処理完了日時                     |
| `processing_started_at` | `timestamptz` | nullable                  | 処理開始日時（停滞ロック検出用） |
| `last_error`            | `text`        | nullable                  | 処理失敗時のエラーメッセージ     |

**インデックス**: `stripe_events_processing_idx`: `(processed_at, processing_started_at)`

**RLS**: 外部からのアクセス不可（`FOR SELECT USING (false)`）。全操作は `service_role` 経由。

---

### 7. `user_devices`

権限ベースの端末席制限用レジストリ（Free: 1 台、Pro: 3 台。手動付与はサーバー側で Pro として解決）。

| カラム       | 型            | 制約                            | 説明                                         |
| ------------ | ------------- | ------------------------------- | -------------------------------------------- |
| `user_id`    | `uuid`        | NOT NULL, FK → `auth.users(id)` | オーナー                                     |
| `device_id`  | `text`        | NOT NULL                        | クライアント生成のデバイスフィンガープリント |
| `first_seen` | `timestamptz` | NOT NULL, DEFAULT `now()`       | このデバイスからの初回ログイン               |
| `last_seen`  | `timestamptz` | NOT NULL, DEFAULT `now()`       | 最新のアクティビティ                         |
| `user_agent` | `text`        | nullable                        | ブラウザのユーザーエージェント文字列         |

**PK**: `(user_id, device_id)`

**インデックス**: `user_devices_last_seen_idx`: `(user_id, last_seen DESC)`

**RLS**: オーナーが完全な CRUD 可能。

---

### 8. `guest_coach_usage`

ゲスト端末 ID と暦日ごとの匿名 AI コーチ利用回数（デプロイをまたいで保持）。

| カラム       | 型            | 制約                      | 説明                                           |
| ------------ | ------------- | ------------------------- | ---------------------------------------------- |
| `device_id`  | `text`        | NOT NULL, PK の一部       | クライアント送信のゲスト端末フィンガープリント |
| `day`        | `text`        | NOT NULL, PK の一部       | ISO `YYYY-MM-DD`（UTC）                        |
| `count`      | `integer`     | NOT NULL, DEFAULT `0`     | 当該端末／日のコーチメッセージ数               |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | —                                              |

**PK**: `(device_id, day)`

**RLS**: 有効だが**ポリシーなし** —— `service_role` のみ（`lib/coach/guestCoachUsage.ts`）。

**書き込み**: 同じマイグレーションの RPC `increment_guest_coach_usage(p_device_id text, p_day text)` で原子的に加算（`guestCoachUsage.ts` の `incrementGuestUsage`）。

---

### 9. `manual_grants`

Stripe を経由せずにメールアドレス単位で Pro を付与する管理者用テーブル。

| カラム       | 型            | 制約                        | 説明                         |
| ------------ | ------------- | --------------------------- | ---------------------------- |
| `email`      | `text`        | PK                          | 付与先メールアドレス         |
| `expires_at` | `timestamptz` | NOT NULL                    | 付与の失効日時               |
| `granted_by` | `text`        | NOT NULL, DEFAULT `'admin'` | 監査用ラベル（発行者の記録） |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()`   | —                            |

**RLS**: 有効だが**ポリシーなし** —— 読み書きは信頼できるサーバールートが `service_role` で実行（`app/api/admin/grants`、権限解決）。

---

## RLS 一覧

| テーブル            | ポリシー                     | アクセス                                    |
| ------------------- | ---------------------------- | ------------------------------------------- |
| `profiles`          | `own profile`                | 完全な CRUD（自身の行のみ）                 |
| `attempts`          | `own attempts select/insert` | SELECT + INSERT（自身の行のみ、追記専用）   |
| `coach_usage`       | `own usage select`           | SELECT のみ（書き込みは service_role 経由） |
| `subscriptions`     | `own subs select`            | SELECT のみ（書き込みは service_role 経由） |
| `srs_cards`         | `own srs`                    | 完全な CRUD（自身の行のみ）                 |
| `stripe_events`     | `no public stripe events`    | 外部アクセス不可（service_role のみ）       |
| `user_devices`      | `own devices`                | 完全な CRUD（自身の行のみ）                 |
| `guest_coach_usage` | （なし）                     | クライアントからは不可（service_role のみ） |
| `manual_grants`     | （なし）                     | クライアントからは不可（service_role のみ） |

---

## Postgres 関数（RPC）

| 関数                                                        | 役割                                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `increment_coach_usage(p_user_id uuid, p_day text)`         | `coach_usage` の `(user_id, day)` に対し `INSERT … ON CONFLICT DO UPDATE`。新しい `count` を返す。 |
| `increment_guest_coach_usage(p_device_id text, p_day text)` | `guest_coach_usage` に同様。                                                                       |

同時実行リクエスト時の読み取り‐更新‐書き込み競合を防ぎます。

---

## 拡張機能

- `pgcrypto` — `email_unsubscribe_token` のデフォルト値として使用される `gen_random_uuid()` に利用。
