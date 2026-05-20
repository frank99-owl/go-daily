# 製品仕様と機能ロジック (PRODUCT_SPECS)

本書では、go-daily のコア機能の動作ロジックを定義します。これは現在の権限エンジンおよびサブスクリプション・エンジンの実装と同期しています。

## 1. 権限エンジン (`lib/entitlements.ts`)

go-daily では、分散したブール値チェックではなく、集中管理された **ルックアップ・テーブル (Lookup Table)** を使用して権限を管理します。これにより、「Lifetime プラン」などの新しい階層の追加が、単一の定数を更新するだけで可能になります。

| 機能              | ゲスト（未ログイン） | フリープラン         | Pro プラン              |
| ----------------- | -------------------- | -------------------- | ----------------------- |
| **AI コーチ配分** | 3回 / 日、5回 / 月   | 10回 / 日、30回 / 月 | **1 日 50+・月 1,000+** |
| **デバイス制限**  | —                    | 1 台                 | 3 台                    |
| **クラウド同期**  | なし                 | シングルデバイス     | マルチデバイス          |
| **広告**          | あり                 | あり                 | なし                    |

**Pro** はドキュメント上 **50+／日・1,000+／月** と表記し、実際の上限は `lib/entitlements.ts` のみが正です。

上表の端末単位の割り当てに加え、ゲストのコーチはサーバー側で **IP×UTC 暦日** の追加日次上限があります（`GUEST_IP_DAILY_LIMIT`、現状 **20** 回/IP/日 — `guestCoachUsage.ts`）。`UPSTASH_*` 設定時は IP カウントを **Upstash** に保持、未設定時はインメモリ `Map`（最大 1 万件、日付ロール後に挿入順で最古キー削除）。表の端末別カウントとは別レイヤーです。

ログイン中のブラウザは `POST /api/auth/device` を通じて `user_devices` 行を登録または更新します。このエンドポイントは Stripe の購読状態と `manual_grants` を合成してから、Free / Pro の端末制限を適用します。

Stripe のステータスが `past_due` のサブスクリプションは、無期限に Pro が維持されるわけではありません。`lib/entitlements.ts` は、`current_period_end + 7 日間` の猶予期間内に限り `past_due` を Pro として扱います。期間終了データが欠落しているか、またはこの期間を過ぎた場合は、有効な `manual_grants` が適用されない限り Free にフォールバックします。`/admin` の Operations Snapshot には、追跡用の猶予期間内および期限切れの `past_due` 数が表示されます。

### キャッシュ戦略 (Next.js 16)

`'use cache'` ディレクティブと `cacheTag` を活用しています。Stripe の Webhook がサブスクリプションを更新すると、`revalidateTag('entitlements:' + userId)` を呼び出し、UI に即座に最新の状態を反映させます。

### 手動 Pro 付与（`manual_grants` / `lib/entitlementsServer.ts`）

Stripe を経由せずメールで Pro を付与する場合は `manual_grants` と `/api/admin/grants` を使用します。`lib/entitlementsServer.ts` の `resolveViewerPlan()` はまず `getViewerPlan()`（Stripe の購読状態）でベースプランを判定し、まだ Pro でない場合に限り、`expires_at` が有効な手動付与で Pro に引き上げます。`/api/admin/grants` は運用者の Supabase ユーザー ID が `ADMIN_USER_IDS` に含まれることを求めます（管理 UI のメール許可リスト・PIN とは別 — `API_REFERENCE` 参照）。

## 2. 間隔反復 (SRS) ロジック (`lib/puzzle/srs.ts`)

改良された SuperMemo-2 (SM-2) アルゴリズムを実装しています。

- **初期状態**： Ease Factor 2.5, Interval 0。
- **品質マッピング**：
  - 不正解 -> 2 (即時の再キューイングをトリガー)
  - 正解 -> 5 (Ease Factor に基づいて次のインターバルを計算)
- **スケジューリング**： 問題は `due_date` の昇順で並べられます。Pro ユーザーはバックログをクリアして、ミス問題管理の「インボックス・ゼロ」を達成できます。

## 3. サブスクリプション管理 (`lib/stripe/`)

- **チェックアウト**： Stripe Adaptive Pricing を使用し、ユーザーの IP に基づいて $4.9 USD を適切な日本円（JPY）などのローカル通貨に自動変換します。
- **Webhook の冪等性**： すべての Stripe イベントは、処理前に `stripe_events` テーブルに記録されます。イベントが再配信された場合、システムは重複を検知して処理をスキップします。
- **トライアル期間**： すべての Pro サブスクリプションで 3 日間のトライアルを必須としています。支払い方法の事前登録 (`payment_method_collection: 'always'`) を求めることで、トライアルから本契約への転換率を高めています。

## 4. パズルコレクションとフィルタ (`lib/puzzle/puzzleCollections.ts`)

