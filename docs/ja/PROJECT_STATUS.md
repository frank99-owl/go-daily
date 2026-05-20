# go-daily プロジェクトステータスと次なるロードマップ

**生成日**: 2026-05-19
**リポジトリ HEAD**: `main`（本番環境の構成および煙テスト結果を本書に記録）
**ステータス**: Phase 3 初回パス完了。本番構成およびリリース窓煙テストに合格、GitHub リリースおよび公開発表の承認待ち

---

## 一、現在の基準 (Current Baseline)

go-daily は、日替わりの囲碁問題データベース、4言語ローカライズ、DeepSeek を活用した流式 AI コーチング、SRS 復習、Supabase の状態同期、Stripe のサブスクリプション、および多管轄区域対応の法的ページを備えています。現段階の重点は単なる基本機能の追加ではなく、これらの機能をユーザーの定着とコンバージョンを促す持続可能な学習システムとして整理することです。

最新の検証結果：

- **問題の検証**: `npm run validate:puzzles` に合格、現在 **3033** 問。
- **i18n の検証**: `npm run validate:messages` に合格、**4言語 × 499キーパス**が一致。
- **P2-C ターゲットテスト**: `npm run test -- tests/api/health.test.ts tests/app/sitemap.test.ts tests/app/pwaShell.test.ts tests/api/report-error.test.ts tests/api/stripeWebhook.test.ts tests/api/stripeCheckoutPortal.test.ts tests/api/dailyEmailCron.test.ts tests/scripts/productionPreflight.test.ts tests/scripts/emailSmoketest.test.ts` に合格、**9個のテストファイル、66個のテストケース**。
- **Lint と型チェック**: `npm run lint` および `npx tsc --noEmit` の両方に合格。
- **P2-D ターゲットテスト**: `npm run test -- tests/lib/promptGuard.test.ts tests/api/coach.test.ts tests/lib/posthog/eventTypes.test.ts tests/lib/posthog/server.test.ts` に合格、**4個のテストファイル、66個의 テストケース**。拡張スイート `npm run test -- tests/lib/promptGuard.test.ts tests/api/coach.test.ts tests/lib/posthog/eventTypes.test.ts tests/lib/posthog/server.test.ts lib/sentryScrubber.test.ts` に合格、**5個のテストファイル、79個のテストケース**。P2-D は `32f98c4 security: harden coach guard and telemetry privacy` としてコミット済み。
- **本番環境ライブ予備検査**: `npm run preflight:prod -- --check-remote --stripe-mode=live` に合格、**123件合格 / 0件警告 / 0件失敗**。リモートの Supabase テーブル／列、Stripe のライブ価格、およびローカルの本番境界がすべて一致。
- **電子メールの煙テスト**: Resend の本番環境 API キーがローテーションされオンライン化。`npm run email:smoketest -- --check-remote` に合格。`go-daily.app` ドメイン、SPF、および DKIM のリモート検証に合格、実際の電子メールの煙テスト送信が成功。
- **決済煙テスト**: Stripe での実際の $1 決済煙テストが成功し、その後に返金が成功。Stripe イベントの `pending_webhooks=0`。
- **本番環境へのデプロイ**: Vercel 本番環境が正常に再デプロイされ、`https://go-daily.app` が新しいデプロイメントにエイリアスされました。`/api/health` が 200 を返し、Supabase のチェック結果は `ok`、`/ja/pricing` は 200 を返しました。
- **本番環境のビルド**: `npm run build` に合格（Next.js **16.2.6**）、**131** 個の静的ページを生成。

## 二、完了した機能 (Completed Capabilities)

