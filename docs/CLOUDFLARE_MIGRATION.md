# Cloudflare Workers + D1 이관

> 문서 상태: **이관 PR(`feat/cloudflare-migration`)의 기준 문서**  
> 상태 라벨: 코드 **구현됨**, 로컬 Workers 런타임(workerd)·로컬 D1에서 **로컬 검증됨**. Cloudflare 계정 배포·원격 D1·실기기 카카오톡 흐름은 **미검증**, **운영 미적용**.  
> 데이터 불변조건(소유권·원자성·멱등성·토큰)은 [DATA_INTEGRITY_AND_POSTGRES_MIGRATION.md](DATA_INTEGRITY_AND_POSTGRES_MIGRATION.md)를 그대로 따른다. 이 문서는 그 불변조건을 D1에서 어떻게 지키는지를 기록한다.

## 1. 아키텍처

| 계층 | 이전 | 이후 |
| --- | --- | --- |
| 호스팅 | Vercel | Cloudflare Workers (`@opennextjs/cloudflare` 1.20.17, `wrangler.jsonc`) |
| 프레임워크 | Next.js 16.2.2 | Next.js 16.4.6 (OpenNext 1.20.16+ 요구사항) |
| DB | Supabase Postgres + RLS + RPC | Cloudflare D1(SQLite) + `lib/server/db/repositories/*` |
| 인증 | Supabase Auth | Better Auth 1.7.4 on D1 (`drizzle-orm/d1`, DB 세션, 초대 allowlist) |
| 인가 | Postgres RLS / SECURITY DEFINER | 세션에서 얻은 `trainerId`를 모든 쿼리 WHERE에 강제 + 복합 FK `(member_id, trainer_id)` + 트리거 |
| 브라우저 DB 접근 | `@supabase/ssr` 브라우저 클라이언트 | **없음.** 읽기는 Server Component, 쓰기는 Server Action |
| 정적 파일 | Vercel CDN | Workers static assets + `public/_headers` |

요청 흐름:

```
브라우저 ─▶ Worker(OpenNext)
            ├─ middleware.ts: /app/* 세션 쿠키 유무만 확인 (D1 조회 없음, CPU 최소)
            ├─ app/app/layout.tsx + 각 page: Better Auth getSession → D1 session 테이블 검증 (실패 시 /login)
            ├─ Server Component 읽기 → lib/db-server.ts → repositories(trainerId 스코프) → env.DB
            ├─ Server Action 쓰기 → app/actions/* → lib/server/actions.ts(trainerAction) → repositories
            └─ 공개 링크 /h/[token], /report/[token] → sha256(token) 조회 (로그인 없음)
```

`vinext` 비교: Cloudflare는 신규 앱에 vinext를 권장하지만, 이 저장소는 기존 Next.js App Router 앱 유지가 목적이라 OpenNext를 쓴다. OpenNext는 `middleware.ts`(edge)만 안정 지원하고 Node 런타임 `proxy.ts`는 실험적이라 기존 `middleware.ts` 이름을 유지했다(Next 16의 폐기 예정 경고는 남는다).

## 2. Supabase → D1 매핑

### 2-1. 마이그레이션 파일 (16개 → 7개, `wrangler d1 migrations` 형식)

