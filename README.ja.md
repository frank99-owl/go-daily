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

日本のユーザーや開発者向けに、核心的なロジックを日本語で詳しく解説しています。

1.  **[プロジェクト理念と戦略](docs/ja/CONCEPT.md)**：なぜ go-daily なのか？市場ポジショニング、商用哲学、そして「リーン」な運用について。
2.  **[技術アーキテクチャ詳細](docs/ja/ARCHITECTURE.md)**：`proxy.ts` のリクエストライフサイクル、三段階の永続化エンジン、6ドメイン分離のリファクタリングを深く理解する。
3.  **[製品仕様と機能ロジック](docs/ja/PRODUCT_SPECS.md)**：SM-2 アルゴリズムのパラメータマッピング、サブスクリプション権限エンジン、AI コーチの有効性判定ロジックの詳細。
4.  **[運用と品質保証](docs/ja/OPERATIONS_QA.md)**：本番環境デプロイガイド、47項目のリリース前チェックリスト、および 570 以上のテストスイート戦略。
5.  **[リアルタイム看板](docs/en/PROJECT_STATUS.md)** (英語)：現在のスプリント進捗と本番環境の準備状況を確認する。

---

## 🚀 クイックスタート

### 1. 前提条件
*   Node.js 20+
*   DeepSeek または OpenAI 互換の API キー。
*   Supabase プロジェクト（オプション、匿名モードでは不要）。

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
`http://localhost:3000` を開きます。ミドルウェアがブラウザの設定に合わせて最適な言語にリダイレクトします。

---

## 🛠️ 技術スタック
*   **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Framer Motion.
*   **Backend**: Supabase (Auth/Postgres), Upstash (Redis によるレート制限).
*   **AI**: DeepSeek Chat API.
*   **Business**: Stripe アダプティブプライシング, Resend メールシステム.

---

(C) 2026 Frank. MIT ライセンス。
