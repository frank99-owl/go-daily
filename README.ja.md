# go-daily

> 毎日1問のGo（囲碁）パズル — **中 / EN / 日 / 한** のソクラテス式AIコーチ付き。

[English →](README.md) | [中文 →](README.zh.md) | [한국어 →](README.ko.md)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06b6d4?logo=tailwindcss)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)

[Frank](https://github.com/frank99-owl) の小さなプロジェクト：毎日1問のGo（囲碁 / 围棋 / 바둑）問題を出題。急所をタップし、行き詰まったらAIがソクラテスのように導いてくれます — 答えを丸投げするのではなく、問いかけながら教えてくれます。

### プランニング & エージェントコンテキスト

- **[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)** — **現在のフェーズ**、完了状況、注意点の一元管理（大きな変更の際はまずここを読んでください）。
- **[`docs/phase2-next-steps.md`](docs/phase2-next-steps.md)** — 次のフェーズ：Stripe、権限管理、ペイウォール。
- **[`AGENTS.md`](AGENTS.md)** — AIコーディングエージェント用の短いガイド。

## 機能

- **デイリーパズル** — カレンダー日ごとに1問、ローカルライブラリからローテーション
- **Canvas碁盤** — レスポンシブ対応 9x9 / 13x13 / 19x19、ホバーゴースト石、HiDPI対応で鮮明表示
- **4言語UI** — 中国語 / 英語 / 日本語 / 韓国語、URLベースのルーティング（`/zh/...`、`/en/...`）；デフォルトロケールは英語
- **ソクラテス式オンデマンドコーチ** — コーチは頼んだ時だけ話す；正解ノートに基づくため幻覚を起こさない
- **ライブラリ + 復習** — 5段階の難易度で1,110問以上、ブラウズ可能なライブラリと間違えた問題専用の復習モード
- **連勝 + 履歴** — 連続正解日数、正解率、問題ごとの記録（匿名時はlocalStorage、ログイン時はSupabase）
- **シェアカード** — 本日の盤面 + 結果の1080x1080 PNG、ワンタップダウンロードまたはWeb Share
- **認証 + クロスデバイス同期** — Supabase OAuth（Googleなど）、自動的に解答履歴を同期
- **ペイウォールとサブスクリプション** — Stripe Checkout/Portal の統合、無料プランのデバイスとクォータ制限、Pro 権限の配線を実装
- **間隔反復 (SRS)** — Pro ユーザーは復習モードで SM-2 間隔反復スケジューリングを利用可能
- **メールシステム** — Resend を使用したトランザクションメール（ウェルカム、支払い失敗）と日々のクロンメール

## 技術スタック

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack) + React 19                   |
| Language   | TypeScript strict                                               |
| Styling    | Tailwind CSS v4 (`@theme`)                                      |
| Motion     | Framer Motion 12                                                |
| Icons      | lucide-react                                                    |
| LLM        | DeepSeek `deepseek-chat` via OpenAI互換SDK                      |
| Board      | Canvas 2D、約200行、Goライブラリ不使用                          |
| Auth + DB  | Supabase (Auth + Postgres + RLS)                                |
| Analytics  | PostHog (プロダクト分析)                                        |
| Monitoring | Sentry (エラー追跡) + Vercel Analytics + Speed Insights         |
| Emails     | Resend (トランザクション & クロンメール)                        |
| Storage    | localStorage (匿名) / Supabase (ログイン済み) + IndexedDBキュー |

## プロジェクト構成

