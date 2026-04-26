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

한국의 사용자 및 개발자를 위해 핵심 로직을 한국어로 상세히 설명합니다.

1.  **[프로젝트 철학 및 전략](docs/ko/CONCEPT.md)**: 왜 go-daily인가? 시장 포지셔닝, 상업적 철학 및 "린(Lean)" 운영에 대하여.
2.  **[기술 아키텍처 상세 분석](docs/ko/ARCHITECTURE.md)**: `proxy.ts` 요청 생명주기, 3단계 영속성 엔진 및 6개 도메인 분리 리팩토링의 심층 이해.
3.  **[제품 사양 및 기능 로직](docs/ko/PRODUCT_SPECS.md)**: SM-2 알고리즘 파라미터 매핑, 구독 권한 엔진 및 AI 코치 자격 판정 로직 상세 설명.
4.  **[운영 및 품질 보증](docs/ko/OPERATIONS_QA.md)**: 운영 환경 배포 가이드, 47가지 배포 전 사전 점검 리스트 및 570개 이상의 테스트 스위트 전략.
5.  **[실시간 프로젝트 간판](docs/en/PROJECT_STATUS.md)** (영어): 현재 스프린트 진행 상황 및 운영 환경 준비 상태 확인.

---

## 🚀 빠른 시작

### 1. 전제 조건
*   Node.js 20+
*   DeepSeek 또는 OpenAI 호환 API 키.
*   Supabase 프로젝트 (옵션, 익명 모드에서는 불필요).

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
`http://localhost:3000`을 엽니다. 미들웨어가 브라우저 설정에 맞춰 최적의 언어로 리다이렉트합니다.

---

## 🛠️ 기술 스택
*   **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Framer Motion.
*   **Backend**: Supabase (Auth/Postgres), Upstash (Redis를 통한 속도 제한).
*   **AI**: DeepSeek Chat API.
*   **Business**: Stripe 어댑티브 프라이싱, Resend 이메일 시스템.

---

(C) 2026 Frank. MIT 라이선스.
