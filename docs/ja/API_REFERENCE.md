# APIルートリファレンス

本文書では、go-dailyの全APIルートをドメイン別にまとめています。すべてのルートは`app/api/`配下のNext.jsルートハンドラです。

---

## 1. コーチAPI（`app/api/coach/route.ts`）

**OpenAI 互換** HTTP API による AI コーチング（既定は DeepSeek：`COACH_API_URL`、`DEEPSEEK_API_KEY`。`lib/env.ts` 参照）。

### `POST /api/coach`

アシスタントの返信は **SSE（Server-Sent Events）** でストリーミングされます。

**認証**: 任意。ログインユーザーは Supabase セッション Cookie を使用。**端末フィンガープリントがあるクライアントは `x-go-daily-device-id` を送信**（権限ベースの端末席ロジック `getCoachState`）。ゲストは **`x-go-daily-guest-device-id` が必要**（より低いクォータ）。

**リクエストボディ**（JSON、`CoachRequestSchema`）:

**注**:

- **正解／不正解はリクエストに含めません**。サーバー側で `judgeMove(puzzle, userMove)` を実行し、結果はシステムプロンプト（`buildSystemPrompt`）に渡します。
- 履歴は合計 **6,000** 文字（新しいメッセージ優先）＋ メッセージごと最大 **2,000** 文字に制限。その前に最大 **6** 往復まで保持されます。
- `personaId` を送る場合は `ke-jie`、`lee-sedol`、`go-seigen`、`iyama-yuta`、`shin-jinseo`、`custom` のいずれか（`CoachRequestSchema`）。省略時は碁聖（`go-seigen`）。

```typescript
{
  puzzleId: string;      // min 1 char
  locale: "zh" | "en" | "ja" | "ko";
  userMove: { x: number; y: number };
  personaId?: string;    // defaults to Go Seigen
  history: Array<{       // min 1 entry
    role: "user" | "assistant";
    content: string;
    ts: number;
  }>;
}
```

**成功**（`200`）:`Content-Type: text/event-stream`。SSE の `data:` 行の JSON は次のとおりです。

| ペイロード                           | 意味                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `{ "delta": "..." }`                 | アシスタントの部分テキスト                                                                            |
| `{ "done": true, "usage": { ... } }` | 終了。このリクエストで **1 回カウント済み後** のクォータ                                              |
| `{ "error": "<code>" }`              | ストリーム途中失敗。`<code>` は `upstream_error` / `timeout` / `rate_limit` / `auth_error` のいずれか |

モデル送信の前に利用回数が加算されます。切断してもその回は消費されます。

**JSON エラー**（SSE 開始前）:

| ステータス      | 条件                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------- |
| 400             | Content-Type／JSON／スキーマ不正、または端末ヘッダーが 128 文字超                               |
| 401             | `login_required` … セッションもゲストヘッダーも無い                                             |
| 403             | `forbidden` … 同一オリジン／CSRF（`parseMutationBody`）                                         |
| 403             | `device_limit` … `getCoachState` で端末制限                                                     |
| 403             | `coach_unavailable` … パズルがコーチ非対応（`getCoachAccess`）                                  |
| 404             | 未知の `puzzleId`                                                                               |
| 413             | ボディが **8 KB** 超（`MAX_BODY_BYTES`）                                                        |
| 429             | `daily_limit_reached` … **日次**または（ゲストのみ）**IP 日次**（`usage` が `null` の場合あり） |
| 429             | `monthly_limit_reached`                                                                         |
| 429             | 汎用 IP レート制限                                                                              |
| 500             | `DEEPSEEK_API_KEY` 未設定                                                                       |
| 500             | `quota_write_failed` … 使用量カウント書き込み失敗（DB/RPC エラー）                              |
| 502 / 504 / 429 | SSE に入る前のプロバイダ失敗で JSON `{ "error": "..." }`（タイムアウトは `504`）                |

**ガード**:

- ボディ **8 KB** 上限と同一オリジン（`parseMutationBody`）、IP レート制限（`createRateLimiter`：**本番**は Upstash 必須、**開発**のみインメモリ）、`guardUserMessage`、`sanitizeInput`、`coachEligibleIds.json` に加え `checkCoachEligibility` / `getCoachAccess` による実行時チェック、クォータ（Postgres RPC による原子カウント — Database Schema 参照）。ゲストのデバイス別行は `service_role` のみ。**ゲスト IP 日次上限**（`checkIpLimit`、`GUEST_IP_DAILY_LIMIT`、現状 20/IP/UTC 日）は Upstash 設定時は Redis、未設定時は `guestCoachUsage.ts` のインメモリ `Map`。

### `GET /api/coach`

呼び出し元のコーチ使用量サマリー。

**認証**: 任意。ログイン時は Cookie、`x-go-daily-device-id` 可。ゲストは `x-go-daily-guest-device-id`。どちらも無ければ `401`。

**レスポンス**（`200`）:

```json
{
  "usage": {
    "plan",
    "dailyLimit",
    "monthlyLimit",
    "dailyUsed",
    "monthlyUsed",
    "dailyRemaining",
    "monthlyRemaining",
    "timeZone",
    "monthWindowKind",
    "monthWindowStart",
    "monthWindowEnd",
    "billingAnchorDay"
  }
}
```

ログインユーザーで `coach.available === false` のとき `usage` は `null` になり得ます。ゲストはヘッダーがある場合常にオブジェクトです。

---

## 2. パズルAPI

### `POST /api/puzzle/attempt`（`app/api/puzzle/attempt/route.ts`）

ユーザーの着手をパズルの正解に対してバリデーションする。

**認証**: 不要（公開エンドポイント）。

**リクエストボディ**（JSON、`PuzzleAttemptRequestSchema`でバリデーション）:

```typescript
{
  puzzleId: string; // 1–120 chars
  userMove: {
    x: number;
    y: number;
  }
}
```

**レスポンス**（`200`）:

```json
{
  "puzzleId": "string",
  "userMove": { "x": 0, "y": 0 },
  "correct": true,
  "revealToken": "string" // short-lived token for viewing the solution
}
```

**ガード**: Same-Originチェック、IP＋パズル単位のレート制限、着手の範囲バリデーション。

### `POST /api/puzzle/reveal`（`app/api/puzzle/reveal/route.ts`）

有効なリビールトークンを使用して、パズルの完全な解答を表示する。

**認証**: 不要（トークンによるゲート付き）。

**リクエストボディ**:

```typescript
{
  puzzleId: string;
  revealToken: string; // signed token from /api/puzzle/attempt
}
```

**レスポンス**（`200`）: `correct`、`solutionNote`、`solutionSequence`を含むパズルの完全な解答。

### `POST /api/puzzle/random`（`app/api/puzzle/random/route.ts`）

「ランダム」ページ用のランダムパズルを取得する。

**認証**: 不要。

**レスポンス**（`200`）:

```json
{ "puzzleId": "string" }
```

ランダムに選択されたパズルのIDを返す。クライアントはその後、別途フルデータを取得する。

---

## 3. Stripe API（`app/api/stripe/`）

### `POST /api/stripe/checkout`（`checkout/route.ts`）

Proプランのサブスクリプション向けStripe Checkoutセッションを作成する。

**認証**: 必須。

**リクエストボディ**:

```typescript
{
  interval: "monthly" | "yearly";
}
```

**レスポンス**（`200`）: `{ "url": "https://checkout.stripe.com/..." }`

### `POST /api/stripe/portal`（`portal/route.ts`）

サブスクリプション管理用のStripe Customer Portalセッションを作成する。

**認証**: 必須。

**レスポンス**（`200`）: `{ "url": "https://billing.stripe.com/..." }`

### `POST /api/stripe/webhook`（`webhook/route.ts`）