- **Upstash Redis レート制限**: 本番環境では Upstash Redis でマルチインスタンスのレート制限を行います。`NODE_ENV === "production"` であり、かつ Upstash の資格情報（`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`）が設定されていない場合、`createRateLimiter()` はスタブを返し、最初の `isLimited()` 呼び出しで例外をスローします（これにより、Upstash 認証なしで `next build` を完了できます。開発環境では両方を省略して `MemoryRateLimiter` を使用します）。
- **PWA アイコン**: Android/Chrome のインストールプロンプト用に 192×192、512×512 PNG アイコンを追加。
- **OG 画像のローカライズ**: SNS 共有画像が閲覧者のロケール（zh/en/ja/ko）でレンダリングされるように変更。
- **ja.json 翻訳修正**: 3 つの日本語 UI 文字列から混入した韓国語・中国語文字を除去。
- **環境変数の集中検証**: `lib/env.ts` — Zod ベースの遅延シングルトンが分散した `process.env` 読み取りを置換。
- **エラーページの多言語化**: すべてのエラーバウンダリ（`error.tsx`、`global-error.tsx`、`not-found.tsx`）が 4 言語をサポート。
- **テーマカラーの集中化**: 53 箇所のハードコードされた `#00f2ff` を `var(--color-accent)` CSS 変数に置換。
- **コード分割**: `CoachDialogue`、`ShareCard`、`BoardShowcase` を `next/dynamic` で遅延読み込み。
- **P1 学習ループ初回パス**: オンボーディングから最初の問題へのループ、結果ページでの誤答理由理解、次の推奨問題へのルーティング、復習／統計インサイト、および制限付きの CoachDialogue アップグレードを完了。
- **P2-A 商業コピー監査**: 初回パス完了。製品、価格、Coach、Review、Stats、および公開文書における権限表現を監査し、証明不可能な約束を回避。
- **P2-B ファネルとイベント**: 初回パス完了。アクティベーション、定着、コンバージョン用の PostHog イベント命名とトリガーポイントを設定。
- **P2-C 本番環境の煙テスト**: 初回パス完了。2026-05-19 リリース窓でライブ検証に合格：Resend リモート実際送信、Stripe ライブ決済／返金、Vercel 本番環境再デプロイ、Supabase リモートチェックがすべて合格。
- **P2-D AI セキュリティとコスト**: 初回パス完了。promptGuard のレッドチームテストを強化、コーチ費用制御を導入、Sentry/PostHog のプライバシー監査を実施（外部システム変更なし、実イベント送信なし、シークレット漏洩なし）。
- **P2-E リリース資料**: ローカル初回パス完了。`LAUNCH_CHECKLIST`、README 調整、英文ケーススタディ、売上実験計画、ユーザーインタビュー用スクリプト、30/60/90日ロードマップを含む。
- **SEO hreflang**: `buildHreflangAlternates()` ヘルパーが全ページルートに `alternates.languages` を追加。
- **アクセシビリティ**: Heatmap ARIA セマンティクス（`role="grid"`、`aria-label`）、UserMenu キーボードナビゲーション（矢印キー、Home/End）。
- **ルートバウンダリ**: today、result、review、puzzles ルートに `loading.tsx` + `error.tsx` を追加。
- **ゲストコーチの永続化**: Supabase の `guest_coach_usage` が端末／日単位の匿名コーチ利用を集計（`service_role` のみ）。IP 制限は不正対策用にインメモリのまま。
- **碁盤モジュール**: コアは 4 ファイル（`board.ts`, `goRules.ts`, `judge.ts`, `sgf.ts`）に整理し、旧 `boardDisplay.ts` を削除。
- **ドキュメント同期**：API リファレンスに `/api/health`、`/api/admin/*`、`/api/auth/device`、`POST /api/coach` を **SSE**（Server-Sent Events）として記載し、Postgres **RPC** での使用量加算も反映；**管理系**: `/api/admin/verify` は `ADMIN_EMAILS` + `ADMIN_PIN`、**`/api/admin/grants` は `ADMIN_USER_IDS`**；DB 資料に権限ベースの `user_devices`、`manual_grants`、`guest_coach_usage`、および **`0007_atomic_coach_usage_increment.sql`** を追記；各言語の **`CONCEPT.md` は実際の上限に整合**（無制限コーチではない — **`PRODUCT_SPECS`**）；README／索引も 9 ドメイン構成に一致；`docs/README.md` に公開リポジトリ向けの秘密情報取り扱いを記載。

