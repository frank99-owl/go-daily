# 技術アーキテクチャと核心モジュール (ARCHITECTURE)

本書では、go-daily の内部構造、および `lib/` ディレクトリの「9ドメイン分離」リファクタリングと、ルートの `proxy.ts`（Next.js 16 アプリルートプロキシ）に集約したリクエスト処理について解説します。

## 概要

- **エッジとルーティング:** ページ向けトラフィックはルートの `proxy.ts` でセッション更新・認証リダイレクト・ロケールネゴシエーション（`/{locale}/...`）を行う。`app/api/` のルートはグローバルプロキシを迂回し、Cookie・Stripe 署名・同一オリジン/CSRF と JSON ボディ処理（必要に応じ `parseMutationBody()` 等）で独自検証を行う。
- **モジュール中心:** ロジックは `lib/<domain>/` に配置し、共有契約は `types/schemas.ts` から。
- **本書の範囲:** ライフサイクル、ドメイン対応表、セキュリティ上の境界。

## 1. グローバル・リクエスト・ライフサイクル (`proxy.ts`)

すべてのユーザー向けリクエストはルートの `proxy.ts`（Next.js 16 アプリルートプロキシ）を通過します。これは一度のパスで以下の 4 つの重要なタスクを処理します：

1.  **マニフェストの特別処理 (Manifest Special-Case)**：PWA マニフェストへのリクエストを傍受し、適切なバージョンを返します。
2.  **免除パスのパススルー (Exempt Path Passthrough)**：特定のパス（静的アセット、API Webhook など）をすべてのプロキシ処理から除外します。
3.  **セッション更新と認証リダイレクト (Auth Refresh & Redirect)**：`@supabase/ssr` を利用して、ナビゲーションごとにセッション Cookie を更新し、サーバーコンポーネント (RSC) が常に最新のユーザー状態を保持できるようにします。プレフィックス付きパス（`/en/account` など）はここでガードされ、未認証ユーザーが `/account` にアクセスすると `/login?next=...` にリダイレクトされ、認証済みユーザーが `/login` にアクセスすると `/account` にリダイレクトされます。
4.  **ロケール交渉 (Locale Negotiation)**：プレフィックスなしのパスに対して、すべてのパスに言語プレフィックス (`/{zh|en|ja|ko}/...`) が付与されるよう 308（永久リダイレクト）マトリックスを処理します。

**Next.js 16 の範囲**: グローバルなリクエスト処理はルートの `proxy.ts`（`proxy` と `config.matcher` のエクスポート、Node.js ランタイム）。`config.matcher` は `/api/*` と `/auth/*` を除外するため、API と Supabase 認証コールバックは各ルートで検証（セッション、Stripe 署名、同一オリジン/ボディ検証など）を行います。ロケール交渉と Cookie 更新は主に**ページ**遷移向けです。

### 把握しておくべきレンダリング上の制約

**`notFound()` はバッファされていないセグメントを必要とします。** HTTP ステータスは最初のフラッシュ時点で確定するため、`notFound()` を呼ぶセグメントの上位に `loading.tsx` があると 404 がソフト 200 に化けます。そのため `app/[locale]/` にはあえて `loading.tsx` を置かず、ローディング表示が必要なセグメント（`today`、`result`、`review`、`stats`、`puzzles`、`account`、`onboarding`）が共有の `PageSkeleton` で個別に宣言します。最下位のキャッチオール `app/[locale]/[...rest]/page.tsx` は `force-dynamic` で `notFound()` を呼び、ローカライズされた `not-found.tsx` 境界を実 404 として描画します。

**`notFound()` が投げられるとページ自身のメタデータは破棄されます。** そのため 404 のタイトルは `app/[locale]/not-found.tsx` が持ちます。この境界はサーバーコンポーネント（本体は `NotFoundContent.tsx`）で、ルートパラメータを受け取れないため `proxy.ts` が付与する `x-locale` ヘッダーからロケールを解決します。

**タイトルテンプレートは `app/[locale]/layout.tsx`** の `"%s — go-daily"` です。メタデータ文字列側で同じサフィックスを持つと二重に描画されます。ホームページは例外で、テンプレートを定義した layout と同一セグメントの page には適用されないため、`metadata.home.title` は単体で完結しています。

## 2. コアドメイン・モジュール (`lib/`)

### `lib/env.ts` (環境変数検証)

Zod ベースの集中型環境変数検証器。各ドメイン（Coach、Stripe、Supabase、Reveal）に独自のスキーマと遅延検証シングルトンアクセサ（`getCoachEnv()`、`getStripeEnv()` など）を持つ。欠落変数はルートハンドラ深部でのサイレント 500 ではなく、初回使用時に明確なスタートアップスタイルエラーとして表面化する。ブラウザ側 Supabase ファイル（`client.ts`）とセッション更新ヘルパ（`lib/supabase/middleware.ts`）は `lib/env.ts` がサーバー専用のため、各自のインライン検証を維持する。

