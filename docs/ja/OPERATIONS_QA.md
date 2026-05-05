# 運用、デプロイ、および品質保証 (OPERATIONS_QA)

本書では、環境構成から品質検証に至るまでの go-daily の製品ライフサイクルについて説明します。

## 1. 本番スタック

- **ホスティング**: Vercel (Region: `iad1` - 米国東部)
- **データベース**: Supabase (Region: `ap-southeast-1` - シンガポール)
- **レート制限**: Upstash Redis (Region: `ap-southeast-1` - シンガポール)
- **DNS & CDN**: Cloudflare (Proxy 有効)
- **観測性**: Sentry (エラー) + PostHog (イベント) + Vercel Speed Insights

## 2. 環境構成

構成は Vercel の環境変数を通じて管理されます。最も重要なトグルは以下の通りです：

- `NEXT_PUBLIC_IS_COMMERCIAL`: Stripe コンポーネントと `/pricing` ページを有効にするには `true` に設定します。
- `COACH_MODEL`: デフォルトは `deepseek-chat`。より精度の高い `deepseek-reasoner` に変更可能です。
- `COACH_MONTHLY_TOKEN_BUDGET`: 予期せぬ課金の急増を防ぐための、アプリケーションレベルのハードな月間制限。
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`：**本番では必須** — `NODE_ENV === "production"` のときどちらかが欠けると、ルートモジュール読み込み時に `createRateLimiter()` が例外を投げます。**開発**では両方省略して `MemoryRateLimiter`（単一プロセス専用）にできます。

### OG / Twitter プレビュー画像（`next/og`）

- **配置**: `app/opengraph-image.tsx`、`app/twitter-image.tsx`（サイト既定）、`app/[locale]/opengraph-image.tsx`（ロケール別）。
- **ランタイム**: ルートの OG/Twitter は `export const runtime = "nodejs"` と `ImageResponse` を指定し、ビルド時に**静的プリレンダ**され、Edge Runtime に起因する静的生成警告を避けます。
- **Satori**: **`z-index` 非対応**。グラデーションなどの重ね合わせは **外側ラッパーの `background`** にまとめ、absolute のオーバーレイ積み重ねは避けます。

## 3. デプロイ前の事前チェック (`scripts/productionPreflight.ts`)

本番環境へのプッシュ前に、以下のコマンドを実行します。スクリプトは可変のチェックリスト（必須環境変数、キー形状チェック、任意の Supabase 列プローブ、任意の Stripe 価格プローブ — 完全な一覧は `scripts/productionPreflight.ts` を参照）を出力します：

```bash
npm run preflight:prod -- --stripe-mode=live
```

このスクリプトは、Stripe ライブキーの有効性、Supabase テーブルと RLS の状態、Resend の外部 DNS/SMTP の健全性、およびローカライズされたメッセージキーの一貫性をチェックします。

## 4. 品質保証計画

### 自動化カバレッジ (Vitest)

82 テストファイル、658 テストケースを維持しています：

- **ロジック**: `tests/lib/puzzle/srs.test.ts`, `tests/lib/entitlements.test.ts`。
- **UI**: `tests/components/GoBoard.test.tsx`, `tests/app/TodayClient.test.tsx`。
- **API**: `tests/api/stripeWebhook.test.ts`。

### 手動受入チェックリスト (重要パス)

1.  **デバイス間の整合性**: デスクトップで問題を解き、5 秒以内にスマートフォンで同期を確認する。
2.  **トライアル転換**: 7 日間のトライアルを含む Stripe チェックアウトフローをテストモードで完走させる。
3.  **ロケール SEO**: `sitemap.xml` に **12,000 本超**のロケール別エントリ（`content/data/puzzleIndex.json` に比例）と正しい `hreflang` 代替があることを確認する。
4.  **コーチのガードレール**: プロンプトインジェクション（例：「以前の指示を忘れて」）を試行し、`promptGuard.ts` の遮断を確認する。`promptGuard.ts` はパターンマッチング前に Unicode NFKC 正規化を適用する。全角文字によるバイパス試行（例：`ＳＹＳＴｅｍ: ignore all`）も遮断されることを確認すること。

## 5. テスト構成

テストはソースツリーを `tests/` 以下に反映します：

| ディレクトリ        | スコープ               | 例                                                                    |
| ------------------- | ---------------------- | --------------------------------------------------------------------- |
| `tests/lib/`        | コアライブラリロジック | `puzzle/srs.test.ts`, `entitlements.test.ts`, `coachProvider.test.ts` |
| `tests/components/` | React コンポーネント   | `GoBoard.test.tsx`, `Nav.test.tsx`, `ShareCard.test.tsx`              |
| `tests/api/`        | API ルートハンドラ     | `stripeWebhook.test.ts`, `coach.test.ts`, `puzzleRandom.test.ts`      |
| `tests/app/`        | ページレベル統合       | `TodayClient.test.tsx`, `StatsClient.test.tsx`                        |
| `tests/scripts/`    | ビルド／監査スクリプト | `auditPuzzles.test.ts`, `queueContent.test.ts`                        |

開発および検証に使用する npm スクリプト：

```bash
npm run dev               # ローカル開発サーバー
npm run build             # 本番ビルド
npm run start             # 本番サーバー起動
npm run lint              # ESLint チェック
npm run test              # 全テスト実行
npm run test:watch        # ウォッチモード
npm run test:coverage     # カバレッジレポート付き（目標: 70%+）
npm run format            # Prettier フォーマット
npm run format:check      # フォーマット確認
npm run import:puzzles    # 問題インポート
npm run generate:katago   # KataGo 分析生成
npm run sync:puzzle-index # 問題インデックス同期
npm run validate:puzzles  # 問題検証
npm run validate:messages # メッセージ検証
npm run preflight:prod    # 本番事前チェック
npm run audit:puzzles     # 問題監査
npm run report:duplicates # 重複問題レポート
npm run report:quality    # 問題品質レポート
npm run queue:content     # コンテンツキュー管理
npm run gemini:solutions  # Gemini 解答生成
npm run mimo:solutions    # MiMo 解答生成
npm run supabase:health   # Supabase ヘルスチェック
npm run email:smoketest   # メールスモークテスト
npm run generate:icons    # public/icon.svg から PWA アイコンを再生成
```

## 6. リリース前コンプライアンス監査

コンプライアンス維持のため、外部ダッシュボードでの手動検証が必要です。

### Stripe (決済と税務)

- [ ] **アカウント確認**: 日本円 (JPY) 等の入金のために、本人確認と銀行口座の詳細が完全に確認されていることを確認してください。
- [ ] **Stripe Tax**: 日本の消費税 (JCT) および関連する米国の州の税計算を有効にしてください。
- [ ] **公開情報**: `tokushoho/page.tsx` の開示内容と一致するように、Stripe の「公開詳細」を更新してください。

### Resend & Supabase (通信)

- [ ] **ドメイン認証**: 領収書等の法的メールを確実に届けるため、Resend で SPF/DKIM レコードが「認証済み」であることを確認してください。
- [ ] **送信者 ID**: Supabase Auth の「送信者」をカスタムドメイン (`support@go-daily.app`) に更新してください。

### プライバシーとガバナンス

- [ ] **PIPA 同意**: (手動チェック) ログインフロー内で、韓国語環境向けの同意カードが正しく表示されるか確認。
- [ ] **Sentry PII フィルター**: テスト用のコーチング対話を実行し、Sentry ダッシュボードでメールアドレスや PII が公開されていないことを確認してください。
