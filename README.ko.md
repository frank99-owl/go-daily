# go-daily

> 매일 한 문제의 사활 연습 — 소크라테스식 AI 코치와 함께 (**中 / EN / 日 / 한**).

[English →](README.md) | [中文 →](README.zh.md) | [日本語 →](README.ja.md)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)
![Stripe](https://img.shields.io/badge/Stripe-payments-626cd9?logo=stripe)

**go-daily**는 심플하고 습관 형성에 최적화된 바둑(Go / 囲碁 / 바둑) 학습 플랫폼입니다. 매일 한 문제의 급소를 공략하고, 소크라테스식 AI 코치가 정답을 알려주는 대신 사고의 과정을 가이드합니다.

---

## 📚 문서 가이드

엔지니어링의 우수성과 전략적 명확성을 유지하기 위해 문서는 다음과 같은 핵심 논리축에 따라 구성되어 있습니다.

### 🎯 [제품 및 전략](docs/CONCEPT.md) (영어)

- **[전략적 비전](docs/CONCEPT.md)**: 왜 go-daily인가? 시장 포지셔닝과 상업적 철학.
- **[로드맵](docs/CONCEPT.md)**: MVP에서 글로벌 제품으로의 마일스톤.
- **[콘텐츠 관리](docs/CONCEPT.md)**: 문제 큐레이션 및 AI 코치의 "근거 데이터" 관리.

### 🧱 [아키텍처 및 설계](docs/ARCHITECTURE.md) (영어)

- **[시스템 설계](docs/ARCHITECTURE.md)**: 상위 기술 아키텍처와 데이터 흐름.
- **[데이터베이스 설계](docs/ARCHITECTURE.md)**: Postgres 테이블, RLS 보안 정책, 동기화 로직.
- **[프로젝트 구성](docs/ARCHITECTURE.md)**: 디렉토리 구조와 모듈 분할 규범.

### 🛡️ [운영 및 품질](docs/OPERATIONS_QA.md) (영어)

- **[배포 가이드](docs/OPERATIONS_QA.md)**: 운영 환경 인프라 설정 (Vercel, Supabase, Stripe).
- **[체크리스트](docs/OPERATIONS_QA.md)**: 배포 전 실행해야 할 47가지 확인 사항.
- **[제품 사양](docs/PRODUCT_SPECS.md)**: SRS 알고리즘, 구독 권한 엔진, 결제 멱등성.

---

## 🚀 빠른 시작

### 1. 전제 조건

- Node.js 20+
- DeepSeek 또는 OpenAI 호환 API 키.
- Supabase 프로젝트 (옵션, 익명 모드에서는 불필요).

### 2. 설치

```bash
git clone https://github.com/frank99-owl/go-daily.git
cd go-daily
cp .env.example .env.local
npm install
```

### 3. 로컬 실행

```bash
npm run dev
```

`http://localhost:3000`을 엽니다. 미들웨어가 브라우저 설정에 맞춰 최적의 언어(`/ko` 등)로 리다이렉트합니다.

---

## 🛠️ 기술 스택

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Framer Motion.
- **Backend**: Supabase (Auth/Postgres), Upstash (Redis를 통한 속도 제한).
- **AI**: DeepSeek Chat API.
- **Business**: Stripe 어댑티브 프라이싱, Resend 이메일 시스템.

---

(C) 2026 Frank. MIT 라이선스.
