# 運用、デプロイ、および品質保証 (OPERATIONS_QA)

本書では、環境構成から品質検証に至るまでの go-daily の製品ライフサイクルについて説明します。

## 1. 本番スタック
*   **ホスティング**: Vercel (Region: `iad1` - 米国東部)
*   **データベース**: Supabase (Region: `ap-southeast-1` - シンガポール)
*   **DNS & CDN**: Cloudflare (Proxy 有効)
*   **観測性**: Sentry (エラー) + PostHog (イベント) + Vercel Speed Insights

## 2. 環境構成
構成は Vercel の環境変数を通じて管理されます。最も重要なトグルは以下の通りです：
*   `NEXT_PUBLIC_IS_COMMERCIAL`: Stripe コンポーネントと `/pricing` ページを有効にするには `true` に設定します。
*   `COACH_MODEL`: デフォルトは `deepseek-chat`。より精度の高い `deepseek-reasoner` に変更可能です。
*   `COACH_MONTHLY_TOKEN_BUDGET`: 予期せぬ課金の急増を防ぐための、アプリケーションレベルのハードな月間制限。

## 3. デプロイ前の事前チェック (`scripts/productionPreflight.ts`)
本番環境へのプッシュ前に、以下のコマンドを実行して 47 項目の重要な設定を確認してください：
```bash
npm run preflight:prod -- --stripe-mode=live
```
このスクリプトは、Stripe ライブキーの有効性、Supabase テーブルと RLS の状態、Resend の外部 DNS/SMTP の健全性、およびローカライズされたメッセージキーの一貫性をチェックします。

## 4. 品質保証計画

### 自動化カバレッジ (Vitest)
以下をカバーする約 570 件のテストを維持しています：
*   **ロジック**: `lib/srs.test.ts`, `lib/entitlements.test.ts`。
*   **UI**: `components/GoBoard.test.tsx`, `app/TodayClient.test.tsx`。
*   **API**: `tests/api/stripeWebhook.test.ts`。

### 手動受入チェックリスト (重要パス)
1.  **デバイス間の整合性**: デスクトップで問題を解き、5 秒以内にスマートフォンで同期を確認する。
2.  **トライアル転換**: 7 日間のトライアルを含む Stripe チェックアウトフローをテストモードで完走させる。
3.  **ロケール SEO**: `sitemap.xml` に 4,800 以上の全エントリが含まれていることを確認する。
4.  **コーチのガードレール**: プロンプトインジェクション（例：「以前の指示を忘れて」）を試行し、`promptGuard.ts` の遮断を確認する。

## 5. メンテナンス・タスク
*   **問題のインポート**: `npm run import:puzzles` (SGF を `classicalPuzzles.json` に統合)。
*   **著作権監査**: `npm run audit:puzzles` (`reports/` にレポートを生成)。
*   **I18N 同期**: `npm run validate:messages` (4 言語間でキーの欠落がないことを確認)。