Stripe Webhook受信エンドポイント。`checkout.session.completed`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.payment_failed`イベントを処理する。

**認証**: Stripe署名検証（ユーザーセッションは不要）。

**動作**:

- `stripe_events`テーブルによる冪等性担保（処理前にイベントをクレームする）。
- サブスクリプション状態を`subscriptions`テーブルにupsertする。
- `invoice.payment_failed`時に支払い失敗メールを送信する。
- `Content-Length > 1 MB`のリクエストはボディ読み込み前にHTTP 413で拒否される。

---

## 4. 認証API

### `GET /auth/callback`（`app/auth/callback/route.ts`）

Supabase OAuth／マジックリンクコールバック。認証コードをセッションに交換し、適切なロケールプレフィックス付きページにリダイレクトする。

### `POST /api/account/delete`（`app/api/account/delete/route.ts`）

認証済みユーザーのアカウントと関連するすべてのデータを削除する。

**認証**: 必須。

**レスポンス**（`200`）: `{ "ok": true }`

### `POST /api/auth/device`（`app/api/auth/device/route.ts`）

Stripe の購読状態と `manual_grants` から実効プランを解決したうえで、ログイン中ブラウザの端末を `user_devices` に登録または更新する。

**認証**: Supabase セッション必須。同一オリジンの JSON 変更リクエスト。

**リクエストボディ**:

```json
{ "deviceId": "client-generated-device-id" }
```

**レスポンス**（`200`）:

```json
{
  "access": "allow-existing | allow-new",
  "deviceId": "string",
  "existingDeviceCount": 1
}
```

**エラー**: `400` 端末 ID 不正（空または 128 文字超）；`401` 未認証；`403 error: "forbidden"` 同一オリジンガード失敗；`403 error: "device_limit"` 実効プランが Free で既に端末席を使用中；`500` 購読・端末検索・upsert 失敗。

---

## 5. メールAPI

### `GET|POST /email/unsubscribe`（`app/email/unsubscribe/route.ts`）

ワンタイムトークンを使用して、毎日のパズルメールの配信を停止する。

**クエリパラメータ**: `token`（`profiles.email_unsubscribe_token`から取得）。

**挙動**: `GET` はメール本文下部の表示リンクで、配信停止を書き込んだ後 `/en` にメール状態クエリ付きでリダイレクトします。`POST` はメールクライアントが `List-Unsubscribe` / `List-Unsubscribe-Post` ヘッダーから実行する RFC 8058 のワンクリック配信停止で、`profiles.email_opt_out = true` を設定して空レスポンスを返します。

### `GET /api/cron/daily-email`（`app/api/cron/daily-email/route.ts`）

毎日のパズルリマインダーメール送信用のVercel Cronハンドラ。

**認証**: `Authorization: Bearer <CRON_SECRET>` をサーバーの `CRON_SECRET` と一致させること（ブラウザやクライアントバンドルに埋め込まない）。

---

## 6. 可観測性API

### `POST /api/report-error`（`app/api/report-error/route.ts`）

クライアントサイドのエラー報告エンドポイント。ブラウザの`error`／`unhandledrejection`ハンドラからの構造化エラー報告を受け付ける。

**認証**: 不要（公開・レート制限あり）。ペイロードに**スタックトレース**や URL が含まれる場合がある — 自動テレメトリ専用とし、エンドユーザーの秘密や高感度の個人データを送らないこと。

**リクエストボディ**（`ClientErrorReportSchema`でバリデーション）:

```typescript
{
  message: string;
  stack?: string;
  url: string;
  timestamp: number;
  userAgent: string;
  locale?: "zh" | "en" | "ja" | "ko";
  puzzleId?: string;
}
```

---

## 7. ヘルスチェック API

### `GET /api/health` (`app/api/health/route.ts`)

監視向けの軽量ヘルスチェック。

**認証**: 不要。

**挙動**: `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` が設定されていれば `${SUPABASE_URL}/auth/v1/settings` をプローブ（5秒タイムアウト）。未設定なら `supabase` は `skipped` となり healthy を返す。

**レスポンス**（`200`）: `{ "status": "healthy", "timestamp": ISO8601, "checks": { "supabase": "ok" | "error" | "skipped" } }`

**レスポンス**（`503`）: Supabase プローブ失敗時 `{ "status": "degraded", ... }`。

---

## 8. 管理 API (`app/api/admin/`)

アプリ内 `/admin` 向けの運用限定ルート。**サーバー専用**の環境変数に依存する。PIN、ユーザー ID 許可リスト、Cron シークレットをクライアントコード・公開チャネル・フロントのバンドルに含めないこと。

### `POST /api/admin/verify` (`verify/route.ts`)

ログイン中ユーザーのメールが `ADMIN_EMAILS`（カンマ区切り・大小文字無視）に含まれたうえで **PIN** を検証する。

**認証**: Supabase セッション必須。`user.email` が `ADMIN_EMAILS` に一致すること。

**同一オリジン**: 必須。

**リクエストボディ**（JSON）: `{ "pin": string }` — サーバー設定の `ADMIN_PIN` と一致（運用者秘密として扱う）。

**レスポンス**: `200` `{ "ok": true }`；未ログイン `401`；PIN 不一致・メール非許可 `403`；`ADMIN_PIN` 未設定 `500`。

### 手動 Pro 付与（`grants/route.ts`）

`GET` / `POST` / `DELETE` `/api/admin/grants` は PIN 検証とは**別**。**`user.id`（UUID）** が `ADMIN_USER_IDS`（カンマ区切りの Supabase auth ユーザー ID）に含まれる必要がある。これらのルートは `ADMIN_PIN` を読まない。

### `GET /api/admin/grants`

`manual_grants` を一覧する。

**認証**: セッション `user.id` が `ADMIN_USER_IDS` に含まれること。

**レスポンス**（`200`）: `{ "grants": [{ "email", "expires_at", "granted_by", "created_at" }, ...] }`

### `POST /api/admin/grants`

メールをキーに手動付与を upsert（`onConflict: email`）。

**認証**: セッション `user.id` が `ADMIN_USER_IDS` に含まれること。同一オリジン POST。

**リクエストボディ**: `{ "email": string, "days": number /* 1–3650 */, "granted_by"?: string }`

**レスポンス**（`200`）: `{ "ok": true, "email", "expires_at" }`

### `DELETE /api/admin/grants`

手動付与を削除する。

**認証**: セッション `user.id` が `ADMIN_USER_IDS` に含まれること。同一オリジンのミュテーション。

**リクエストボディ**: `{ "email": string }`

**レスポンス**（`200`）: `{ "ok": true }`

---

## 9. 横断的な共通事項

### レート制限

書き込み系エンドポイントは`createRateLimiter()`を使い、挙動は次のとおりです。

- **`UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN` の両方が設定されている**: `UpstashRateLimiter`（Redis、マルチインスタンス）。
- **どちらか欠け、`NODE_ENV !== "production"`**: `MemoryRateLimiter`（同一プロセス内のみ）。
- **どちらか欠け、`NODE_ENV === "production"`**: `createRateLimiter()` は**スタブ**を返し、`isLimited()` が**例外を投げる** — 本番では Upstash 必須（`lib/rateLimit.ts` 参照；インポート時ではなく、`next build` は Upstash なしで完了可）。

`MemoryRateLimiter` はキー数上限 50,000。超過時は挿入順で最古キーを削除し、定期的にアイドルキーを掃除。既定: キーあたり 60 秒ウィンドウで 10 リクエスト（`RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` で上書き可能）。

### ボディパース

JSON を受け取るルートは、`parseMutationBody()`（共通の Content-Type / Content-Length / CSRF / JSON 処理）を使うか、同等の同一オリジン＋JSON 解析を行う。`parseMutationBody()` 使用時の既定上限は **2 KB**。`/api/coach` は **8 KB**、`/api/puzzle/reveal` は **3 KB**。`/api/stripe/checkout` などは `parseMutationBody()` ではなくルート固有の解析を使う。

### APIレスポンスヘッダー

すべてのレスポンスは`lib/apiHeaders.ts`の`createApiResponse()`を通過し、標準化されたセキュリティヘッダーが設定される。

### ランタイム

Stripe・コーチ・cron・admin・パズル書き込みなど統合の重いハンドラは `export const runtime = "nodejs"` を指定する。`/api/health` のような軽量ルートはデフォルトランタイムを使用する。