| 원본 (`supabase/migrations/`) | 핵심 의미 | D1 (`migrations/`) · 코드 |
| --- | --- | --- |
| `20260415000000_exercise_homework_init` | profiles·members·homework·items·logs·session_notes, RLS, `open_homework`, `log_homework`, `revoke_homework`, `toggle_pro_status`, 가입 트리거 | `0001_init`; `public-homework.openHomeworkByToken`, `homeworks.revokeHomework`, `members.ensureProfile`(Better Auth `after` 훅). **`toggle_pro_status` 의도적 삭제**(NV-2 자기 승격 경로) → 운영자 스크립트 `cf:set-plan`. `log_homework`는 원본에서 이미 권한 회수된 레거시라 미이관. `exercise_library`는 앱 미사용(시드는 `lib/seed-exercises.ts`)이라 미이관 |
| `20260416000000_voice_coach_cadence` | 동작 effort/reps/hold/cadence CHECK | `0001` `homework_items` CHECK. 백필 UPDATE는 신규 DB라 불필요 |
| `20260417000000_atomic_homework_submission` | 제출 v1 원자 처리 | 이후 v2로 대체됨 → v2 경로만 유지 |
| `20260919000000_discomfort_level_feedback` | 불편감 1~10 | `submitHomeworkByToken` 검증 + `pain` 로그 payload |
| `20260919010000_immutable_homework_submission` | 불변 제출 스냅샷 + sha256 | `0002` `homework_submissions` + `homework_submissions_immutable` 트리거, 해시는 WebCrypto |
| `20260920000000_trainer_ownership_and_atomic_homework` | 부모 소유권 with_check, `(homework_id, order_index)` 유일, `create_homework` 원자 | `0001` 복합 FK·UNIQUE; `homeworks.createHomework`(batch) |
| `20260920115204_member_onboarding_imports` | 회원 CHECK, 기존 기록, 등록 멱등 RPC 2개 | `0001` CHECK + `0003`; `members.registerMember`, `members.addImportRecord` |
| `20260921000000_member_progress_measurements` | 목표·관찰·의견 + RPC 3개 | `0004`; `member-progress.ts` |
| `20260921010000_exercise_catalog` | 검수 운동 카탈로그(TEXT[]) | `0005` (JSON 배열 TEXT) |
| `20260921074826_member_progress_correctness` | NaN/정수/actor 강제/정정 문맥 검증 | `member-progress.ts` (`measurementFailure`, 정정 검증) |
| `20260921075052_exercise_catalog_snapshots` | 게시본 불변 트리거, 스냅샷 캡처 | `0005` 트리거 3개; `homeworks.captureSnapshots` |
| `20260921171403_homework_assignment_v2` | 목적·부담·원본 숙제, requirement, 출제 멱등 | `0001` 컬럼 + `0002` `homework_assignment_requests` |
| `20260921173014_homework_submission_v2` | partial, 동작별 결과, 제출 멱등 | `0001` logs CHECK + `0002`; `submitHomeworkByToken` |
| `20260922100000_homework_public_item_requirements` | 공개 응답에 requirement | `openHomeworkByToken` |
| `20261114000000_lessons_scheduler` | lessons + EXCLUDE gist + RPC 6개 | `0006` 겹침 트리거·잔여 횟수 트리거; `lessons.ts`, `homeworks.linkHomeworkToLesson` |
| `20261114010000_milestone_reports` | 리포트 링크 + RPC 3개 | `0007` (`token_hash`만 저장); `milestone-reports.ts` (NV-1 메모 제외) |

`supabase/migrations/`와 그 PGlite 테스트(`tests/*-db.test.mjs`)는 롤백 기준·의미 참조용으로 남겼다(앱 코드는 참조하지 않음).

### 2-2. 변환 규칙

- `uuid`→`TEXT`(앱에서 `crypto.randomUUID()`), `timestamptz`→`TEXT` ISO-8601 UTC 밀리초 고정폭(`toISOString()`), `date`→`TEXT YYYY-MM-DD`, `boolean`→`INTEGER 0/1`+CHECK, `jsonb`/`TEXT[]`→`TEXT`+`json_valid` CHECK, `numeric`→`REAL`.
- 고정폭 ISO 문자열이라 사전순 = 시간순. `lessons.starts_at/ends_at`은 `length = 24 AND strftime(...) IS 값` CHECK로 형식을 강제한다(`IS`를 써야 잘못된 날짜의 NULL이 CHECK를 통과하지 못한다).
- **D1 한도**: LIKE/GLOB 패턴 50바이트, 쿼리당 바인딩 100개. 로컬 E2E에서 GLOB CHECK가 D1에서만 실패하는 버그를 발견해 고쳤고, `tests/d1-limits.test.mjs`가 정적으로 막는다. 목록은 `IN (서브쿼리)`로 바인딩 수를 고정한다.
- RLS → (1) 리포지토리 모든 쿼리에 `trainer_id = ?` (2) 하위 레코드는 복합 FK `(member_id, trainer_id) → members(id, trainer_id)` (3) 소유자 불변 트리거 (4) `INSERT … SELECT … FROM members WHERE trainer_id = ?`로 부모 소유 확인.
- `EXCLUDE USING gist` → `lessons_no_overlap_insert/update` 트리거. `ON CONFLICT DO NOTHING` 재요청이 겹침으로 오판되지 않도록 같은 (series, starts_at) 슬롯은 제외.
- plpgsql 행 잠금 + 잔여 횟수 증감 → 상태 전이 `AFTER UPDATE` 트리거(`lessons_complete_consumes_package`, `lessons_revert_restores_package`). 전이 UPDATE가 조건부 단일 문장이라 동시 중복 요청은 0행 변경 = 0회 차감.