タグと難易度によるブラウズをサポートします。

- **タグ**: `life-death`, `tesuji`, `endgame`, `opening`（`PuzzleTagSchema` で定義）。
- **難易度**: 1–5 のスケール。各問題は単一の難易度。
- **コレクションページ**: `/puzzles/tags/{tag}` と `/puzzles/difficulty/{level}` が `PuzzleListClient` でフィルタ表示をレンダリングします。

## 5. コンテンツ品質の階層化 (Content Quality Tiers)

パズルの品質や AI コーチへの適合度は、「正解があるかどうか」だけで判断することはできません。共有構造は `types/schemas.ts` で定義されています：`correct` と `solutionNote` は基本フィールドであり、`solutionSequence` 和 `wrongBranches` はオプションの高度な指導用フィールドです。

製品としては、パズルの品質を以下の4つの階層で管理しています：

| 品質層            | 判定基準                                                                     | プロダクトでの用途                                         |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `basic-explained` | 正解と4言語の解説があり、運営許可リストに入っていない                        | 日替わり問題、結果ページの静的解説、基礎復習               |
| `coach-eligible`  | `checkCoachEligibility()` の基本品質ゲートを通過し、運営キューに入り得る     | 制限付きの AI 基礎解説、初期問題プール、コンテンツ強化候補 |
| `coach-ready`     | 正解、解説、`solutionSequence`、`wrongBranches` があり、承認済み             | 完全な AI コーチ機能、変化図に対する追問いが可能           |
| `variation-ready` | 重複組や同形の問題が明確な変化関係として整理され、差異や順序が説明されている | テーマ別訓練、弱点分析、次の問題推薦、高度な復習ルート     |

実装上、`lib/coach/coachEligibility.ts` は `qualityTier` と `hasVariationSupport` を返します。`content/data/coachBasicEligibleIds.json` は基礎説明の対象、`content/data/coachReadyIds.json` は完全なコーチの承認対象、`content/data/variationGroups.json` は整理済みの変化図グループを管理しています。`getCoachAccess()` はデータ層と実行時品質ゲートの両方を検証します。パズルが完全な AI コーチ機能を提供するのは、`coach-ready` に達し、かつ `coachReadyIds.json` に含まれている場合に限られます。`variation-ready` の場合はさらに、レビュー済みの変化図グループに含まれている必要があります。`basic-explained` および `coach-eligible` の品質層では、静的解説や制限付きの Q&A は提供されますが、完全な変化図対話は保証されません。

## 6. 学習ループ (The Learning Loop)

ターゲットとなるユーザー導線は `onboarding → first puzzle → result → coach → review → next recommendation` です：

| ステップ            | ユーザーに提示するフィードバック                                   | システムの判断根拠                                |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| Onboarding          | 最適な訓練強度、テーマ別の入り口、今日の目標                       | 訓練レベルの好み、ロケール、ログイン状態          |
| First puzzle        | 明確なテーマ、難易度、手番、即時の着手フィードバック               | パズルインデックス、日替わり選択、盤面ルール      |
| Result              | 正誤、正解手順、重要な形の解説、復習キューへの登録可否             | `correct`, `solutionNote`, 挑戦記録               |
| Coach               | 質問可能な解説の境界；承認された問題でのみ手順・失敗図の対話を提供 | `qualityTier`, クォータ, 承認リスト, ペルソナ設定 |
| Review              | 前回の誤答原因、復習の目標、次回の SRS スケジュール                | 挑戦履歴, `reviewSrs.ts`                          |
| Next recommendation | 単なるランダムではなく、最適な次の問題                             | 難易度, タグ, SRS期限, 最近の誤答, 品質層         |

このループのコア指標は、最初の問題の完了率、結果ページからの継続率、コーチ利用後の翌日再訪率、誤答復習の完了率、および Pro へのコンバージョンポイントの品質です。

## 7. AI の安全とコスト境界 (AI Security & Cost Boundaries)

コーチングリクエストの安全およびコスト制御は、`/api/coach`、`lib/promptGuard.ts`、`lib/coach/*`、`lib/rateLimit.ts`、および監視ラッパーが共同で処理します：

