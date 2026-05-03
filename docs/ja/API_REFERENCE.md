# APIルートリファレンス

本文書では、go-dailyの全APIルートをドメイン別にまとめています。すべてのルートは`app/api/`配下のNext.jsルートハンドラです。

---

## 1. コーチAPI（`app/api/coach/route.ts`）

DeepSeekによるAIコーチング対話。

### `POST /api/coach`

ユーザーのメッセージを送信し、AIコーチの返信を受け取る。

**認証**: 任意。ログインユーザーは Supabase セッション Cookie を使用。ゲストはヘッダー `x-go-daily-guest-device-id` が必要（より低いクォータ）。

**リクエストボディ**（JSON、`CoachRequestSchema`でバリデーション）:

**注意**: 履歴メッセージは合計6,000文字のバジェット制限の対象となります（最新メッセージから切り捨て）。さらにメッセージごとに2,000文字に切り捨てられます。

```typescript
{
  puzzleId: string;      // min 1 char
  locale: "zh" | "en" | "ja" | "ko";
  userMove: { x: number; y: number };
  isCorrect: boolean;
  personaId?: string;    // defaults to Go Seigen
  history: Array<{       // min 1 entry
    role: "user" | "assistant";
    content: string;
    ts: number;
  }>;
}
```

**成功レスポンス**（`200`）:

```json
{ "reply": "string", "usage": { "plan", "dailyRemaining", "monthlyRemaining", ... } }
```

**エラーレスポンス**:

| ステータス | コード                  | 条件                                                   |
| ---------- | ----------------------- | ------------------------------------------------------ |
| 400        | —                       | 無効なContent-Type、ボディサイズ、JSON、またはスキーマ |
| 401        | `login_required`        | セッションもゲストヘッダーもない場合                   |
| 403        | `device_limit`          | 無料ユーザーが1台のデバイス制限を超過                  |
| 403        | —                       | パズルがコーチング未対応                               |
| 429        | `daily_limit_reached`   | 日次クォータ枯渇                                       |
| 429        | `monthly_limit_reached` | 月次クォータ枯渇                                       |
| 429        | —                       | IPレート制限                                           |
| 502        | —                       | アップストリームLLMエラー                              |
| 504        | —                       | アップストリームタイムアウト（25秒超）                 |

**適用されるガード**:

- Content-Length上限（ボディ8 KB、ヘッダー10 KB）
- IPレート制限（Upstash Redisまたはインメモリフォールバック）
- すべてのユーザーメッセージに対するプロンプトインジェクション検出（`guardUserMessage`）
- 入力サニタイズ（`sanitizeInput`）
- コーチ対象チェック（パズルが`coachEligibleIds.json`に含まれている必要あり）
- 使用量クォータの適用（ユーザーごとの日次・月次カウンター）
- ゲスト利用量は Supabase `guest_coach_usage` に `service_role` で永続化；IP 上限はインメモリ（`guestCoachUsage.ts`）

### `GET /api/coach`

呼び出し元のコーチ使用量サマリーを取得する。

**認証**: 任意。ログインユーザーはセッション Cookie。ゲストは `x-go-daily-guest-device-id` でゲスト枠の使用量を取得できる。どちらも無い場合は `401`。

**レスポンス**（`200`）:

```json
{ "usage": { "plan", "dailyLimit", "monthlyLimit", "dailyUsed", "monthlyUsed", ... } }
```

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

すべての書き込みエンドポイントは`createRateLimiter()`を使用しており、以下のいずれかを返す:

- `UPSTASH_REDIS_REST_URL`と`UPSTASH_REDIS_REST_TOKEN`が設定されている場合: `UpstashRateLimiter`（本番環境、インスタンス横断）。
- フォールバック: `MemoryRateLimiter`（開発環境、単一インスタンス）。

両方のリミッターは最大エントリ数を強制し（`MemoryRateLimiter`は50,000件）、期限切れエントリの削除によりメモリの無制限な増加を防止する。

デフォルト: キーごとに60秒ウィンドウあたり10リクエスト。

### ボディパース

すべてのミュテーションルートは`lib/apiHeaders.ts`の`parseMutationBody()`を使用し、Content-Type、Content-Length、CSRF、JSONパースを共通処理する。

### APIレスポンスヘッダー

すべてのレスポンスは`lib/apiHeaders.ts`の`createApiResponse()`を通過し、標準化されたセキュリティヘッダーが設定される。

### ランタイム

Stripe・コーチ・cron・admin・パズル書き込みなど統合の重いハンドラは `export const runtime = "nodejs"` を指定する。`/api/health` のような軽量ルートはデフォルトランタイムを使用する。