### 2-3. RPC → 서버 함수

| RPC | 서버 함수 |
| --- | --- |
| `register_member_with_import` / `add_member_import_record` | `members.registerMember` / `members.addImportRecord` |
| `create_homework_v2` (+`create_homework`, `capture_exercise_snapshot`) | `homeworks.createHomework` |
| `revoke_homework` | `homeworks.revokeHomework` |
| `open_homework` | `publicHomework.openHomeworkByToken` |
| `submit_homework_feedback_v2` | `publicHomework.submitHomeworkByToken` |
| `create/record/get_member_progress*` | `progress.createProgressGoal` / `recordProgressObservation` / `getMemberProgress` |
| `create_lessons` 외 스케줄 RPC 5개 | `lessons.*` |
| `link_homework_to_lesson` | `homeworks.linkHomeworkToLesson` (createHomework 내부에서 호출) |
| `create/revoke/open_milestone_report` | `reports.*` |

## 3. 원자성·멱등성 (D1에 인터랙티브 트랜잭션이 없음)

패턴: **검증용 읽기 → 쓰기 전부를 `db.batch([...])` 1회**(D1 batch는 하나의 트랜잭션, 하나라도 실패하면 전부 롤백).

| 쓰기 | 배치 구성 | 경합 처리 |
| --- | --- | --- |
| 회원 등록 | members + (기존 기록) + 멱등 행 | 멱등 PK 충돌 → 재조회 후 replay. Free 한도는 `members_free_plan_limit` 트리거가 같은 INSERT 안에서 판정 |
| 숙제 출제 | homework + items(1~3) + 멱등 행 | 같은 요청 동시 재전송은 `token_hash`/멱등 키 UNIQUE에서 패배 → replay. 원본 숙제 소유는 트리거가 재확인 |
| 회원 제출 | 조건부 `INSERT … SELECT … WHERE 미회수 AND 미만료` + 동작별 결과 + 로그 2개 + 상태 + 영수증 | 회수·만료가 중간에 일어나면 첫 INSERT가 0행 → 후속 FK 실패로 전부 롤백. 동시 제출은 `UNIQUE(homework_id)`로 1건만 성공, 나머지는 같은 request_id면 replay, 아니면 `already_submitted` |
| 진척도 | 멱등 행(응답 미리 계산) + 목표/관찰/의견 | ID를 미리 생성해 응답을 배치에 함께 기록 → 동시 중복은 PK 충돌 후 저장된 응답 반환 |
| 수업 반복 생성 | N주 INSERT 전부 | 한 주라도 겹치면 전체 롤백(`time_conflict`) |

**배치로 보장되지 않는 구간(명시)**

1. 검증용 읽기와 쓰기 배치 사이에는 다른 요청이 끼어들 수 있다. 그래서 *경합이 결과를 바꾸는 조건*은 모두 쓰기 배치 안의 조건부 문장·UNIQUE·FK·트리거로 다시 검사한다(위 표). 읽기 단계의 검사는 사용자 메시지용이다.
2. `createHomework`의 수업 연결(`linkHomeworkToLesson`)은 숙제 배치 커밋 **이후** 별도 문장이다. 원본과 같이 "숙제는 유효, 연결만 실패"를 `lessonLinked=false`로 알린다.
3. Better Auth 어댑터는 `transaction: false`로 동작한다. 가입은 user/account/profile 생성이 각각의 문장이며, 초대 소진(`claimSignupInvite`)은 단일 조건부 UPDATE라 중복 가입을 막는다. 가입 중간 실패 시 초대가 소진된 채 남을 수 있으며 운영자가 재발급한다.

검증: `tests/d1-homework.test.mjs`(배치 중간 주입 실패 시 행 수 불변, 동시 재시도 1건), `tests/d1-members.test.mjs`(동시 등록이 Free 한도를 넘지 못함), `tests/d1-schedule-report.test.mjs`(동시 수업 완료 시 1회만 차감).

## 4. 인증 (Better Auth on D1)