### `lib/auth/` & `lib/supabase/`

- **デュアルクライアント戦略**：ブラウザ環境向けには `client.ts` を、App Router の非同期サーバーコンポーネント向けには `server.ts` を使用します。
- **特権サービス層**：`service.ts` は `service_role` キーを使用して RLS（行レベルセキュリティ）をバイパスし、Stripe Webhook や Cron メールなどのバックグラウンドタスクを処理します。

### `lib/storage/` (永続化エンジン)

システムは3状態同期モデルを採用しています：

1.  **`anon`（LocalStorage のみ）**：未ログインユーザーのプライマリソース。ネットワーク呼び出しは行われません。
2.  **`logged-in-online`（LocalStorage + IndexedDB キュー + Supabase）**：認証済みで接続中のユーザー向け。書き込みは即座のフィードバックのために LocalStorage に行われ、永続的なバッファとして IndexedDB にキューイングされ、`syncStorage.ts` により即座に Supabase へバッチフラッシュされます。
3.  **`logged-in-offline`（LocalStorage + IndexedDB キュー）**：認証済みだが接続を失ったユーザー向け。書き込みは引き続き LocalStorage と IndexedDB に行われますが、Supabase へのフラッシュは延期されます。リトライメカニズムが `online` イベント発火時または次回ページロード時に同期を実行します。

### `lib/coach/` (AI インテリジェンス)

- **プロンプト管理**：`coachPrompt.ts` に集約し、問題ごとに同じコーチング契約（解説・分岐などを正として扱う、ペルソナの口調、言語別スタイル）を適用します。
- **品質管理とアクセス制限**：`coachEligibility.ts` は問題を `blocked`、`thin`、`explained`、`coach-ready` の各品質層に区分し、`hasVariationSupport` を返します。`coachBasicEligibleIds.json` は基礎説明の対象、`coachReadyIds.json` は完全なコーチの承認対象、`variationGroups.json` は変化図整理済みのグループを表し、`getCoachAccess()` が実行時チェックと重ねて制御します。四言語の解説があっても、`solutionSequence` や `wrongBranches` が欠けている問題は「説明十分」に留まり、完全な AI コーチ対応問題とはみなされません。
- **割り当てと日付ウィンドウ**：`coachQuota.ts` はユーザー TZ の日付整形と自然月／請求アンカー月ウィンドウ（`formatDateInTimeZone`、`getNaturalMonthWindow`、`getBillingAnchoredMonthWindow`）を提供。メッセージ回数上限は `lib/entitlements.ts` で定义され、`getCoachState` 等で消費されます。
- **利用カウンタ**：ログイン／ゲストのコーチ回数は Postgres に保存。同時実行下では RPC（`increment_coach_usage`、`increment_guest_coach_usage`）により原子的な upsert で加算します。
- **ルートヘルパー**：`coachRouteHelpers.ts` が ID 解決、割り当て確認、利用量チャージ／返金、上流エラー分類を担当。
- **ストリーミング**：`coachStreamHandler.ts` が SSE 応答構築、履歴トリミング、上流ストリーム転送とエラー回復を処理。
- **アナリティクス**：`coachAnalytics.ts` がコーチリクエストの完了・失敗イベントを PostHog に送信。

### `lib/i18n/` (グローバル展開)

- **URL 優先**：検索エンジンがローカライズ全ページをクロールできるよう、Cookie より URL を優先。現行の `sitemap.xml` は **12,000 本超**のロケール別 URL（静的・一覧・各題 × 4 言語）を列挙し、`content/data/puzzleIndex.json` に追従して増える。
- **不整合の検知**：`scripts/validateMessages.ts` により、`zh`, `en`, `ja`, `ko` 間の翻訳キーがビルド時に常に同期されていることを保証します。

### `lib/board/` (碁盤ロジック)

- **コアエンジン**：石の配置、ルール適用（呼吸点、アゲハマ、コウ）、盤面描画を、`board.ts` / `goRules.ts` / `judge.ts` / `sgf.ts` の 4 モジュールで実装。
- **SGF パース**：棋譜記録や問題定義のための完全な SGF（Smart Game Format）インポート/エクスポート対応。

### `lib/puzzle/` (パズルエンジン)

- **SRS とロード**：間隔反復（`srs.ts`, `reviewSrs.ts`）、デイリー選択、コレクション、リビールトークン、スナップショット、状態ヘルパー — `lib/puzzle/` に 8 実装モジュールと同梱の `puzzleOfTheDay.test.ts`。

### `lib/entitlements.ts` & `lib/entitlementsServer.ts`（プラン）

