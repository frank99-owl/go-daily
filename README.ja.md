# go-daily

> 囲碁の詰碁問題を毎日一問 — ソクラテス式 AI コーチと共に（**中 / EN / 日 / 한**）。

[English →](README.md) | [中文 →](README.zh.md) | [한국어 →](README.ko.md)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)
![Stripe](https://img.shields.io/badge/Stripe-payments-626cd9?logo=stripe)

**go-daily** は、シンプルかつ習慣化に特化した囲碁（Go / 囲碁 / 바둑）学習プラットフォームです。毎日一問の急所を攻略し、ソクラテス式の AI コーチが答えを教えるのではなく、思考のプロセスをガイドします。

---

## 📚 ドキュメントガイド

エンジニアリングの卓越性と戦略的な明快さを維持するため、ドキュメントは以下の主要な論理軸に基づいて構成されています。

### 🎯 [製品と戦略](docs/CONCEPT.md) (英語)

- **[戦略的ビジョン](docs/CONCEPT.md)**: なぜ go-daily なのか？市場ポジショニングと商用哲学。
- **[ロードマップ](docs/CONCEPT.md)**: MVP からグローバル製品へのマイルストーン。
- **[コンテンツ管理](docs/CONCEPT.md)**: 問題のキュレーションと AI コーチの「根拠データ」の管理。

### 🧱 [アーキテクチャと設計](docs/ARCHITECTURE.md) (英語)

- **[システム設計](docs/ARCHITECTURE.md)**: 高度な技術アーキテクチャとデータフロー。
- **[データベース設計](docs/ARCHITECTURE.md)**: Postgres テーブル、RLS セキュリティポリシー、同期ロジック。
- **[プロジェクト構成](docs/ARCHITECTURE.md)**: ディレクトリ構造とモジュール分割の規範。

### 🛡️ [運用と品質](docs/OPERATIONS_QA.md) (英語)

- **[デプロイガイド](docs/OPERATIONS_QA.md)**: 本番環境のインフラ設定 (Vercel, Supabase, Stripe)。
- **[チェックリスト](docs/OPERATIONS_QA.md)**: リリース前に実行すべき 47項目の確認事項。
- **[製品仕様](docs/PRODUCT_SPECS.md)**: SRS アルゴリズム、サブスクリプション権限エンジン、決済の冪等性。

---

## 🚀 クイックスタート

### 1. 前提条件

- Node.js 20+
- DeepSeek または OpenAI 互換の API キー。
- Supabase プロジェクト（オプション、匿名モードでは不要）。

### 2. インストール

```bash
git clone https://github.com/frank99-owl/go-daily.git
cd go-daily
cp .env.example .env.local
npm install
```

### 3. ローカル実行

```bash
npm run dev
```

`http://localhost:3000` を開きます。ミドルウェアがブラウザの設定に合わせて最適な言語（`/ja` など）にリダイレクトします。

---

## 🛠️ 技術スタック

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Framer Motion.
- **Backend**: Supabase (Auth/Postgres), Upstash (Redis によるレート制限).
- **AI**: DeepSeek Chat API.
- **Business**: Stripe アダプティブプライシング, Resend メールシステム.

---

(C) 2026 Frank. MIT ライセンス。