- 기존 Better Auth 트랙(`lib/server/auth`)을 재사용하고 provider만 `node-postgres` → `drizzle-orm/d1`(`provider: 'sqlite'`)로 바꿨다. 스키마는 `migrations/0001_init.sql` + `lib/server/auth/schema.ts`.
- 이메일+비밀번호(12~128자), DB 세션 7일·자동 연장 없음, 쿠키 `homework.session_token`(운영 빌드: `__Secure-` 접두, `Secure`), `HttpOnly`, `SameSite=Lax`, `Path=/`.
- rate limit: `storage: 'database'`(D1 `rate_limit` 테이블), 60초/10회(+ Better Auth의 인증 경로 기본 강화 규칙). 키 IP는 Cloudflare가 덮어쓰는 `cf-connecting-ip`.
- **가입은 초대제**: 운영자가 이메일 해시를 `signup_allowlist`에 넣고(`npm run cf:invite -- 이메일 --remote --apply`), 초대된 사람만 `/login` → "초대받으셨나요? 회원가입"으로 가입한다. 매직링크·이메일 인증은 이메일 provider가 없어 만들지 않았다. 비밀번호 재설정은 운영 환경에서 막혀 있다(`AUTH_EMAIL_PROVIDER_REQUIRED`) → 운영자가 계정을 지우고 재초대.
- 비밀번호 해시는 Better Auth 기본 scrypt를 그대로 둔다(보안 강도 유지). Node에서 측정한 1회 해시/검증 CPU는 **약 97~156ms**(2회 측정: hash 116/156ms, verify 116/97ms)로 Workers Free의 요청당 10ms CPU를 넘는다 → §8.
- `/app` 가드: `middleware.ts`는 쿠키 유무만(D1 0회). 실제 검증은 `app/app/layout.tsx`와 각 page의 `requireTrainerPage()`(같은 요청 안에서 React `cache`로 1회). Server Action은 `requireTrainer()`.
- `/demo`는 기존 클라이언트 샌드박스 그대로(DB·세션 미사용). `/h/[token]`, `/report/[token]`은 로그인 없이 유지.

## 5. 서버 인가 · 감사 지적 해결

| 지적 | 해결 | 검증 |
| --- | --- | --- |
| C-1 Free 5명 제한이 프론트에만 | D1 트리거 `members_free_plan_limit`(단일 INSERT 안에서 판정, 동시 등록 안전). UI 사전 확인은 안내용으로만 유지 | `d1-members.test.mjs` C-1 3건 |
| NV-2 `is_pro` 자기 승격·members 직접 INSERT | 브라우저 DB 클라이언트 제거(직접 INSERT 경로 자체가 없음). 회원 수정은 화이트리스트 strict 스키마(trainer_id/is_pro/id 거부). `toggle_pro_status` 삭제, 플랜 변경은 운영자 스크립트만 | `d1-members.test.mjs` NV-2, `security.spec.ts` |
| NV-1 공개 리포트가 메모 원문 반환 | `openMilestoneReport`가 note를 구조화 필드(기분·부위·통증·세트)로만 재직렬화(`publicFeedbackNote`) | `d1-schedule-report.test.mjs` NV-1, `security.spec.ts` |
| NV-3 토큰이 로그·저장소에 남음 | 숙제/리포트 토큰은 `sha256`만 조회 키로 저장, 숙제는 재복사용 AES-GCM 봉인본(`token_sealed`, 키 = HKDF(`BETTER_AUTH_SECRET`)) 추가. 멱등 payload에도 해시만. `invocation_logs: false`, 앱 로그에 토큰 금지(정적 테스트), `/h`·`/report`에 `Referrer-Policy: no-referrer` | `d1-schema.test.mjs`, `d1-schedule-report.test.mjs`, `no-token-logging.test.mjs`, `security.spec.ts` |

교차 테넌트 회귀: `tests/d1-authorization.test.mjs`(읽기 8종·쓰기 14종을 B가 시도해도 행 수 불변 + 소유자 대조군), `e2e/security.spec.ts`(HTTP로 다른 원장 회원·숙제 화면 차단).

주의: `BETTER_AUTH_SECRET`을 교체하면 기존 세션이 무효화되고, 기존 숙제의 "링크 다시 복사"가 빈 값이 된다(회원 링크 자체는 해시 조회라 계속 동작).

## 6. 운동 마스터 DB 위치

