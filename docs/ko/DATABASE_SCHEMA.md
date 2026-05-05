# 데이터베이스 스키마 레퍼런스

이 문서는 go-daily의 Supabase(Postgres) 스키마를 설명합니다. `supabase/migrations/` 디렉터리의 마이그레이션 파일을 기반으로 작성되었습니다.

---

## 테이블

### 1. `profiles`

사용자 프로필. 회원가입 시 `handle_new_user()` 트리거에 의해 자동 생성됩니다.

| 컬럼                       | 타입          | 제약 조건                                                                                                          | 설명                             |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `user_id`                  | `uuid`        | PK, FK → `auth.users(id)` ON DELETE CASCADE                                                                        | Supabase Auth 사용자 ID          |
| `locale`                   | `text`        | NOT NULL, DEFAULT `'en'`, CHECK IN (`zh`,`en`,`ja`,`ko`)                                                           | 선호 언어                        |
| `timezone`                 | `text`        | NOT NULL, DEFAULT `'UTC'`                                                                                          | 날짜 계산에 사용하는 IANA 타임존 |
| `kyu_rank`                 | `integer`     | nullable                                                                                                           | 사용자 자기 보고 바둑 급수       |
| `display_name`             | `text`        | nullable                                                                                                           | 공개 표시 이름                   |
| `email_opt_out`            | `boolean`     | NOT NULL, DEFAULT `false`                                                                                          | 전체 이메일 수신 거부 여부       |
| `deleted_at`               | `timestamptz` | nullable                                                                                                           | 소프트 삭제 시각                 |
| `welcome_email_sent_at`    | `timestamptz` | nullable                                                                                                           | 환영 이메일 발송 시각            |
| `daily_email_last_sent_on` | `date`        | nullable                                                                                                           | 마지막 일일 퍼즐 이메일 발송일   |
| `email_unsubscribe_token`  | `text`        | NOT NULL, DEFAULT `replace(gen_random_uuid()::text, '-', '')`, UNIQUE INDEX `profiles_email_unsubscribe_token_idx` | 원클릭 수신 거부 토큰            |
| `created_at`               | `timestamptz` | NOT NULL, DEFAULT `now()`                                                                                          | —                                |
| `updated_at`               | `timestamptz` | NOT NULL, DEFAULT `now()`                                                                                          | —                                |

**RLS**: 사용자는 자신의 행만 읽고 쓸 수 있습니다(`auth.uid() = user_id`).

**트리거**: `handle_new_user()`는 `auth.users`에 INSERT가 발생한 후 실행되며, `raw_user_meta_data`에서 locale과 timezone을 가져와 프로필을 생성합니다.

---

### 2. `attempts`

퍼즐 풀이 기록 전용 테이블(append-only). `types/index.ts`의 `AttemptRecord`을 반영합니다.

| 컬럼                  | 타입          | 제약 조건                       | 설명                                         |
| --------------------- | ------------- | ------------------------------- | -------------------------------------------- |
| `id`                  | `bigserial`   | PK                              | 자동 증가 ID                                 |
| `user_id`             | `uuid`        | NOT NULL, FK → `auth.users(id)` | 소유자                                       |
| `puzzle_id`           | `text`        | NOT NULL                        | 퍼즐 식별자                                  |
| `date`                | `text`        | NOT NULL                        | 클라이언트 기준 현지 YYYY-MM-DD              |
| `user_move_x`         | `integer`     | nullable                        | 사용자 수의 X 좌표                           |
| `user_move_y`         | `integer`     | nullable                        | 사용자 수의 Y 좌표                           |
| `correct`             | `boolean`     | NOT NULL                        | 정답 여부                                    |
| `duration_ms`         | `integer`     | nullable                        | 소요 시간(선택 사항)                         |
| `client_solved_at_ms` | `bigint`      | NOT NULL                        | 풀이 완료 시각(클라이언트 측, 에포크 밀리초) |
| `created_at`          | `timestamptz` | NOT NULL, DEFAULT `now()`       | —                                            |

**제약 조건**: `UNIQUE (user_id, puzzle_id, client_solved_at_ms)` — 전역 중복 방지 키.

**인덱스**:

- `attempts_user_time_idx`: `(user_id, client_solved_at_ms DESC)`
- `attempts_user_puzzle_idx`: `(user_id, puzzle_id)`
- `attempts_user_date_idx`: `(user_id, date)`

**RLS**: 사용자는 자신의 행에 대해 SELECT와 INSERT만 가능합니다. UPDATE/DELETE는 지원하지 않습니다(append-only).

---

### 3. `coach_usage`

사용자별 일일 AI 코치 사용량 카운터.