## 三、コンテンツ品質の現状 (Content Quality Status)

最新のコンテンツ監査報告は `reports/*/latest.md` および P0-D ローカル監査チェックリスト（2026-05-18 生成）に保存されています。

- **問題データベース構造**: 3033問すべてが 19×19。難易度 3 が 46.5%、難易度 4 が 35.1% を占めています。主なタグは `tesuji`（1822問、60.1%）、続いて `life-death`（1187問）。`endgame`（ヨセ）と `opening`（布石）はそれぞれ 12問です。
- **コンテンツの解説**: 全量監査により、3033問すべてが `explained` レベルに達していることを確認。フィールドの欠落、正解の欠落、または明らかなプレースホルダー解説はありません。190個の解説が500文字を超えており、冗長または重複していないか検証が必要です。
- **コーチの完成度**: コーチデータファイルは `coachBasicEligibleIds.json`（3033）、`coachReadyIds.json`（20）、および `variationGroups.json`（0グループ）に分割され、`getCoachAccess()` はこれらを実行時チェックと重ねて検証します。P0-D は20問に対して `solutionSequence` と `wrongBranches` を補強しましたが、残りの **3013** 問はテキスト解説があるというだけで「完全な AI コーチ対応問題」とはみなされません。
- **品質サンプリング**: 195問がレビュー対象としてフラグ設定されています。初期 P0-D バッチ以外の問題は一般に `solutionSequence` と `wrongBranches` が欠けています。高難易度の問題、隣接する重複問題、およびランダムサンプルの継続的な補強が必要です。
- **重複問題**: 89個の部分重複グループ（243問を含む）を発見。完全重複グループはありません。重複グループは通常、異なる解説を持つ同形問題であり、単純に削除するのではなく、変化図に統合するか関連練習としてタグ付けするべきです。

## 四、コンテンツ向上ロードマップ (Content Enhancement Roadmap)

1. **品質層の明確化**: 問題を明確に `basic-explained`、`coach-eligible`、`coach-ready`、および `variation-ready` 層に分類します。現在、全データベースが `coach-eligible` の基礎候補として機能しており、P0-D の初期20問が `coach-ready` として承認されています。その他の問題の多くは、正解手順と誤答分岐が欠けています。
2. **高価値コンテンツの優先**: 難易度 4-5、重複グループ、および希少タグ（`endgame` / `opening`）の問題に対して、手動または半自動で `solutionSequence` と `wrongBranches` を作成し、小規模なバッチでレビューに送ります。
3. **重複を資産へ変換**: 異なる解説を持つ重複グループを「同形／変化図」のアセットに変換し、指導上の差異を維持します。ユニークな価値がまったくない場合のみ削除を検討します。
4. **構造的偏りの抑制**: データベースが 19×19 の中級手筋にさらに集中するのを避けるため、9×9/13×13 の入門用パス、ヨセ、および布石のテーマの追加を優先します。
5. **報告書によるキューの推進**: `audit:puzzles` で全体の分布を把握し、`report:quality` で解説の深さをチェックし、`report:duplicates` で重複を変化図に変換し、`queue:content` で検証済みのリリース候補を出力します。

## 五、学習ループの設計 (Learning Loop Design)

P1-A から P1-E の初回パスを実装しました。現在のベースラインは、新規ユーザーをオンボーディングから最初の問題へと導き、結果ページでエラーの理由を説明し、次のステップを推奨します。CoachDialogue は、問題の階層、クォータ、および失敗に適応するように最適化されています。

製品の次のフェーズでは、ユーザー体験を `onboarding → first puzzle → result → coach → review → next recommendation` に沿って整理します：