| 안 | 장점 | 단점 | 판정 |
| --- | --- | --- | --- |
| ① 정적 에셋(JSON) + 런타임 fetch | Worker 번들 밖, CDN 캐시·대역폭 0원, D1 읽기 0회, 코드 변경 최소 | 파일 교체 시 버전 이름 변경 필요 | **적용 (설명 테이블)** |
| ② D1 테이블 + 캐시 | 운영 중 수정 쉬움 | 검색 1회마다 D1 읽기·CPU, 시드/동기화 스크립트 필요, 무료 한도 소모 | 미적용 |
| ③ R2 | 큰 파일에 적합 | 바인딩·버킷 생성 필요, 0.6MB에는 과함 | 미적용 |

적용 내용: 624KB `master-db.instructions.json` → `public/data/exercise-instructions.v1.json`(`Cache-Control: immutable`), `loadInstruction()`은 필요할 때 fetch. 1,334종 이름·미디어 매칭 인덱스(`master-db.ts`, 188KB)는 서버 미디어 매칭(`lib/exercise-media.ts`)과 클라이언트 검색이 동기적으로 쓰므로 코드에 유지했다(gzip 수십 KB, 첫 사용 시 lazy hydrate). 시드/로더 스크립트: `scripts/exercise-master/gen_ts.py`가 새 경로로 출력한다.

## 7. 캐싱 · 성능

### Cache-Control

| 경로 | 헤더 | 이유 |
| --- | --- | --- |
| `/_next/static/*`, `/data/*` | `public, max-age=31536000, immutable` | 내용 해시·버전 파일명 |
| `/exercise-media/*` | `public, max-age=604800, stale-while-revalidate=86400` | 고정 이름 포스터 |
| `/h/[token]`, `/report/[token]` | `private, no-store` + `Referrer-Policy: no-referrer` + `noindex` | 회수·만료가 즉시 반영돼야 하고 개인 건강 기록이라 공유 캐시 금지. 의도적으로 캐시하지 않음 |
| `/app/*`, `/api/auth/*` | `no-store` | 세션 의존 |
| `/`, `/demo`, `/login` 정적 셸 | Next 기본(정적 프리렌더) | |

R2 incremental cache는 넣지 않았다(모든 강사 화면이 세션별 동적). 필요해지면 `open-next.config.ts`에 R2 override + 버킷 바인딩을 추가한다.

### 인덱스 검증 (`node --no-warnings scripts/cf/explain-queries.mjs`, 테스트: `tests/d1-query-plans.test.mjs`)

요청 경로 19개 쿼리 전부 `SEARCH … USING INDEX`, **전체 테이블 스캔 0건**. 발췌:

```
auth: session by token          SEARCH session USING INDEX sqlite_autoindex_session_2 (token=?)
public: homework by token hash  SEARCH homework USING INDEX sqlite_autoindex_homework_2 (token_hash=?)
members: list for trainer       SEARCH members USING INDEX members_trainer_created_idx (trainer_id=?)
schedule: week lessons          SEARCH l USING INDEX lessons_trainer_time_idx (trainer_id=? AND starts_at>? AND starts_at<?)
schedule: overlap trigger probe SEARCH l USING INDEX lessons_trainer_time_idx (trainer_id=? AND starts_at<?)
briefing: latest submission     SEARCH h USING INDEX homework_member_created_idx (member_id=?)
                                SEARCH s USING INDEX sqlite_autoindex_homework_submissions_2 (homework_id=?)
full table scans on request paths: 0
```

### 요청당 D1 왕복(코드 기준)

| 요청 | D1 왕복 | 비고 |
| --- | --- | --- |
| `/h/[token]` 열기 | 1 (batch 4문장) | 상태 전이 + 숙제·동작·로그 |
| 회원 제출 | 2 (읽기 batch 4 + 쓰기 batch 5+N) | |
| `/report/[token]` | 1 (batch 3) | |
| `/app` 대시보드 | 세션 확인 + 4 (회원 1, 숙제 batch 3, 오늘 수업 batch 2, 브리핑 batch 2) | 독립 조회는 `Promise.all` |
| 주간 스케줄 | 세션 확인 + 2 (보드 batch 2, 회원 1) | 이전 PostgREST 2왕복 → 보드 1왕복 |
| `/app/*` 미들웨어 | 0 | 쿠키 유무만 |

Worker 번들(`wrangler deploy --dry-run`): Phase A 2,978.68 KiB gzip → 최종 **2,806.33 KiB gzip** (Supabase 제거·설명 JSON 분리). 한도는 비압축 기준 64 MiB(Free·Paid 동일)이고 최종 비압축 크기는 12,981.16 KiB(약 12.7 MiB, 약 20%)라 크기 여유는 충분하다. gzip 값은 참고용이며 한도가 아니다(§8 근거).