| 컬럼      | 타입      | 제약 조건                       | 설명                           |
| --------- | --------- | ------------------------------- | ------------------------------ |
| `user_id` | `uuid`    | NOT NULL, FK → `auth.users(id)` | 소유자                         |
| `day`     | `date`    | NOT NULL                        | 사용자 타임존 기준 캘린더 일자 |
| `count`   | `integer` | NOT NULL, DEFAULT `0`           | 해당 일자의 코치 메시지 수     |

**PK**: `(user_id, day)`

**RLS**: 사용자는 자신의 행만 SELECT할 수 있습니다.

**쓰기**: `service_role`만. Postgres RPC `increment_coach_usage(p_user_id uuid, p_day text)`(마이그레이션 `0007_atomic_coach_usage_increment.sql`)로 일일 카운터를 원자적으로 증가(`lib/coach/coachState.ts` → `incrementCoachUsage`).

---

### 4. `subscriptions`

Stripe 구독 상태. 웹훅 핸들러에 의해서만 기록됩니다.

| 컬럼                     | 타입          | 제약 조건                 | 설명                                             |
| ------------------------ | ------------- | ------------------------- | ------------------------------------------------ |
| `user_id`                | `uuid`        | PK, FK → `auth.users(id)` | 소유자                                           |
| `stripe_customer_id`     | `text`        | NOT NULL                  | Stripe 고객 ID                                   |
| `stripe_subscription_id` | `text`        | NOT NULL                  | Stripe 구독 ID                                   |
| `plan`                   | `text`        | NOT NULL                  | 플랜 식별자(예: `pro_monthly`)                   |
| `status`                 | `text`        | NOT NULL                  | Stripe 상태(`active`, `trialing`, `canceled` 등) |
| `current_period_end`     | `timestamptz` | nullable                  | 현재 결제 기간 종료 시각                         |
| `cancel_at_period_end`   | `boolean`     | NOT NULL, DEFAULT `false` | 기간 종료 시 예약된 해지 여부                    |
| `trial_end`              | `timestamptz` | nullable                  | 체험 기간 종료 시각                              |
| `first_paid_at`          | `timestamptz` | nullable                  | 최초 결제 성공 시각                              |
| `coach_anchor_day`       | `integer`     | CHECK (1–31)              | 코치 할당량 기산일(결제 주기 앵커)               |
| `updated_at`             | `timestamptz` | NOT NULL, DEFAULT `now()` | —                                                |

**인덱스**: `subscriptions_customer_idx`: `(stripe_customer_id)`

**RLS**: 사용자는 자신의 행만 SELECT할 수 있습니다. 쓰기는 `service_role`을 통해서만 가능합니다.

---

### 5. `srs_cards`

사용자-퍼즐별 간격 반복 학습 일정.

| 컬럼               | 타입          | 제약 조건                        | 설명                       |
| ------------------ | ------------- | -------------------------------- | -------------------------- |
| `user_id`          | `uuid`        | NOT NULL, FK → `auth.users(id)`  | 소유자                     |
| `puzzle_id`        | `text`        | NOT NULL                         | 퍼즐 식별자                |
| `ease_factor`      | `numeric`     | NOT NULL, DEFAULT `2.5`          | SM-2 용이성 계수(최소 1.3) |
| `interval_days`    | `integer`     | NOT NULL, DEFAULT `0`            | 다음 복습까지 남은 일수    |
| `due_date`         | `date`        | NOT NULL, DEFAULT `current_date` | 다음 복습 예정일           |
| `last_reviewed_at` | `timestamptz` | nullable                         | 마지막 복습 시각           |

**PK**: `(user_id, puzzle_id)`

**인덱스**: `srs_due_idx`: `(user_id, due_date)`

**RLS**: 소유자에 대한 전체 CRUD 허용(`auth.uid() = user_id`).

---

### 6. `stripe_events`

웹훅 멱등성 관리 테이블. 이벤트 중복 처리를 방지합니다.

| 컬럼                    | 타입          | 제약 조건                 | 설명                             |
| ----------------------- | ------------- | ------------------------- | -------------------------------- |
| `id`                    | `text`        | PK                        | Stripe 이벤트 ID(`evt_...`)      |
| `event_type`            | `text`        | NOT NULL                  | Stripe 이벤트 타입 문자열        |
| `received_at`           | `timestamptz` | NOT NULL, DEFAULT `now()` | 이벤트 최초 수신 시각            |
| `processed_at`          | `timestamptz` | nullable                  | 처리 완료 시각                   |
| `processing_started_at` | `timestamptz` | nullable                  | 처리 시작 시각(오래된 락 감지용) |
| `last_error`            | `text`        | nullable                  | 처리 실패 시 오류 메시지         |

**인덱스**: `stripe_events_processing_idx`: `(processed_at, processing_started_at)`