- **ティア行列**：`entitlements.ts` がゲスト／無料／Pro のコーチ上限、端末数、広告、同期方針をクライアント安全に定義。
- **サーバー合成**：`entitlementsServer.ts` が Stripe + `manual_grants`（`resolveViewerPlan`）から実効プランを解決。

### `lib/stripe/` (決済)

- **サーバー SDK ラッパー**：`server.ts` が Stripe Node SDK をラップし、クライアント初期化、価格 ID 解決、プラン推論を担当。
- **イベントストア**：`stripeEventStore.ts` が `stripe_events` テーブルに対してべき等なイベントクレームとステール検出を提供。
- **Webhook アナリティクス**：`stripeWebhookAnalytics.ts` がサブスクリプションライフサイクルイベント（試用、支払い、キャンセル）を PostHog に送信。
- **Webhook メール**：`stripeWebhookEmail.ts` が Resend 経由でトランザクショナルメール（サブスクリプション開始、支払い失敗）を送信。
- **Webhook ヘルパー**：`stripeWebhookHelpers.ts` が共通ユーティリティ（ID 抽出、タイムスタンプ変換、期間終了計算）を提供。

### `lib/posthog/` (アナリティクス)

- **サーバーサイドトラッキング**：サーバーからの PostHog イベントトラッキング。型付きイベント定義でアナリティクスの一貫性を確保。
- **PII セーフティ**：イベントはサーバーを離れる前に `beforeSend` フックでフィルタリングされ、機密性の高いユーザーデータを除去。

## 3. データフロー：解答記録のライフサイクル

1.  **トリガー**：ユーザーが盤面 (`GoBoard.tsx`) で着手し、問題を解決します。
2.  **ローカル書き込み**：`saveAttempt` が LocalStorage に即座に書き込み、レスポンスを返します。
3.  **エンキュー**：ログイン済みの場合、試行データが IndexedDB キューに追加されます。
4.  **同期**：`syncStorage` が Supabase の `attempts` テーブルへのバッチ挿入を試行します。
5.  **権限の更新**：同期成功後、ユーザーの連勝記録 (Streak) と SRS スケジュールの再計算がトリガーされます。

## 4. 法的コンプライアンスドメイン (Legal & Compliance)

法的要件はハードコードされたロジックではなく、**コンテンツ資産 (Content Assets)** として扱われます。これにより、管轄区域ごとの迅速な調整が可能になります。

- **信頼できる唯一の情報源 (SSOT)**: `app/[locale]/legal/_content.ts` が多语言の法的テキストを一元管理します。
- **動的な開示**: ユーザーのロケールおよび統一された柱構造に基づき、コンポーネントをレンダリングするアーキテクチャを採用しています。
- **地域別の統合**: 特定地域の要件（日本の特商法や韓国の PIPA など）は、3つの柱の中の統一されたコンテンツブロックとして統合されています。

- **データ保持戦略**: 国境を越えたデータ開示法（PIPA/GDPR）を満たすため、データがシンガポール (Supabase) と米国 (Vercel) に流れることを明文化しています。

## 5. セキュリティとインフラストラクチャ

- **行レベルセキュリティ (RLS)**：すべての Postgres テーブルで `auth.uid() = user_id` ポリシーを強制し、データベース層でのデータ漏洩を防止します。
- **PII マスキング**：Sentry と PostHog は `beforeSend` フィルタで構成されており、AI コーチとの対話がクライアントを離れる前に個人情報を匿名化します。
- **Unicode 正規化**: プロンプトガードの判定では、パターンマッチング前に NFKC 正規化と一般的な Cyrillic/Greek 同形文字の折りたたみを適用します。
- **ルート層の認証**: `proxy.ts` は Supabase セッション Cookie を更新し、ロケール付き**ページ**（例: `/account`, `/login`）をガードします。`/api/*` はプロキシの matcher 外のため、Stripe・コーチ・管理・パズル各ルートがセッションや署名を独自に検証します。
- **レート制限**: `lib/rateLimit.ts` — `UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN` の両方があれば `UpstashRateLimiter`、非本番ではなければ `MemoryRateLimiter`。**`NODE_ENV === "production"`** で Upstash が欠けると `createRateLimiter()` は **スタブ**を返し、**最初の `isLimited()` 呼び出しで例外を投げる**（インポート時ではないため `next build` 可能。本番トラフィックでは Redis 必須）。`MemoryRateLimiter` はキー上限 5 万件で、超過時は最古キーを削除し、定期的にアイドルキーを掃除します。

---

**関連ドキュメント**:

- [APIリファレンス](API_REFERENCE.md) — 全APIルートカタログ。
- [データベーススキーマ](DATABASE_SCHEMA.md) — Supabaseテーブル定義、インデックス、RLSポリシー。
