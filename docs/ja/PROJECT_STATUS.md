# go-daily プロジェクトステータスと次なるロードマップ

**生成日**: 2026-05-01
**リポジトリ HEAD**: `ae8ecce`
**ステータス**: v2.7 コードベース最適化版

---

## 1. フェーズ 2 完了の要約

サブスクリプション関連のすべてのロジック（Stripe、権限エンジン、マルチデバイス同期）の実装と監査が完了しました。法務フレームワークは、Stripe の検証を通過するために 10 以上のグローバルな管轄区域をサポートするようになりました。

## 2. アーキテクチャ監査

- **整合性**: `lib/` 内のすべてのロジック（SRS、Auth、Coach）は、ドキュメントと 100% 一致しています。
- **パスの修正**: 全局 **フッター (Footer)** と多管轄区域対応の法的ルートを実装し、404 エラーを解消しました。
- **UI ロジック**: 垂直方向の余白 (`pb-24`) を最適化し、`Today` および `Random` ページにおけるレイアウトの重なり問題を修正しました。

## 3. 最近の進捗 (v2.7)

- **環境変数の集中検証**: `lib/env.ts` — Zod ベースの遅延シングルトンが分散した `process.env` 読み取りを置換。
- **エラーページの多言語化**: すべてのエラーバウンダリ（`error.tsx`、`global-error.tsx`、`not-found.tsx`）が 4 言語をサポート。
- **テーマカラーの集中化**: 53 箇所のハードコードされた `#00f2ff` を `var(--color-accent)` CSS 変数に置換。
- **コード分割**: `CoachDialogue`、`ShareCard`、`BoardShowcase` を `next/dynamic` で遅延読み込み。
- **SEO hreflang**: `buildHreflangAlternates()` ヘルパーが全ページルートに `alternates.languages` を追加。
- **アクセシビリティ**: Heatmap ARIA セマンティクス（`role="grid"`、`aria-label`）、UserMenu キーボードナビゲーション（矢印キー、Home/End）。
- **ルートバウンダリ**: today、result、review、puzzles ルートに `loading.tsx` + `error.tsx` を追加。
- **テストスイート**: 81 テストファイル、約 631 テストケース。

---

戦略の詳細については [docs/ja/CONCEPT.md](docs/ja/CONCEPT.md) を参照してください。