## 8. 무료/유료 플랜 판단

| 항목 | Free | Paid ($5/월) | 이 앱 |
| --- | --- | --- | --- |
| 요청당 CPU | 10ms | 5분 상한(기본 30초, `limits.cpu_ms`로 최대 300,000ms까지 상향) | 로그인·가입 1회 scrypt ≈ 100~150ms(Node 측정) → **Free에서 로그인 실패(1102) 위험** |
| 요청 수 | 하루 10만 | 월 1,000만 포함 | 소형 센터 파일럿은 어느 쪽도 충분 |
| Worker 크기 | 64 MiB(비압축) | 64 MiB(비압축) | 비압축 12,981.16 KiB ≈ 12.7 MiB(약 20%). gzip(2,806 KiB)은 참고값, 한도 아님 → 플랜 선택에 영향 없음 |
| D1 | 무료 한도 내 | 무료 한도 넓음 | 쿼리는 인덱스 탐색·batch |
| 대역폭 | 0원 | 0원 | |

수치 근거(2026-11-20 확인):

- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/ — 표 "Worker size 64 MiB / 64 MiB", "CPU time 10 ms / 5 min", CPU 절의 "5 min (default: 30 seconds)", Worker size 절의 "There is no compressed size limit. Only the uncompressed bundle size counts. … The `gzip` value is shown for reference but is not a limit." 이 컨테이너에서는 developers.cloudflare.com 접속이 막혀 있어 같은 문서의 원본 소스 [`cloudflare-docs` `src/content/docs/workers/platform/limits.mdx`](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers/platform/limits.mdx)(production 브랜치)를 읽어 확인했다.
- wrangler 4.165 동작: `wrangler deploy`/`--dry-run`은 로컬에서 크기를 막지 않는다. `Total Upload`는 비압축 크기를 `MAX_UNCOMPRESSED_SIZE_BYTES = 64 MiB` 대비 비율로 색만 바꿔 출력(70% 초과 노랑, 90% 초과 빨강)하고, 실제 거부는 업로드 시 서버 검증 오류 코드 `10027`이며 wrangler는 이를 "Your Worker failed validation because it exceeded size limits."로 설명한다(`node_modules/wrangler/wrangler-dist/cli.js`의 `printBundleSize`, `errIsScriptSize`). 같은 서버 검증의 시작 시간 한도(1초, 오류 `10021`)는 dry-run으로 확인되지 않으므로 미검증이다.

**결론: 프로덕션은 Workers Paid($5) 권장(사실상 필수).** 근거: 비밀번호 해시 CPU가 Free 10ms 한도를 10배 이상 넘는다 — 해시 강도를 낮추는 대신 플랜으로 해결. Free는 `/h`·`/report` 공개 링크 시연에는 쓸 수 있지만 강사 로그인을 보장하지 못한다. 요청당 CPU를 줄이는 설계(미들웨어 D1 0회, batch, 인덱스, 정적 에셋 분리, 공개 링크 1왕복)는 Paid에서도 비용·지연을 낮춘다.

## 9. 환경변수 · 시크릿 · 바인딩

| 이름 | 종류 | 위치 | 설명 |
| --- | --- | --- | --- |
| `DB` | D1 바인딩 | `wrangler.jsonc` | `database_id`를 실제 값으로 교체 |
| `BETTER_AUTH_SECRET` | 시크릿 | `wrangler secret put` / `.dev.vars` | 32자 이상. 세션 서명 + 숙제 링크 봉인 키 파생 |
| `BETTER_AUTH_URL` | 시크릿(또는 var) | `wrangler secret put` / `.dev.vars` | 공개 origin(쿠키·trusted origin). 예: `https://instructor-sync.<계정>.workers.dev` |
| `NEXT_PUBLIC_APP_URL` | var | `wrangler.jsonc` `vars` | 카카오톡 공유 링크 origin. 실제 도메인으로 교체 |
| `WORKER_SELF_REFERENCE`, `ASSETS` | 바인딩 | `wrangler.jsonc` | OpenNext 내부용 |

로컬: `cp .dev.vars.example .dev.vars` 후 값 입력(커밋 금지, `.gitignore` 처리됨).

## 10. 지욱 님이 직접 실행할 명령 (순서대로)

```bash
npx wrangler login
```

```bash
npx wrangler d1 create instructor-sync
```