```
app/
  [locale]/               # URLベースi18n: /zh/、/en/、/ja/、/ko/
    today/                # デイリーパズル
    puzzles/              # ライブラリ一覧 + [id] 詳細
    result/               # 判定、解答表示、コーチ、シェアカード
    review/               # 誤答復習
    stats/                # 連勝 / 正解率 / 履歴
    about/                # プロジェクト紹介ページ（旧開発者ページ）
  api/
    coach/route.ts        # LLMプロキシ (8KB上限、10 req/min/IP)
    report-error/route.ts # クライアントエラー報告エンドポイント
  auth/callback/route.ts  # OAuthコールバックハンドラ
  manifest.ts             # 動的ローカライズPWAマニフェスト
  layout.tsx              # ルートレイアウト (PostHogProvider, html lang)
components/
  GoBoard                 # canvas盤面 + クリックして打つ + ホバーゴースト
  CoachDialogue           # オンデマンドチャット
  ShareCard               # オフスクリーンcanvas -> PNG / Web Share
  LocalizedLink           # ロケール対応next/linkラッパー
  Nav / LanguageToggle / PuzzleHeader
lib/
  localePath.ts           # ロケールネゴシエーション、URL接頭辞/除去ヘルパー
  metadata.ts             # generateMetadata用サーバーサイド翻訳ヘルパー
  supabase/               # client.ts / server.ts / middleware.ts / service.ts
  posthog/                # client.ts / events.ts
  syncStorage.ts          # localStorage + IndexedDBキュー + Supabase同期
  mergeOnLogin.ts         # 匿名 -> 認証データマージ計画
  deviceId.ts             # ブラウザごとUUID + UA説明
  deviceRegistry.ts       # 無料プラン単一デバイスペイウォール
  attemptKey.ts           # 解答の正規重複排除キー
  clientIp.ts             # IP抽出 (CF-Connecting-IP, X-Forwarded-For)
  board / judge / storage / puzzleOfTheDay / i18n / coachPrompt / rateLimit
content/
  puzzles.ts              # 環境認識エントリ：サーバーはフルデータ、クライアントは軽量インデックス
  puzzles.server.ts       # サーバーサイドフルデータローダー
  data/
    puzzleIndex.json      # 軽量クライアントサイドインデックス（サマリーのみ）
    classicalPuzzles.json  # パブリックドメイン問題集（自動生成）
    classicalPuzzles.json    # フルライブラリ（自動生成）
  messages/{zh,en,ja,ko}.json
  curatedPuzzles.ts       # 手書き厳選問題
types/
  index.ts                # Puzzle / AttemptRecord / CoachMessage / Locale
  schemas.ts              # zodランタイムスキーマ（API + バリデーター共有）
supabase/
  migrations/*.sql     # DBスキーマ: profiles, attempts, subscriptions, stripe_events, user_devices
```

## ローカル開発

```bash
cp .env.example .env.local
# .env.localを開き、必要なキーを入力（下記環境変数を参照）

npm install
npm run dev
```

`http://localhost:3000` を開くと、ミドルウェアがネゴシエートしたロケールにリダイレクトされます（例：`/en`）。

## 環境変数

| Name                            | Required | Default                    | Where                                                        |
| ------------------------------- | -------- | -------------------------- | ------------------------------------------------------------ |
| `DEEPSEEK_API_KEY`              | yes      | —                          | ローカルでは `.env.local` / 本番では Vercel Project Settings |
| `NEXT_PUBLIC_SITE_URL`          | no       | `https://go-daily.app`     | 正規URL、サイトマップ、robots                                |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes\*    | —                          | Supabase プロジェクトURL（認証 + データベース）              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes\*    | —                          | Supabase 公開キー（RLS付きでブラウザに安全）                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes\*    | —                          | Supabase シークレットキー（サーバーのみ、RLS無視）           |
| `NEXT_PUBLIC_POSTHOG_KEY`       | no       | —                          | PostHog プロジェクトAPIキー（書き込み専用、ブラウザに安全）  |
| `NEXT_PUBLIC_POSTHOG_HOST`      | no       | `https://us.i.posthog.com` | PostHog インジェストホスト                                   |
| `NEXT_PUBLIC_SENTRY_DSN`        | no       | —                          | Sentry DSN（書き込み専用エラーインジェスト）                 |
| `RATE_LIMIT_WINDOW_MS`          | no       | `60000` (60s)              | レート制限時間窓（ミリ秒）                                   |
| `RATE_LIMIT_MAX`                | no       | `10`                       | IPあたりの時間窓あたり最大リクエスト数                       |
| `UPSTASH_REDIS_REST_URL`        | no       | —                          | Upstash Redis URL（永続レート制限）                          |
| `UPSTASH_REDIS_REST_TOKEN`      | no       | —                          | Upstash Redis トークン                                       |
| `COACH_MODEL`                   | no       | `deepseek-chat`            | AIコーチモデル識別子（OpenAI互換）                           |
| `STRIPE_SECRET_KEY`             | no       | —                          | Stripe サーバー側シークレットキー（フェーズ2）               |
| `STRIPE_WEBHOOK_SECRET`         | no       | —                          | Stripe Webhook 署名シークレット（フェーズ2）                 |
| `STRIPE_PRO_MONTHLY_PRICE_ID`   | no       | —                          | Stripe Pro 月額 Price ID（フェーズ2）                        |
| `STRIPE_PRO_YEARLY_PRICE_ID`    | no       | —                          | Stripe Pro 年額 Price ID（フェーズ2）                        |
| `STRIPE_TRIAL_DAYS`             | no       | `7`                        | Stripe トライアル日数（フェーズ2）                           |

