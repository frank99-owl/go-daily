# APIルートリファレンス

本文書では、go-dailyの全APIルートをドメイン別にまとめています。すべてのルートは`app/api/`配下のNext.jsルートハンドラです。

---

## 1. コーチAPI（`app/api/coach/route.ts`）

DeepSeekによるAIコーチング対話。

### `POST /api/coach`

アシスタントの返信は **SSE（Server-Sent Events）** でストリーミングされます。

**認証**: 任意。ログインユーザーは Supabase セッション Cookie を使用。**端末フィンガープリントがあるクライアントは `x-go-daily-device-id` を送信**（フリープランの端末席ロジック `getCoachState`）。ゲストは **`x-go-daily-guest-device-id` が必要**（より低いクォータ）。

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
| 400             | Content-Type／JSON／スキーマ不正、または `x-go-daily-guest-device-id` ヘッダーが 128 文字超     |
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

---

## 5. メールAPI

### `GET /email/unsubscribe`（`app/email/unsubscribe/route.ts`）

ワンタイムトークンを使用して、毎日のパズルメールの配信を停止する。

**クエリパラメータ**: `token`（`profiles.email_unsubscribe_token`から取得）。

### `GET /api/cron/daily-email`（`app/api/cron/daily-email/route.ts`）

毎日のパズルリマインダーメール送信用のVercel Cronハンドラ。

**認証**: Cronシークレット（`CRON_SECRET`環境変数）。

---

## 6. 可観測性API

### `POST /api/report-error`（`app/api/report-error/route.ts`）

クライアントサイドのエラー報告エンドポイント。ブラウザの`error`／`unhandledrejection`ハンドラからの構造化エラー報告を受け付ける。

**認証**: 不要（公開、レート制限付き）。

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

`ADMIN_EMAILS`（カンマ区切り許可リスト）と `ADMIN_PIN` で保護された運用エンドポイント。

### `POST /api/admin/verify` (`verify/route.ts`)

メールが管理者として確認済みのあと PIN を検証する。

**認証**: 必須（セッション、`user.email` が `ADMIN_EMAILS` に含まれること）。

**同一オリジン**: POST は同一オリジン検証が必要。

**リクエストボディ**（JSON）: `{ "pin": string }` — `ADMIN_PIN` と一致すること。

**レスポンス**: `200` `{ "ok": true }`；未ログインは `401`；許可リスト外・PIN 不一致は `403`；`ADMIN_PIN` 未設定は `500`。

### `GET /api/admin/grants` (`grants/route.ts`)

手動 Pro 付与（`manual_grants`）を一覧する。

**認証**: セッションメールが `ADMIN_EMAILS` に含まれること。

**レスポンス**（`200`）: `{ "grants": [{ "email", "expires_at", "granted_by", "created_at" }, ...] }`

### `POST /api/admin/grants`

メールをキーに手動付与を upsert（`onConflict: email`）。

**認証**: 管理者セッション。同一オリジン POST。

**リクエストボディ**: `{ "email": string, "days": number /* 1–3650 */, "granted_by"?: string }`

**レスポンス**（`200`）: `{ "ok": true, "email", "expires_at" }`

### `DELETE /api/admin/grants`

手動付与を削除する。

**認証**: 管理者セッション。同一オリジンのミュテーション。

**リクエストボディ**: `{ "email": string }`

**レスポンス**（`200`）: `{ "ok": true }`

---

## 9. 横断的な共通事項

### レート制限

書き込み系エンドポイントは`createRateLimiter()`を使い、挙動は次のとおりです。

- **`UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN` の両方が設定されている**: `UpstashRateLimiter`（Redis、マルチインスタンス）。
- **どちらか欠け、`NODE_ENV !== "production"`**: `MemoryRateLimiter`（同一プロセス内のみ）。
- **どちらか欠け、`NODE_ENV === "production"`**: ルートモジュール読み込み時に `createRateLimiter()` が**例外を投げる** — 本番では Upstash 必須（`lib/rateLimit.ts` 参照）。

`MemoryRateLimiter` はキー数上限 50,000。超過時は挿入順で最古キーを削除し、定期的にアイドルキーを掃除。既定: キーあたり 60 秒ウィンドウで 10 リクエスト（`RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` で上書き可能）。

### ボディパース

すべてのミュテーションルートは`lib/apiHeaders.ts`の`parseMutationBody()`を使用し、Content-Type、Content-Length、CSRF、JSONパースを共通処理する。

### APIレスポンスヘッダー

すべてのレスポンスは`lib/apiHeaders.ts`の`createApiResponse()`を通過し、標準化されたセキュリティヘッダーが設定される。

### ランタイム

Stripe・コーチ・cron・admin・パズル書き込みなど統合の重いハンドラは `export const runtime = "nodejs"` を指定する。`/api/health` のような軽量ルートはデフォルトランタイムを使用する。
