# 製品仕様と機能ロジック (PRODUCT_SPECS)

本書では、go-daily のコア機能の動作ロジックを定義します。これは現在の権限エンジンおよびサブスクリプション・エンジンの実装と同期しています。

## 1. 権限エンジン (`lib/entitlements.ts`)

go-daily では、分散したブール値チェックではなく、集中管理された **ルックアップ・テーブル (Lookup Table)** を使用して権限を管理します。これにより、「Lifetime プラン」などの新しい階層の追加が、単一の定数を更新するだけで可能になります。

| 機能              | ゲスト（未ログイン） | フリープラン         | Pro プラン              |
| ----------------- | -------------------- | -------------------- | ----------------------- |
| **AI コーチ配分** | 3回 / 日、5回 / 月   | 10回 / 日、30回 / 月 | 51回 / 日、1,001回 / 月 |
| **デバイス制限**  | —                    | 1 台                 | 3 台                    |
| **クラウド同期**  | なし                 | シングルデバイス     | マルチデバイス          |
| **広告**          | あり                 | あり                 | なし                    |

上表の端末単位の割り当てに加え、ゲストのコーチはサーバー側で **IP×UTC 暦日** の追加日次上限があります（`GUEST_IP_DAILY_LIMIT`、現状 **20** 回/IP/日 — `guestCoachUsage.ts`）。`UPSTASH_*` 設定時は IP カウントを **Upstash** に保持、未設定時はインメモリ `Map`（最大 1 万件、日付ロール後に挿入順で最古キー削除）。表の端末別カウントとは別レイヤーです。

### キャッシュ戦略 (Next.js 16)

`'use cache'` ディレクティブと `cacheTag` を活用しています。Stripe の Webhook がサブスクリプションを更新すると、`revalidateTag('entitlements:' + userId)` を呼び出し、UI に即座に最新の状態を反映させます。

### 手動 Pro 付与（`manual_grants` / `lib/entitlementsServer.ts`）

Stripe を経由せずメールで Pro を付与する場合は `manual_grants` と `/api/admin/grants` を使用します。`lib/entitlementsServer.ts` の `resolveViewerPlan()` はまず `getViewerPlan()`（Stripe の購読状態）でベースプランを判定し、まだ Pro でない場合に限り、`expires_at` が有効な手動付与で Pro に引き上げます。

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
- **トライアル期間**： すべての Pro サブスクリプションで 7 日間のトライアルを必須としています。支払い方法の事前登録 (`payment_method_collection: 'always'`) を求めることで、トライアルから本契約への転換率を高めています。

## 4. パズルコレクションとフィルタ (`lib/puzzle/puzzleCollections.ts`)

タグと難易度によるブラウズをサポートします。

- **タグ**: `life-death`, `tesuji`, `endgame`, `opening`（`PuzzleTagSchema` で定義）。
- **難易度**: 1–5 のスケール。各問題は単一の難易度。
- **コレクションページ**: `/puzzles/tags/{tag}` と `/puzzles/difficulty/{level}` が `PuzzleListClient` でフィルタ表示をレンダリングします。

## 5. 法的コンプライアンスの表示ロジック

システムは、Apple 方式の「統合された柱」による法的提供メカニズムを採用しています。

- **動的な法的フッター**: フッターは 3 つの核心的な柱へのリンクを表示します： `/legal/privacy` (プライバシー)、 `/legal/terms` (利用規約)、 `/legal/refund` (返金)。
- **統合された開示事項**:
  - **日本の特定商取引法**: 利用規約に直接統合されています。
  - **台湾の消費者保護法**: 利用規約に直接統合されています。
  - **英国/欧州の DMCCA**: 返金ポリシーに統合されています。
- **コンテンツ配信**: すべての法的テキストは `app/[locale]/legal/_content.ts` から配信されます。

## 6. アクセシビリティとルートバウンダリ

- **Heatmap ARIA**: アクティビティヒートマップはコンテナに `role="grid"` と `aria-label`、各日付セルに `role="gridcell"` と説明的な `aria-label` を使用。
- **UserMenu キーボードナビゲーション**: ドロップダウンメニューは ArrowUp/Down で項目循環、Home/End で先頭/末尾へのジャンプ、Escape で閉じ、オープン時に最初の項目に自動フォーカス。
- **ルートローディング/エラー状態**: 主要ルート（today、result、review、puzzles）に `loading.tsx`（スケルトン UI）と `error.tsx`（ローカライズされたエラーバウンダリ＋リトライ）を配置。共有コンポーネント：`PageSkeleton` と `PageError`。
- **CSS変数によるテーマ**: すべてのアクセントカラーがハードコードされた16進数値ではなく `var(--color-accent)`（`globals.css` で定義）を参照し、将来のテーマカスタマイズに対応。