\*Supabase変数は認証とクラウド同期に必要。匿名専用モードではなくても動作します。

`.env*` はデフォルトでgitignore；`.env.example` のみがコミットされます。

### 本番デプロイメント注意事項

- **レート制限** はデフォルトで `MemoryRateLimiter` を使用。`UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN` が設定されると、自動的に `UpstashRateLimiter` に切り替わります。
- **モデル名** はオプションの `COACH_MODEL` 環境変数で制御（デフォルトは `deepseek-chat`）。
- **Analytics / Speed Insights** は `@vercel/analytics` と `@vercel/speed-insights` で配線済み（Vercel上でゼロコンフィグ）。
- **PostHog** と **Sentry** は設定済み。対応する環境変数を設定すると有効化されます。
- **CSPヘッダー** は本番セキュリティ用に `next.config.ts` で設定済み（フェーズ2用のStripeドメインを含む）。

## 新規問題の追加

厳選問題は `content/curatedPuzzles.ts` に手書きで記述。各エントリには以下が必要：

- `stones[]` — 開始局面（左上を原点とする0インデックス座標）
- `correct[]` — 1つ以上の正解ポイント
- `prompt` と `solutionNote` を **4言語すべて** で

一括インポートの場合、SGFファイルを `scripts/sgf/` に配置し、`npm run import:puzzles` を実行。出力は `content/data/classicalPuzzles.json` へ。

データエントリ層（`content/puzzles.ts`）は厳選問題とインポート問題を統合。サーバー上では `content/puzzles.server.ts` でフルデータをロード；クライアントでは軽量インデックス（`content/data/puzzleIndex.json`）のみを取得。

コーチは `solutionNote[locale]` を正解情報として受け取るため、注意深く書いてください — モデルはノートにない変化を発明しないよう指示されています。

## テスト

```bash
npm run test          # 544テスト、68ファイル（Vitest）
npm run test:watch    # ウォッチモード
```

## デプロイ

本番ドメイン: **go-daily.app**（Cloudflare DNS -> Vercel）。

GitHubリポジトリをVercelにインポートし、必要な環境変数を設定すると、`main` への毎回のプッシュが自動デプロイされます。

**ビルド戦略**：

- 厳選問題詳細ページ（`/puzzles/[id]`）はビルド時にSSG
- その他の問題詳細ページはISR、24時間の再検証
- 静的ページ数を約4,900から約300に削減し、ビルドを高速化

## 既知の制限事項

- **LLMはコーチであり、判定者ではありません。** DeepSeek は提供された正解ノートを読み、言い換えます — ノートにない変化を幻覚で述べることがあります。
- **アゲハマ / コウのロジックなし。** 盤面はアゲハマをシミュレートしません；問題は解答が単一の急所となるように選ばれています。
- **1タイムゾーン、1パズル。** デイリー切り替えはローカル深夜なので、タイムゾーンを跨ぐと同じ問題が表示されたり、飛ばされたりする場合があります。

---

(C) 2026 Frank.