**RLS**: 외부 접근 불가(`FOR SELECT USING (false)`). 모든 작업은 `service_role`을 통해서만 수행됩니다.

---

### 7. `user_devices`

권한 기반 기기석 제한을 위한 기기 등록 테이블입니다(Free: 1대, Pro: 3대; 수동 부여는 서버에서 Pro로 해석).

| 컬럼         | 타입          | 제약 조건                       | 설명                          |
| ------------ | ------------- | ------------------------------- | ----------------------------- |
| `user_id`    | `uuid`        | NOT NULL, FK → `auth.users(id)` | 소유자                        |
| `device_id`  | `text`        | NOT NULL                        | 클라이언트 생성 기기 지문     |
| `first_seen` | `timestamptz` | NOT NULL, DEFAULT `now()`       | 해당 기기 최초 로그인 시각    |
| `last_seen`  | `timestamptz` | NOT NULL, DEFAULT `now()`       | 최근 활동 시각                |
| `user_agent` | `text`        | nullable                        | 브라우저 유저 에이전트 문자열 |

**PK**: `(user_id, device_id)`

**인덱스**: `user_devices_last_seen_idx`: `(user_id, last_seen DESC)`

**RLS**: 소유자에 대한 전체 CRUD 허용.

---

### 8. `guest_coach_usage`

게스트 기기 ID와 달력 일자별 익명 AI 코치 사용량(재배포 후에도 유지).

| 컬럼         | 타입          | 제약 조건                 | 설명                          |
| ------------ | ------------- | ------------------------- | ----------------------------- |
| `device_id`  | `text`        | NOT NULL, 복합 PK 일부    | 클라이언트 게스트 기기 지문   |
| `day`        | `text`        | NOT NULL, 복합 PK 일부    | ISO `YYYY-MM-DD`(UTC)         |
| `count`      | `integer`     | NOT NULL, DEFAULT `0`     | 해당 기기/일의 코치 메시지 수 |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | —                             |

**PK**: `(device_id, day)`

**RLS**: 활성화되어 있으나 **정책 없음** —— `service_role`만 (`lib/coach/guestCoachUsage.ts`).

**쓰기**: 동일 마이그레이션의 RPC `increment_guest_coach_usage(p_device_id text, p_day text)`로 원자적 증가(`guestCoachUsage.ts`의 `incrementGuestUsage`).

---

### 9. `manual_grants`

Stripe 없이 이메일로 Pro를 부여하기 위한 관리자 테이블.

| 컬럼         | 타입          | 제약 조건                   | 설명                   |
| ------------ | ------------- | --------------------------- | ---------------------- |
| `email`      | `text`        | PK                          | 부여 대상 이메일       |
| `expires_at` | `timestamptz` | NOT NULL                    | 부여 만료 시각         |
| `granted_by` | `text`        | NOT NULL, DEFAULT `'admin'` | 감사용 라벨(발급 주체) |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()`   | —                      |

**RLS**: 활성화되어 있으나 **정책 없음** —— 읽기/쓰기는 신뢰 서버 라우트에서만 `service_role`로 수행(`app/api/admin/grants`, 자격 해석).

---

## RLS 요약

| 테이블              | 정책                         | 접근 권한                               |
| ------------------- | ---------------------------- | --------------------------------------- |
| `profiles`          | `own profile`                | 전체 CRUD(본인 행만)                    |
| `attempts`          | `own attempts select/insert` | SELECT + INSERT(본인 행만, append-only) |
| `coach_usage`       | `own usage select`           | SELECT만(service_role을 통한 쓰기)      |
| `subscriptions`     | `own subs select`            | SELECT만(service_role을 통한 쓰기)      |
| `srs_cards`         | `own srs`                    | 전체 CRUD(본인 행만)                    |
| `stripe_events`     | `no public stripe events`    | 외부 접근 불가(service_role 전용)       |
| `user_devices`      | `own devices`                | 전체 CRUD(본인 행만)                    |
| `guest_coach_usage` | (없음)                       | 클라이언트 접근 불가(service_role 전용) |
| `manual_grants`     | (없음)                       | 클라이언트 접근 불가(service_role 전용) |

---

## Postgres 함수(RPC)

| 함수                                                        | 역할                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `increment_coach_usage(p_user_id uuid, p_day text)`         | `coach_usage`의 `(user_id, day)`에 대해 `INSERT … ON CONFLICT DO UPDATE`, 새 `count` 반환. |
| `increment_guest_coach_usage(p_device_id text, p_day text)` | `guest_coach_usage`에 동일 패턴.                                                           |

동시 코치 요청에서 읽기-수정-쓰기 경쟁을 제거합니다.

---

## 확장 모듈

- `pgcrypto` — `email_unsubscribe_token` 기본값에 사용되는 `gen_random_uuid()` 함수를 제공합니다.