- **プロンプト注入防御**: ユーザーのメッセージはまず `guardUserMessage()` を通過します。検出処理には、NFKC 正規化、Cyrillic/Greek 同形文字の折りたたみ、ゼロ幅スペースの削除、コンパクト文字列マッチング、キーワード密度チェックが含まれます。注入リクエストは、問題のクエリ、クォータの減算、モデルの呼び出しの前に拒否されます。
- **リクエストおよびコンテキストバジェット**: コーチの POST リクエストボディは最大 8 KB に制限されます。対話履歴は最大 6 往復保持され、総文字数バジェットは 6,000 文字（メッセージあたり 2,000 文字に切り詰め）、アップストリームモデルの `max_tokens` は 400 に固定され、25 秒のタイムアウトが適用されます。
- **クォータとレート制限**: グローバルな IP レート制限は `createRateLimiter()` が担当し、本番環境で Upstash がない場合は最初の制限チェックで 503 をスローします。ゲストユーザーにはデバイスごとの日次/月次制限および IP 日次制限が適用されます。ログインユーザーは、並行呼び出しによる回避を防ぐため、Postgres RPC を介して日次/月次クォータを原子的に確認・インクリメントします。
- **クォータ減算とロールバック**: クォータ利用数は、ユーザーが接続を切断してカウントを回避するのを防ぐため、モデルレスポンスのストリーミング前に減算されます。アップストリームでのエラーやストリームの失敗時にはロールバックされます。不正なリクエスト、プロンプトガードの検出、非対応の問題、またはクォータ不足の場合はモデルを呼び出しません。
- **コストの観測可能性**: サーバーサイドの PostHog には、モデル名、プロバイダー、所要時間、トークン数のみが記録され、ユーザーの入力、AI の返答、SGF 棋譜、または内部 ID は記録されません。プロバイダーから使用量が返されない場合は `usageAvailable=false` として記録されます。

## 8. ファネルとイベント (Funnel & Events)

PostHog イベントは、アクティベーション、リテンション、コーチ、コンバージョンの 4 つのカテゴリに分類され、信頼できる唯一の情報源は `lib/posthog/eventTypes.ts` に定義されています。クライアント側は `track()`、サーバー側は `captureServerEvent()` を使用して送信します。テスト環境ではモックラッパーを使用し、実際のネットワーク送信を回避します。

| 分類       | イベント                                                                                                            | 低感度属性の境界                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Activation | `onboarding_started`, `first_move_played`, `first_puzzle_completed`, `result_viewed`, `next_recommendation_clicked` | `locale`, `source`, `level`, `tag`, `difficulty`, `contentTier`, `result`, `recommendationType` |
| Retention  | `review_page_viewed`, `review_item_opened`, `stats_page_viewed`, `review_recommendation_viewed`                     | `locale`, `source`, `plan`, `tag`, `difficulty`, `result`, `recommendationType`                 |
| Coach      | `coach_opened`, `coach_prompt_clicked`, `coach_response_completed`, `coach_error_shown`, `coach_quota_state_seen`   | `locale`, `source`, `contentTier`, `result`, `promptKey`                                        |
| Conversion | `pricing_viewed`, `checkout_click`, `upsell_viewed`, `upsell_cta_clicked`                                           | `locale`, `source`, `plan`, `interval`                                                          |

プライバシー境界: イベント属性には、生 SGF 棋譜、ユーザーが自由入力したテキスト、AI との対話内容、メールアドレス、ユーザー ID、Stripe 顧客/購読 ID、デバイス ID、またはリビールトークンを送信しません。サーバーサイド PostHog の `distinctId` は SHA-256 派生値を使用し、データベースや決済システムの ID の露出を防ぎます。`captureServerEvent()` は送信前に機密性の高いキーや値を検証し、検出時にはイベントをブロックして低感度の警告のみを記録します。

## 9. 法的コンプライアンスの表示ロジック

システムは、Apple 方式の「統合された柱」による法的提供メカニズムを採用しています。

- **動的な法的フッター**: フッターは 3 つの核心的な柱へのリンクを表示します： `/legal/privacy` (プライバシー)、 `/legal/terms` (利用規約)、 `/legal/refund` (返金)。
- **統合された開示事項**:
  - **日本の特定商取引法**: 利用規約に直接統合されています。
  - **台湾の消費者保護法**: 利用規約に直接統合されています。
  - **英国/欧州の DMCCA**: 返金ポリシーに統合されています。
- **コンテンツ配信**: すべての法的テキストは `app/[locale]/legal/_content.ts` から配信されます。

## 10. アクセシビリティとルートバウンダリ

- **Heatmap ARIA**: アクティビティヒートマップはコンテナに `role="grid"` と `aria-label`、各日付セルに `role="gridcell"` と説明的な `aria-label` を使用。
- **UserMenu キーボードナビゲーション**: ドロップダウンメニューは ArrowUp/Down で項目循環、Home/End で先頭/末尾へのジャンプ、Escape で閉じ、オープン時に最初の項目に自動フォーカス。
- **ルートローディング/エラー状態**: 主要ルート（today、result、review、puzzles）に `loading.tsx`（スケルトン UI）と `error.tsx`（ローカライズされたエラーバウンダリ＋リトライ）を配置。共有コンポーネント：`PageSkeleton` と `PageError`。
- **CSS変数によるテーマ**: すべてのアクセントカラーがハードコードされた16進数値ではなく `var(--color-accent)`（`globals.css` で定義）を参照し、将来のテーマカスタマイズに対応。
