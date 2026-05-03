# go-daily

> 囲碁の詰碁問題を毎日一問 — ソクラテス式 AI コーチと共に（**中 / EN / 日 / 한**）。

**Languages:** [English](README.md) · [中文](README.zh.md) · 日本語（本ページ） · [한국어](README.ko.md)

[![CI](https://github.com/frank99-owl/go-daily/actions/workflows/ci.yml/badge.svg)](https://github.com/frank99-owl/go-daily/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)
![Stripe](https://img.shields.io/badge/Stripe-payments-626cd9?logo=stripe)

## 概要

**go-daily** は、毎日ひとつの厳選された死活問題に取り組む **習慣化** に特化した囲碁プラットフォームです。**中国語・英語・日本語・韓国語** 対応の製品体験と、答えをそのまま渡さず思考を促す **ソクラテス式 AI コーチ** を備えています。

実装上は **Next.js 16（App Router）** を基盤に、**Supabase**（認証・Postgres・RLS）と **Stripe**（サブスクリプション）を接続し、`lib/` 配下を **9 ドメイン** に分割して境界を明確に保ちます。

## ハイライト

| 観点 | 内容 |
| ---- | ---- |
| **毎日の練習** | キュレーションされた問題、没入型フロー、キーボードで操作できる盤面 |
| **AI コーチ** | ストリーミング Coach API、利用枠・ペルソナ、問題ごとの可否判定 |
| **グローバル** | ロケール接頭のルーティング、sitemap が問題コーパスと連動、地域別価格 |
| **運用** | API と DB をドキュメント化、CI（フォーマット・Lint・検証・型チェック・テスト・ビルド） |

## ドキュメント

正式な技術・製品ドキュメントは `docs/` にある **8 本の柱 × 4 言語** です。入口は **[ドキュメントハブ](docs/README.md)**（`en` / `zh` / `ja` / `ko`）。

| 知りたいこと | 日本語 |
| ------------ | ------ |
| ビジョン・フェーズ | [プロジェクト理念](docs/ja/CONCEPT.md) |
| リクエストと `lib/` 分離・セキュリティ | [アーキテクチャ](docs/ja/ARCHITECTURE.md) |
| SRS・権利・課金・コーチルール | [製品仕様](docs/ja/PRODUCT_SPECS.md) |
| デプロイ・環境・テスト | [運用と QA](docs/ja/OPERATIONS_QA.md) |
| 準備状況の追跡 | [プロジェクト状況](docs/ja/PROJECT_STATUS.md) |
| HTTP API | [API リファレンス](docs/ja/API_REFERENCE.md) |
| スキーマ・RLS | [データベーススキーマ](docs/ja/DATABASE_SCHEMA.md) |
| コンプライアンス | [法務](docs/ja/LEGAL_COMPLIANCE.md) |

**その他:** [CHANGELOG](CHANGELOG.md) · [SECURITY](SECURITY.md) · [Contributing](CONTRIBUTING.md) / [中文](CONTRIBUTING.zh.md) · [LICENSE](LICENSE)

## クイックスタート

### 前提

- Node.js **22.5+**（`package.json` の `engines`）
- DeepSeek または OpenAI 互換の API キー
- Supabase プロジェクト（任意。匿名モードは未設定でも可）

### セットアップ

```bash
git clone https://github.com/frank99-owl/go-daily.git
cd go-daily
cp .env.example .env.local
npm install
npm run dev
```

`http://localhost:3000` を開くと、`/{zh|en|ja|ko}/...` へネゴシエーションされます。

## 技術スタック

| 層 | 採用技術 |
| -- | -------- |
| UI | Next.js 16, React 19, Tailwind CSS v4, Framer Motion |
| データ | Supabase（Postgres + RLS）、段階的クライアント永続化 |
| 決済 | Stripe |
| AI | DeepSeek Chat API |
| レート制限 | Upstash Redis（本番の標準構成で利用） |
| メール | Resend（設定時） |

## コントリビューションとセキュリティ

ポリシーが許す範囲で Issue / PR を歓迎します。詳細は **[CONTRIBUTING.md](CONTRIBUTING.md)**。脆弱性は **[SECURITY.md](SECURITY.md)** に従い、公開 Issue への投稿は避けてください。

---

Copyright © 2026 Frank. All rights reserved. See [LICENSE](LICENSE).
