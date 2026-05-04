# go-daily

> 매일 한 문제의 사활 연습 — DeepSeek 스트리밍 AI 코치와 (**中 / EN / 日 / 한**).

**Languages:** [English](README.md) · [中文](README.zh.md) · [日本語](README.ja.md) · 한국어 (이 페이지)

[![CI](https://github.com/frank99-owl/go-daily/actions/workflows/ci.yml/badge.svg)](https://github.com/frank99-owl/go-daily/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)
![Stripe](https://img.shields.io/badge/Stripe-payments-626cd9?logo=stripe)

## 개요

**go-daily**는 매일 하나의 사활 문제에 집중하는 **습관형** 바둑 학습 플랫폼입니다. **중·영·일·한** 네 로케일 전체 UX와, **`coachPrompt.ts`**로 각 문제의 해설·국면을 근거로 응답을 묶는 **DeepSeek 스트리밍 AI 코치**(페르소나·쿼터)를 제공합니다.

기술적으로는 **Next.js 16(App Router)** 위에 **Supabase**(인증·Postgres·RLS)와 **Stripe**(구독)를 얹고, `lib/`를 **9개 도메인**으로 나누어 확장 시에도 경계가 흐려지지 않도록 했습니다.

## 한눈에 보기

| 영역          | 설명                                                             |
| ------------- | ---------------------------------------------------------------- |
| **일일 연습** | 큐레이션된 문제, 몰입형 플로우, 키보드 접근 가능한 바둑판        |
| **AI 코치**   | 스트리밍 Coach API, 쿼터·페르소나, 퍼즐별 적격 여부              |
| **글로벌**    | 로케일 접두 경로, 퍼즐 코퍼스와 함께 커지는 sitemap, 지역별 가격 |
| **운영**      | API·DB 문서화, CI(포맷·lint·검증·타입체크·테스트·빌드)           |

## 문서

공식 기술·제품 문서는 `docs/`의 **8개 기둥 × 4개 언어**입니다. 시작은 **[문서 허브](docs/README.md)**에서 로케일을 고르세요 (`en` / `zh` / `ja` / `ko`).

| 필요한 정보             | 한국어                                            |
| ----------------------- | ------------------------------------------------- |
| 비전·단계               | [프로젝트 철학](docs/ko/CONCEPT.md)               |
| 요청 흐름·`lib/`·보안   | [아키텍처](docs/ko/ARCHITECTURE.md)               |
| SRS·자격·구독·코치 규칙 | [제품 사양](docs/ko/PRODUCT_SPECS.md)             |
| 배포·환경·테스트        | [운영 및 QA](docs/ko/OPERATIONS_QA.md)            |
| 준비 상태 추적          | [프로젝트 상태](docs/ko/PROJECT_STATUS.md)        |
| HTTP API                | [API 레퍼런스](docs/ko/API_REFERENCE.md)          |
| 스키마·RLS              | [데이터베이스 스키마](docs/ko/DATABASE_SCHEMA.md) |
| 컴플라이언스            | [법무](docs/ko/LEGAL_COMPLIANCE.md)               |

**또 보기:** [CHANGELOG](CHANGELOG.md) · [SECURITY](SECURITY.md) · [Contributing](CONTRIBUTING.md) / [中文](CONTRIBUTING.zh.md) · [LICENSE](LICENSE)

## 빠른 시작

### 전제

- Node.js **22.5+**(`package.json`의 `engines`)
- DeepSeek 또는 OpenAI 호환 API 키
- Supabase 프로젝트(선택, 익명 모드는 생략 가능)

### 실행

```bash
git clone https://github.com/frank99-owl/go-daily.git
cd go-daily
cp .env.example .env.local
npm install
npm run dev
```

`http://localhost:3000`에서 `/{zh|en|ja|ko}/...`로 리다이렉트됩니다.

## 기술 스택

| 계층      | 선택                                                 |
| --------- | ---------------------------------------------------- |
| UI        | Next.js 16, React 19, Tailwind CSS v4, Framer Motion |
| 데이터    | Supabase(Postgres + RLS), 계층형 클라이언트 저장소   |
| 결제      | Stripe                                               |
| AI        | DeepSeek Chat API                                    |
| 속도 제한 | Upstash Redis(프로덕션 표준 구성)                    |
| 메일      | Resend(설정 시)                                      |

## 기여와 보안

정책이 허용하는 범위에서 Issue·PR을 환영합니다. 자세한 내용은 **[CONTRIBUTING.md](CONTRIBUTING.md)**를 참고하세요. 취약점은 **[SECURITY.md](SECURITY.md)** 절차를 따르고, 공개 Issue로 보고하지 마세요.

---

Copyright © 2026 Frank. All rights reserved. See [LICENSE](LICENSE).