출력된 `database_id`를 `wrangler.jsonc`의 `d1_databases[0].database_id`에 넣고, `vars.NEXT_PUBLIC_APP_URL`을 실제 주소로 바꾼 뒤:

```bash
npx wrangler d1 migrations apply instructor-sync --remote
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put BETTER_AUTH_SECRET
```

```bash
npx wrangler secret put BETTER_AUTH_URL
```

```bash
npm run deploy
```

첫 원장 초대(이메일은 본인 것으로):

```bash
node scripts/cf/invite-trainer.mjs you@example.com --remote --apply
```

배포 URL의 `/login` → "초대받으셨나요? 회원가입"에서 그 이메일과 12자 이상 비밀번호로 가입한다. Pro 전환이 필요하면:

```bash
node scripts/cf/set-trainer-plan.mjs you@example.com pro --remote --apply
```

## 11. 롤백

- Vercel 배포와 Supabase 프로젝트는 이 PR에서 **건드리지 않았다**. `main`(Supabase 버전)은 Vercel에서 그대로 서비스된다 → 롤백 = Cloudflare 쪽 DNS/링크 안내를 Vercel 주소로 되돌리기.
- Cloudflare 쪽 되돌리기: `npx wrangler rollback`(이전 Worker 버전) 또는 Worker 삭제. D1은 Time Travel로 시점 복구(`npx wrangler d1 time-travel restore instructor-sync --timestamp=<ISO>`).
- 데이터 이관은 이 PR 범위가 아니다(스키마·시드만). 실데이터를 옮기기 전에는 Supabase가 유일한 원본이므로 두 시스템에 동시에 쓰지 않는다(단일 쓰기 원칙).

## 12. 검증 · 미검증

로컬 검증됨(이 컨테이너, workerd + 로컬 D1): `node --test`, `tsc`, `eslint`, `opennextjs-cloudflare build`, `wrangler deploy --dry-run`, `wrangler d1 migrations apply --local`, Playwright 원루프(모바일 390·데스크톱) + 보안 계약 9/9, EXPLAIN QUERY PLAN.

미검증(계정·실기기 필요): 실제 Cloudflare 배포·원격 D1 적용, 운영 CPU 시간 실측(scrypt는 Node 측정치), 카카오톡 인앱 브라우저·실기기 음성 코칭, 커스텀 도메인, 원격 rate limit 동작, D1 Time Travel 복구 리허설, Supabase→D1 실데이터 이관.

제거·변경된 동작(의도): 로컬 전용 `NEXT_PUBLIC_DEMO_MODE` 인메모리 `/app` 폴백 제거(로컬 D1로 대체, `/demo` 샌드박스는 그대로), 공개 셀프 가입 → 초대제, 매직링크/이메일 콜백(`/auth/callback`) 제거, pg 기반 미사용 API(`/api/members/[id]`, `/api/homeworks/[id]`) 제거.

## 13. 테스트 지도

| 파일 | 대상 |
| --- | --- |
| `tests/support/d1-sqlite.mjs` | node:sqlite 위 D1 호환 어댑터(실제 `migrations/*.sql` 적용, batch=트랜잭션, undefined 바인딩 거부) |
| `tests/d1-schema.test.mjs` | 마이그레이션 순서, SQL 우회 시 FK/CHECK/트리거, 토큰 해시 저장, 제출 불변 |
| `tests/d1-members.test.mjs` | C-1, 등록 멱등, NV-2, 프로필, 기존 기록, 수업 메모 소유 |
| `tests/d1-homework.test.mjs` | 출제 원자성·멱등(동시), 입력 경계, 공개 열기 최소 필드, 토큰 상태, 제출 원자성·멱등·경합, 회수 우선 |
| `tests/d1-schedule-report.test.mjs` | 반복 수업 all-or-nothing, 겹침, 잔여 횟수 1회 차감, 주간 보드 1왕복, NV-1/NV-3, 브리핑 |
| `tests/d1-authorization.test.mjs` | 진척도 멱등·정정, 교차 테넌트 매트릭스, 초대 1회성 |
| `tests/d1-limits.test.mjs`, `tests/d1-query-plans.test.mjs`, `tests/no-token-logging.test.mjs` | D1 한도, 인덱스, 토큰 로그 금지 |
| `e2e/one-loop.spec.ts`, `e2e/security.spec.ts` | 로컬 Workers + D1 E2E ([e2e/README.md](../e2e/README.md)) |
