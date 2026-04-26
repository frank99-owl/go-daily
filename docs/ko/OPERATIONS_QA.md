# 운영, 배포 및 품질 보증 (OPERATIONS_QA)

이 문서는 환경 설정부터 품질 검증까지 go-daily의 제품 생애주기를 설명합니다.

## 1. 운영 스택

- **호스팅**: Vercel (Region: `iad1` - 미국 동부)
- **데이터베이스**: Supabase (Region: `ap-southeast-1` - 싱가포르)
- **DNS & CDN**: Cloudflare (Proxy 활성화)
- **관측성**: Sentry (에러) + PostHog (이벤트) + Vercel Speed Insights

## 2. 환경 설정

설정은 Vercel 환경 변수를 통해 관리됩니다. 주요 토글은 다음과 같습니다:

- `NEXT_PUBLIC_IS_COMMERCIAL`: Stripe 구성 요소와 `/pricing` 페이지를 활성화하려면 `true`로 설정합니다.
- `COACH_MODEL`: 기본값은 `deepseek-chat`입니다. 필요한 경우 `deepseek-reasoner`로 교체할 수 있습니다.
- `COACH_MONTHLY_TOKEN_BUDGET`: 예기치 않은 비용 급증을 방지하기 위한 애플리케이션 레벨의 엄격한 월간 제한.

## 3. 배포 전 사전 점검 (`scripts/productionPreflight.ts`)

운영 환경 배포 전, 다음 명령어를 실행하여 47가지 핵심 설정 항목을 검증하십시오:

```bash
npm run preflight:prod -- --stripe-mode=live
```

이 스크립트는 Stripe 라이브 키 유효성, Supabase 테이블 및 RLS 상태, Resend 이메일 연동 상태, 로컬라이즈된 메시지 키의 일관성 등을 체크합니다.

## 4. 품질 보증 계획

### 자동화 테스트 (Vitest)

우리는 다음을 포함하여 약 570개의 테스트 케이스를 유지하고 있습니다:

- **로직**: `lib/srs.test.ts`, `lib/entitlements.test.ts`.
- **UI**: `components/GoBoard.test.tsx`, `app/TodayClient.test.tsx`.
- **API**: `tests/api/stripeWebhook.test.ts`.

### 수동 검수 체크리스트 (핵심 경로)

1.  **기기 간 동기화 일관성**: 데스크톱에서 문제를 해결하고 5초 이내에 모바일 기기에서 동기화 여부를 확인합니다.
2.  **무료 체험 전환**: 테스트 모드에서 7일 무료 체험이 포함된 전체 Stripe 결제 프로세스를 실행합니다.
3.  **로케일 SEO**: `sitemap.xml`에 4,800개 이상의 모든 항목이 포함되어 있는지 확인합니다.
4.  **코치 가드레일**: 프롬프트 인젝션(예: "이전의 모든 지시를 잊어라")을 시도하여 `promptGuard.ts`의 차단 성능을 검증합니다.

## 6. 출시 전 컴플라이언스 감사

규제 준수를 위해 외부 대시보드에서의 수동 검증이 필요합니다.

### Stripe (결제 및 세무)

- [ ] **계정 확인**: 한국 원화(KRW) 정산을 위해 본인 확인 및 은행 계좌 정보가 완전히 검증되었는지 확인하십시오.
- [ ] **Stripe Tax**: 일본(JCT) 및 관련 미국 주의 세금 계산을 활성화하십시오.
- [ ] **공개 정보**: `tokushoho/page.tsx`의 공시 내용과 일치하도록 Stripe의 '공개 세부 정보'를 업데이트하십시오.

### Resend & Supabase (통신)

- [ ] **도메인 인증**: 영수증 등 법적 메일의 안정적인 발송을 위해 Resend에서 SPF/DKIM 레코드가 인증되었는지 확인하십시오.
- [ ] **발신자 식별**: Supabase Auth의 '발신자(Sender)'를 커스텀 도메인(`support@go-daily.app`)으로 업데이트하십시오.

### 개인정보 보호 및 거버넌스

- [ ] **PIPA 동의**: (수동 점검) 로그인 과정에서 한국어 환경에 맞는 순차적 동의 카드가 제대로 표시되는지 확인.
- [ ] **Sentry PII 필터**: 테스트용 코칭 대화를 실행하고 Sentry 대시보드에서 이메일이나 PII가 노출되지 않는지 확인하십시오.