- **オンボーディング**: 훈련레벨과 목표를 수집하고... 가 아니라, 訓練レベルと目標を収集し、紹介するだけでなく「今日何をするか」の明確な入り口を提供します。
- **最初の問題**: フリクションを低く抑え、明確なテーマ、難易度、および即時の着手フィードバックを提供します。
- **結果ページ**: 単に正誤を示すだけでなく、「なぜこの手が成立するのか／なぜその誤手が失敗するのか」を説明し、次のアクションを提案します。
- **コーチ**: 承認済みの `coach-ready` 問題でのみ完全な AI コーチングを強調し、`basic-explained` 問題では AI の幻覚を防ぐために制限された静的解説を提供します。
- **復習**: 誤答を SRS に送信し、復習時に前回の誤り箇所と今回の目標を強調します。
- **次の問題の推薦**: 難易度、タグ、最近の誤答、および SRS の期限切れに基づいて次の問題を決定し、持続可能な毎日の練習習慣を構築します。

## 六、最近の改善 (v1.1 加固)

- **メモリ安全なレート制限**: `MemoryRateLimiter`（5万件上限）とゲスト IP カウンタ（1万件上限）が期限切れエントリを削除し、サーバーレスインスタンスのメモリ無制限増加を防止します。
- **共通ボディパース**: 主要な JSON ミュテーション（`/api/coach`、`/api/auth/device`、`/api/puzzle/attempt`、`/api/puzzle/reveal`）は `lib/apiHeaders.ts` の `parseMutationBody()` を使用（既定 **2 KB**、コーチ **8 KB**、reveal **3 KB**）。Stripe などは同一オリジンとルート固有の JSON 解析。
- **Unicode プロンプトインジェクション防御**: `promptGuard.ts` がパターンマッチング前に NFKC 正規化と一般的な Cyrillic/Greek 同形文字の折りたたみを適用します。
- **Coach UX の改善**: 汎用エラー時のリトライボタン、思考中のアニメーション表示、メンター切り替え時のスケルトンローディング。
- **Stripe Webhook のハードニング**: ボディ読み込み前に 1 MB のペイロードサイズ制限（HTTP 413）を検証。
- **GoBoard の無効状態**: 操作不可時に盤面を 50% 透明度で表示。

## 七、Phase 3 初回パス完了ステータス (Phase 3 First Pass Completion Status)

Phase 3 の初回パスが完了しました：P0 コンテンツ品質ベースライン、P1 学習ループ、P2 リリース／成長／運営資料、および本番環境의 煙テストがすべて納品されました。本番環境は検証済みであり、残るステップは GitHub リリース、公開発表のアナウンス、およびその後の実際のユーザー検証です。

即時の次のステップ：

1. **GitHub リリース承認**: このドキュメントの差分、タグ名、およびリリースノートを検証し、タグをプッシュして GitHub リリースを作成します。
2. **次のコーチ問題の洗練**: `queue:content` / `plan:content-batch` から 20-50 問の高価値問題を継続して洗練し、`solutionSequence` と `wrongBranches` を完成させて承認リストにプッシュします。
3. **実際のユーザー検証**: [USER_INTERVIEW_SCRIPT.md](USER_INTERVIEW_SCRIPT.md) および [REVENUE_EXPERIMENTS.md](REVENUE_EXPERIMENTS.md) に従って小規模な検証を実行します。ユーザーへの連絡、メール送信、決済の受領、またはウェイトリストの公開の前に、個別の承認が必要です。
4. **本番環境の観察**: 安定性を監視するため、古い Resend / Stripe キーを 24-48 時間保持してからクリーンアップし、早期失効を防ぎます。

Frank からの個別の承認が必要な外部アクション：`git push`、PR の作成／更新、GitHub リリースの作成、DNS/Cloudflare の変更、Supabase 本番環境の変更、公開発表のアナウンス、および発信メール／マーケティングキャンペーン。

---

詳細については、[docs/ja/CONCEPT.md](docs/ja/CONCEPT.md) を参照してください。
