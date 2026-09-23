# ADR-001 — 자체 PostgreSQL 전환 기술 결정

2026-09-13 / **확정 · READY** / 구현 상태: **설계 작성됨, 코드·새 DB 미구현**. 조사·공식 문서 확인과 회귀검사는 2026-09-12에 수행하고 9월 13일 문서 정합성을 마무리했다.

READY는 3단계의 합성 데이터 전용 로컬 환경 구현을 시작할 기술 결정이 갖춰졌다는 뜻이다. 실제 이전·파일럿·배포 승인이 아니다. 단계 원본은 [EXECUTION_CONTROL.md](EXECUTION_CONTROL.md), 불변조건은 [데이터 기준](DATA_INTEGRITY_AND_POSTGRES_MIGRATION.md), 제품 범위는 [제품 기준](PRODUCT_BASELINE.md)이다.

## 1. 결정의 전제와 조사 범위

- 사용자 확정 방향: 개발은 Docker Compose 로컬 PostgreSQL, 운영은 개발자 PC가 아닌 서비스 서버의 자체 관리 PostgreSQL, 브라우저 DB 접근 금지, Next.js 서버 인증·권한 검사, 파일럿 전 Supabase 파기 금지, 기본 이중 쓰기 금지.
- 원장 1계정 센터·첫 10개 센터 무료 학습 목표를 유지한다. 조직·직원·인계 모델을 미리 만들지 않는다. 무료 기간·가격·법적 보관 정책은 기술 구현의 선행 조건으로 만들지 않되 실제 파일럿 게이트로 남긴다.
- 확인: `main`, HEAD `d30925bd437e504d64a514e533a5986e46f54829`, 1단계 DONE. 현재 작업트리는 과거 강의 앱 삭제와 운동숙제 추가가 미커밋 상태다. [1단계 복구 기준선](STAGE_1_LOCAL_DEMO_BASELINE.md)을 보존한다.
- 조사한 것은 로컬 코드·SQL·환경변수 **이름**이다. 비밀값을 출력하지 않았고, 외부 DB·대시보드·배포 환경에 접속하지 않았다. 실제 운영 데이터 유무·실제 적용 DDL·SMTP·배포 제공자는 **미확인**이다. 데이터가 없다고 단정하지 않는다.

## 2. 현재 Supabase 의존성 목록

| 영역 | 확인된 로컬 근거 | 전환 결정 |
| --- | --- | --- |
| SDK | `package.json`: `@supabase/ssr ^0.10.0`, `@supabase/supabase-js ^2.101.1`, lockfile 있음 | 구 구현 보존. 새 브라우저 계약은 동일 출처 HTTP만 사용 |
| Auth | `app/login/page.tsx`: signUp/signInWithPassword, 이름 user_metadata. `app/auth/callback/route.ts`: PKCE exchangeCodeForSession. `middleware.ts`: getUser·쿠키 전달·데모 우회 | Better Auth로 교체할 목표 확정; 현재 코드는 유지 |
| 로그아웃 | `components/TrainerNav.tsx` 브라우저 signOut, `app/api/auth/signout/route.ts` 서버 signOut | 서버 세션 폐기와 쿠키 제거로 일원화 |
| 연결 | `lib/supabase/client.ts`, `server.ts`: 공개 URL/anon key. `lib/db.ts` 브라우저 SDK CRUD/RPC, `lib/db-server.ts` 서버 조회/RPC | server-only 서비스·저장소 계층으로 분리 |
| 테이블 | 초기 SQL의 profiles, members, homework, homework_items, homework_logs, session_notes, exercise_library 7개 | 아래 목표 모델로 신규 DB에 생성. 기존 SQL 직접 덮어쓰기 금지 |
| 관계 | profiles.id, members/homework/session_notes.trainer_id → auth.users. homework.member_id → members. items/logs → homework. notes.member_id → members. 삭제 CASCADE | 독립 authn.user + app.trainers, 강사/부모 복합 FK, 파괴적 삭제는 제한 |
| RLS | 7개 테이블 활성화. profiles 자기 ID, members/homework/notes 자기 trainer_id, items/logs 부모 homework 조회, library authenticated 읽기 | 현재 정책 보존. 새 DB는 비공개 네트워크·서버 소유권·DB 제약 체계, 아래 RLS 판단 적용 |
| RPC 1 | open_homework: 토큰 조회·열림 전이·회원/동작/기록 반환. 음성 SQL에서 재정의 | 최소 DTO 조회 + 별도 멱등 열림 기록 |
| RPC 2 | log_homework: complete/cant/pain/note 개별 append, 요약 갱신. 브라우저 wrapper 잔존 | 신규 API에 개별 로그 쓰기 노출하지 않음 |
| RPC 3 | submit_homework_feedback: 완료/못함+통증/메모 묶음, FOR UPDATE, 원자적 갱신 | 명시적 서비스 트랜잭션 + 요청 ID·정정 버전 |
| RPC 4·5 | revoke_homework 소유권 확인; toggle_pro_status authenticated 자기 플랜 토글 | 회수는 서비스로 이동. 자기 플랜 토글은 목표 API에서 제외 |
| 권한·트리거 | RPC는 SECURITY DEFINER. anon 테이블 권한 회수, 함수 PUBLIC 실행 회수, 회원 RPC anon/authenticated, 회수/Pro 토글 authenticated. handle_new_trainer가 auth.users INSERT 트리거로 profiles 생성 | Supabase auth.uid/roles/trigger 종속성을 새 DB에 복사하지 않음 |
| 추가 SQL | `20260416000000_voice_coach_cadence.sql`: cadence 컬럼·범위 CHECK·backfill. `20260417000000_atomic_homework_submission.sql`: 제출 RPC | cadence 제약 유지, 로컬 계약 테스트 유지. 과거 강의용 increment/decrement_credit 제거 SQL은 새 모델 범위 밖 |
| Storage | 현재 앱 코드에서 Storage SDK·버킷 정책·업로드 경로 사용 없음 | 새 스토리지 서비스 도입하지 않음. 실제 외부 버킷 존재 여부는 미확인 |
| Realtime·기타 | 현재 코드에서 channel/subscribe, Edge Functions, Cron·Queue 호출 없음. SDK 전이 의존성이 런타임 사용 증거는 아님 | 폴링/일반 요청으로 시작. 해당 서비스를 재구축하지 않음 |
| 운동 라이브러리 | DB 40개 seed와 `lib/seed-exercises.ts` 중복. 작성 UI는 TS 상수 사용 | 사용자 4단계 요청으로 exercises 카탈로그 테이블·최소 seed 채택. 할당 동작에 값 복사, 편집 API 제외 |
| 데모 | `lib/db.ts` 메모리와 `lib/db-server.ts` 고정 fixture 분리 | 새 통합 테스트는 로컬 실 PostgreSQL 합성 데이터. 저장 실패→데모 성공 전환 금지 |
| 환경변수 | `.env.example`: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/APP_URL. `.env.local`에는 이들과 NEXT_PUBLIC_DEMO_MODE, SUPABASE_SERVICE_ROLE_KEY 존재 | 이름만 확인. service role은 현재 코드 소비 없음. 새 서버에 기존 env 통째로 복사 금지 |
| 과거 환경 잔재 | OPENAI_API_KEY, TAVILY_API_KEY, MOCK_MODE, NEXT_PUBLIC_BACKEND_URL 이름 존재, 현재 코드에서 참조 발견 못함 | 과거 프로젝트 잔재로 분류; 삭제·회전하지 않음, 새 배포에 전달하지 않음 |
| 테스트 | `tests/feedback-db.test.mjs`가 3개 SQL을 PGlite에 적용, auth.users/auth.uid/roles를 모형화. client/coach 테스트는 SDK mock | 그대로 보존하되 새 DB의 실세션·복합 FK·다중 연결 경합 테스트 별도 필요 |
| 배포 | 현재 npm dev/build/start, Next config는 turbopack root. 현행 Compose·Dockerfile·CI 워크플로·배포 매니페스트 발견 못함 | 실제 배포 유무 추론 금지. 서비스 서버의 단일 Node 프로세스 + PostgreSQL 컨테이너 목표 |

SQL 기준: `supabase/migrations/20260415000000_exercise_homework_init.sql`, 위 cadence/atomic SQL. 실제 Supabase의 GRANT·확장·함수 적용 여부는 로컬 파일로 증명할 수 없다. Data API 자동 노출 정책도 변경되므로 향후 레거시 검증은 프로젝트 설정 확인이 필요하다. [Supabase 공식 변경 공지](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

확인된 설계 위험: 단일 FK만으로 homework/notes의 trainer와 member 소유권 일치를 강제하지 못함; homework_items에 순번 UNIQUE 없음; profiles 자기 UPDATE와 Pro 토글에 서버 관리 필드 경계 부족; 숙제 연속 insert 비원자성; 제출 요청 ID 없음. 실제 악용이나 운영 사고가 있었다는 뜻은 아니다.

## 3. 기술 선택과 거절한 대안

| 결정 | 채택 | 비교·거절 이유와 비용/유지보수 판단 |
| --- | --- | --- |
| 인증 | **Better Auth + 이메일/비밀번호 + DB 세션** | 기존 UX 유지, 비밀번호/복구·세션 라이프사이클을 라이브러리에 맡김. Auth.js Credentials는 저장·해시·reset 등 추가 구현 부담이 큼. 직접 구현은 보안 검토·복구 지원 비용이 가장 큼. 라이브러리 업데이트/설정 검증 책임은 남음 |
| DB 접근 | **Drizzle ORM + node-postgres(pg)** | TypeScript와 SQL이 가깝고 복합 FK·잠금·조건부 갱신을 명시하기 쉬움. Prisma도 custom SQL이 가능하지만 현재 소규모 SQL 중심 모델에 별도 모델링 추상화의 편익이 작음. 순수 SQL+pg만 쓰면 타입/매핑·auth adapter 유지 부담이 증가 |
| 마이그레이션 | **Drizzle Kit 생성 SQL + 검토한 custom SQL, 하나의 이력** | TS schema가 모델 입력, 커밋된 SQL이 적용 산출물. 수동 SQL도 같은 순서에 등록. push/런타임 자동 DDL·운영 자동 down 금지. Better Auth schema 생성 결과도 검토 후 이 이력에 포함, 별도 auth migrator 병행 금지 |
| 실행 구조 | **단일 Next.js Node 서버, 단일 PostgreSQL** | Linux 서비스 서버에서 reverse proxy TLS 종료, 앱/DB 별도 컨테이너·볼륨. 초기 동일 호스트 허용하되 장애 도메인 공유를 인정. Kubernetes·마이크로서비스·상시 이중 쓰기·Redis·별도 인증 서버 제외 |
| 런타임 | **PostgreSQL 17, Node.js 24 LTS** | PostgreSQL 17 지원 기간과 신규 기능 불필요성을 고려. 실행 시 최신 보안 minor를 확인해 이미지 digest·패키지 lock으로 고정. 현재 검사 런타임 Node20과 구분, 지금 설치/업그레이드하지 않음 |

비교 근거: [Better Auth 이메일 인증](https://www.better-auth.com/docs/authentication/email-password), [Auth.js Credentials](https://authjs.dev/getting-started/authentication/credentials), [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Drizzle 마이그레이션](https://orm.drizzle.team/docs/migrations), [Prisma Migrate](https://docs.prisma.io/docs/orm/v7/prisma-migrate), [PostgreSQL 지원 정책](https://www.postgresql.org/support/versioning/), [Node 지원 상태](https://nodejs.org/en/about/previous-releases). 수치 가격은 비교하지 않았다. 서버·메일·별도 백업 저장소 비용과 보안 패치/복구에 드는 개발자 시간을 운영 비용으로 본다.

## 4. 서버 경계

브라우저 → 같은 출처 Route Handler → 인증된 서비스 → 저장소 → PostgreSQL. Server Component는 HTTP 자기 호출 없이 같은 서비스를 사용한다.

| 계층/예정 경로 | 책임 | 금지 |
| --- | --- | --- |
| `app/api/auth/[...all]/route.ts` | Better Auth 공식 handler, trusted origin·쿠키 처리 | 비밀번호 처리 자체 재구현 |
| `app/api/members`, `homework`, 공개 제출 Route Handler | 입력 Zod 검증·크기 제한·CSRF/Origin·속도 제한·상태 코드·request ID 전달 | 클라이언트 trainer_id 신뢰, 직접 범용 SQL |
| Server Action | 초기 업무 쓰기 경로로 사용하지 않음. 향후 필요하면 동일 서비스의 얇은 adapter만 | 인증/권한/트랜잭션 로직 복제 |
| `lib/server/auth` | DB 세션 검증 후 `TrainerContext` 생성. 회원은 별도 `HomeworkCapability` | 쿠키 존재만으로 권한 허용, JWT 자체 decode 신뢰 |
| `lib/server/services` | 업무 규칙·소유권·멱등성·정정·트랜잭션 단위·공개 DTO 구성 | 외부 메일 호출을 DB 잠금 안에서 수행 |
| `lib/server/repositories` | 전달받은 tx 연결로 조건부 쿼리. 강사 context 필수, 토큰 저장소 별도 좁은 메서드 | 무제한 `findById` 노출, 요청 body로 SQL 식별자 조립 |
| `lib/server/db`, `db/schema`, `db/migrations` | pool·Drizzle 모델·검토된 SQL, 모두 예정 경로 | 브라우저 import, 앱 기동 시 DDL |

server-only import 검사를 두고 UI에는 최소 DTO만 전달한다. middleware/proxy는 화면 redirect 보조이지 권한 경계가 아니다. 사용자별 응답은 공유 캐시 금지. DB 장애는 503/재시도 안내이며 빈 목록·데모 성공으로 숨기지 않는다. [Next.js 데이터 보안 지침](https://nextjs.org/docs/app/guides/data-security)

## 5. 인증·계정 복구·권한

- 초기 인증은 이메일/비밀번호만 사용. 파일럿 계정은 운영자 승인 이메일 allowlist로 가입 허용하며 전역 공개 가입·소셜 로그인·조직 플러그인은 제외한다. 승인 여부는 서버 관리이고 일반 프로필 수정에서 바꿀 수 없다.
- 이메일 검증 전 회원 데이터 접근 불가. 라이브러리의 scrypt 해시를 사용하고 비밀번호 12~128자, 붙여넣기 허용, 자체 정기변경·암호화 알고리즘 금지. 가입/복구 응답은 계정 존재를 노출하지 않는다.
- DB 세션, HttpOnly·운영 Secure·SameSite=Lax·host-only cookie. expiresIn 7일, disableSessionRefresh로 절대 만료, 민감 작업 freshAge 5분. cookieCache/자체 JWT·localStorage 토큰 없음. 매 보호 요청 DB 세션과 활성 강사 프로필 확인, 로그아웃·비밀번호 reset 후 모든 세션 폐기.
- 비밀번호 reset은 라이브러리의 1회·30분 링크, 이메일 검증 링크는 1시간으로 설정한다. 메일 전달 인터페이스를 분리해 개발/테스트는 로컬 메일 sink, 운영 SMTP 제공자는 나중에 선택한다. 평문 비밀번호·메일 링크를 지원 로그에 남기지 않는다. 메일 실패는 알림·재요청 가능 상태로 처리하며 지원자가 임의 비밀번호를 정해 보내지 않는다.
- 검증된 계정의 최초 앱 진입에서 profile을 자기 user_id로 idempotent upsert하고 성공 전 업무 쓰기를 허용하지 않는다. Auth 계정 생성과 profile 생성의 분리 실패를 복구 가능하게 하며 Supabase signup trigger를 복제하지 않는다.
- 프로필의 활성/파일럿 권한·is_pro 호환 필드는 서버 관리 전용. 가입 metadata/클라이언트 입력으로 승격 불가. 유료 플랜·사용량 과금 시스템은 만들지 않는다.
- authn schema의 세션 토큰 저장 형식은 Better Auth adapter 계약을 따른다. **숙제 토큰의 해시 저장과 혼동하지 않는다.** auth DB/백업 유출 시 세션이 노출될 수 있으므로 별도 DB 권한·백업 암호화·일괄 폐기 절차가 필수다.
- 최초 제한값: 로그인 IP당 10회/분·계정 키당 5회/분, 복구 계정 키당 3회/시간. trusted proxy만 IP 원본으로 신뢰, 키는 HMAC, 짧은 보관. 원문 IP/UA의 세션 영구 수집은 하지 않도록 adapter hook을 검증하고 최소화한다. 제한값은 합성 부하 테스트로 조정 가능하다.

기본값과 프로젝트 선택은 구분한다. 세션 캐시를 켜면 폐기 반영이 늦을 수 있고, 비밀번호 reset 시 세션 폐기는 명시 설정이 필요하다. [세션 관리](https://better-auth.com/docs/concepts/session-management), [비밀번호·reset](https://www.better-auth.com/docs/authentication/email-password), [보안/Origin](https://better-auth.com/docs/reference/security), [속도 제한](https://better-auth.com/docs/concepts/rate-limit)

## 6. 목표 데이터 모델 (확정, DDL 미작성)

2026-09-13 사용자 3~5단계 요청에 따른 명칭/기록 보완: 2단계 명칭 `app.profiles→trainers`, `homework→homeworks`, `homework_items→homework_exercises`, `homework_tokens→member_access_tokens`, `homework_submissions→submissions`를 아래 목표 표에 반영했다. 레거시 테이블 이름을 바꾸는 migration이 아니다. TS-only 카탈로그 결정은 최신 요청의 exercises 테이블로 대체하고 편집 API는 제외한다.

새로운 정상 후속 기록은 새 observation_id/version1/supersedes=NULL, 정정은 같은 observation_id/performed_at와 version+1/supersedes를 갖는다. 최초 observation_id=id를 강제하고 정정은 직전 버전만 참조한다. 이력·feedback·receipt는 한 제출 묶음의 트랜잭션이다. 구체적인 검증 상태는 [P0 검사표](P0_VERIFICATION_MATRIX.md)이며 기술 라이브러리 선택은 재개방하지 않는다.

업무 UUID PK, 시간은 TIMESTAMPTZ UTC·화면 Asia/Seoul, 패키지 만료일만 DATE. JSONB는 멱등 결과 같은 제한된 envelope에만 사용하고 제출 핵심 필드는 타입화한다. authn과 app schema는 같은 DB에 두되 런타임 역할을 분리한다.

| 모델 | 핵심 필드·관계·제약 |
| --- | --- |
| `authn.user/account/session/verification` | Better Auth 생성 모델 사용, UUID ID 선택. user 이메일 정규화·유일성, account credential 비밀번호 해시, 세션 만료. reset/verification은 라이브러리 계약. 임의 Supabase auth 테이블 복제 금지 |
| `authn.rate_limit` | DB 기반 인증 요청 제한을 선택했을 때 adapter 생성 모델. 원문 식별자 대신 검증된 HMAC 키/시간창 저장, 만료 정리 |
| `authn.signup_allowlist` | 정규화 이메일의 keyed HMAC UNIQUE, enabled, expires_at, created_at. 승인된 운영 도구만 변경; auth 서버는 가입 전에 조회. 이름/연락처는 추가 수집하지 않음 |
| `app.trainers` | id UUID PK/FK authn.user.id ON DELETE RESTRICT, name, active, is_pro(일반 사용자 수정 불가), created/updated. 이름은 표시용, 권한과 분리 |
| `app.members` | id, trainer_id→trainers, name, phone nullable(최소수집), package_total>0, remaining 0..total, expires_on, end_state, version, created/updated. UNIQUE(id,trainer_id) |
| `app.exercises` | 읽기 전용 카탈로그 id/name/cue·동작 기본값, 최소 합성 seed. 할당 시 homework_exercises에 값 복사, 카탈로그 수정으로 기존 숙제 변경 금지 |
| `app.homeworks` | id, trainer_id, member_id, why, status ready/opened/logged, version, first_opened_at, latest_submission_id nullable, opening_line(파생값), created/updated. FK(member_id,trainer_id)→members(id,trainer_id), UNIQUE(id,trainer_id). ready는 발송 완료가 아니라 공유 준비를 뜻함. 초안은 클라이언트, 회수는 token 상태로 분리 |
| `app.homework_exercises` | id, homework_id FK, optional exercise_id FK, order_index 1..3, UNIQUE(homework_id,order_index), name/cue, sets 1..20, 표시 횟수, effort_kind와 reps/hold_seconds, cadence. reps 1..50 또는 hold 1..300, seconds_per_rep 0.5..10, rest 0..180, per_side |
| `app.member_access_tokens` | id, homework_id FK, token_hash BYTEA 32바이트 UNIQUE, issued_at, expires_at, revoked_at, replaces_token_id(같은 숙제 복합 FK). 숙제당 미회수 토큰 최대 1개 partial unique; expires_at>issued_at. 원문·복호화용 암호문 저장 없음 |
| `app.submissions` | id, homework_id FK, token_id FK, kind complete/cant, performed_at, observation_id, version, supersedes_id nullable, created_at. UNIQUE(observation_id,version), UNIQUE(supersedes_id), token·정정은 같은 숙제/관찰의 복합 FK. 신규 관찰 version1, 정정은 새 행 |
| `app.feedback` | submission_id PK/FK와 homework_id 복합 FK, has_pain, note≤1000자, pain_area≤100자. 제출당 하나, submission과 원자적 저장. 원본 UPDATE 대신 정정 submission의 새 feedback |
| `app.session_notes` | id, trainer_id, member_id, note≤2000자, version, created/updated; FK(member_id,trainer_id)→members(id,trainer_id) |
| `app.write_requests` | actor_scope, operation, aggregate_key, request_id UUID, payload_hash, result envelope, created_at. 네 필드 복합 UNIQUE로 동시 중복 차단. 원문 토큰·비밀번호·회원 메모는 결과 캐시에 저장하지 않음 |
| `app.rate_limit_buckets` | 공개 API HMAC 키·시간창·횟수·만료, 원문 토큰/IP 없음. 초기 같은 DB, Redis 없음 |

items는 순번 제약으로 3개 초과 차단하고, 최소 1개는 서비스 검사 + 지연 constraint trigger로 commit 시 강제한다. submissions/tokens에 UNIQUE(id,homework_id)를 두어 정정·제출 token·latest_submission 복합 FK가 같은 homework를 강제한다. 원장 소유 회원을 다른 강사에게 옮기는 UPDATE는 API에 없고 DB의 소유 필드는 불변 처리한다. FK용 인덱스, (trainer_id,created_at,id), (homework_id,version), 만료 정리용 인덱스를 둔다. 부하 측정 없는 추가 인덱스는 만들지 않는다. [PostgreSQL 제약](https://www.postgresql.org/docs/18/ddl-constraints.html)

목표 RLS 판단: **초기 자체 PostgreSQL에는 Supabase RLS를 그대로 이식하지 않는다.** Data API/anon DB 역할을 제공하지 않고, 강사별 WHERE·서버 capability·복합 FK·실제 권한 테스트로 격리를 보장한다. 업무 app 역할은 소유자/superuser/BYPASSRLS/DDL 권한 없음, authn 접근 없음; auth 역할은 authn만 접근. DB 제약만으로 누락된 SELECT 소유권 조건을 막지는 못하므로 모든 저장소 메서드에 context 필수 + 교차 강사 HTTP 테스트를 5단계 필수 게이트로 둔다. 직접 DB 사용자/다중 서비스가 필요해지면 RLS를 별도 ADR로 재검토한다. 현재 Supabase RLS는 변경하지 않는다.

업무 레코드의 DELETE는 초기 일반 API/역할에 부여하지 않는다. RESTRICT FK로 계정 삭제의 연쇄 데이터 손실을 막는다. 법적 보관/삭제가 확정되면 별도 승인된 관리 절차가 자식부터 제거하도록 구현한다. 불필요한 수집은 중단하되 운영 데이터 자동 삭제 기간을 여기서 임의로 확정하지 않는다.

## 7. 공개 토큰·원자성·멱등성

### 토큰 발급과 접근

- 공식 작성 클라이언트는 Web Crypto CSPRNG **32바이트(256bit), base64url 43자** 토큰과 별도 UUID request_id를 한 번 생성한다. 인증된 서버는 형식·길이·소유권을 검증한 뒤 SHA-256 hash만 저장한다. UUID/시각/Math.random은 토큰 대체 불가. 임의 클라이언트 입력의 엔트로피를 서버가 측정할 수 없다는 한계는 인정하며, 서버 외부 호출자는 이 발급 계약을 따라야 한다.
- 발급 후보를 요청 메모리에 유지하고 같은 body/request_id로 재시도한다. 서버 응답은 homework/token 레코드 ID·만료 등 영속 receipt이며 원문 URL을 저장/회신할 필요가 없다. 브라우저가 가지고 있는 토큰으로 URL을 구성하므로 **해시만 저장하면서도 동일 요청의 동일 결과**가 가능하다.
- reload 대비 pending request ID/비밀 없는 receipt만 보존한다. 응답 유실 시 인증된 요청 상태 조회로 생성 여부를 먼저 확인한다. 원문 토큰을 잃었으면 동일 숙제를 중복 생성하지 않고 명시적으로 재발급한다. 원문 토큰을 localStorage·Zustand 영속 draft·로그에 넣지 않는다. 이 UX를 6/8단계에서 검증한다.
- 만료는 서버 시각 기준 발급 후 14×24시간. 만료/회수/없는 토큰의 외부 응답은 동일한 제한 안내. 재발급은 homework 행 잠금 → 이전 모든 미회수 토큰 회수 → 새 hash 저장을 한 트랜잭션으로 수행, 이전 링크 즉시 무효. 회수/재발급은 강사 세션 필요, 숙제 내용과 제출 이력은 유지.
- 공개 DTO는 해당 숙제 이유·동작·만료·표시 이름·최신 제출만 포함한다. 전화번호·trainer_id·다른 회원·이전 토큰으로 남긴 전체 기록은 노출하지 않는다. 피드백 정정은 최신 제출 버전으로 제한한다.
- GET은 읽기 전용, 실제 회원 화면 활성화 후 별도 POST로 first_opened_at을 한 번 기록한다. 카카오 링크 미리보기·프리패치를 실제 열람으로 세지 않되 봇 판별이 완벽하다고 주장하지 않는다.
- `/h/*`와 공개 API는 no-store·no-referrer·noindex, 제3자 분석/리소스 제외. 프록시/Next/APM 접근 로그에서 원문 path·query·body 대신 route template만 남기도록 설정 검증한다. 토큰 자체가 공유 권한이므로 전달받은 타인의 사용까지 식별하지는 못한다. 공개 요청 크기 16KB, token당 제출 10회/분, IP당 60회/분을 초기 상한으로 둔다.

### 쓰기 계약과 경합

- 업무 쓰기는 서비스의 단일 DB 트랜잭션. 기본 READ COMMITTED + 명시적 행 잠금/유일 제약; 같은 tx 연결을 저장소에 전달하고 `pool.query`로 트랜잭션을 분산시키지 않는다. [node-postgres 트랜잭션](https://node-postgres.com/features/transactions)
- 인증/권한 또는 토큰 유효성을 **멱등 결과 반환 전에도** 확인한다. 강사 actor는 세션 user_id, 회원 actor는 token 레코드 ID다. 전달받은 actor/trainer_id는 사용하지 않는다.
- 생성·수정·회수·재발급·메모·열림·제출에 operation/aggregate/request_id를 적용한다. 생성 aggregate_key는 신규 UUID, 기존 것은 대상 UUID. 인증 라이브러리 내부 동작은 자체 보안/세션 계약으로 관리하고 업무용 write_requests를 억지로 끼워 넣지 않는다.
- write_requests UNIQUE 선점 후 동일 payload_hash는 같은 receipt, 다른 payload는 409. 생성/제출/요약/receipt를 함께 commit. 트랜잭션 실패 시 전부 rollback, 응답 유실 시 같은 키로 재시도. idempotency 행은 대상 수명 동안 유지, 시간 만료만으로 키를 재사용하지 않는다.
- payload는 버전 지정·정규화한 필드의 정해진 직렬화로 해시한다. 토큰은 digest로 치환. 임의 JSON 키 순서/시간값 때문에 동일 요청을 다르게 판단하지 않는다. resource 수정은 expectedVersion을 포함해 stale write 409.
- 제출은 §6 보완의 **submissions+feedback 한 묶음**이다. 새 수행은 새 key/performed_at/observation, 정정만 expectedVersion과 supersedes_id로 append한다. 서로 다른 탭의 같은 관찰 동시 정정 중 하나만 성공한다. 현재 요약은 performed_at·생성 순서로 최신 관찰을 정하고 그 관찰의 최신 정정으로 재생성한다. 과거 관찰 정정이 더 최근의 실제 수행을 덮어쓰지 않는다.
- 잠금 순서: write_requests 선점 → 필요한 member → homework → token → submission, 다중 대상은 UUID 정렬. 토큰 hash로 homework ID를 읽은 뒤 homework를 잠그고 token/소유권·`clock_timestamp()` 만료를 재검사한다. 회수·재발급·열림·제출이 같은 순서를 사용한다.
- 회수보다 먼저 검증·commit한 제출만 인정한다. 회수 뒤 대기하던 요청은 거절한다. deadlock/serialization failure는 같은 request_id로 최대 3회 제한 재시도, 검증 오류는 재시도하지 않는다. 메일/네트워크/음성 호출은 잠금 밖.

## 8. 환경·연결 풀·관측성

| 환경 | 연결·경계 |
| --- | --- |
| 개발 | Compose PostgreSQL17 named volume, 호스트 노출 시 127.0.0.1 전용 포트. 별도 DB homework_dev. app/auth pool 각 max5, HMR에서 프로세스별 singleton. 로컬 합성 데이터만 |
| 테스트 | 별도 Compose project/일회용 volume와 homework_test. worker별 DB 또는 직렬 실행, pool 각 max2. 테스트 대상 이름/host allowlist 검사 후에만 초기화·폐기. 개발/운영 DB 대상으로 TRUNCATE 금지 |
| 운영 | Linux 서비스 서버, DB 포트 공용 노출 금지, 사설 네트워크/방화벽. app/auth pool 각 max5부터, 앱 1프로세스. 앱 역할 DB마다 connection limit, max_connections 초기100. worker 수×(app5+auth5)+migration/backup/관리 여유20 이내인지 기동/배포 전 확인 |

초기 pg.Pool로 충분하므로 PgBouncer는 넣지 않는다. 확장 시 측정 후 추가하되 transaction pooling·prepared statement·세션 상태 호환성을 별도 검증한다. connectionTimeout 3초, idleTimeout 30초, statement_timeout 5초, lock_timeout 2초, idle_in_transaction 10초를 업무 초기값으로 설정한다. 마이그레이션/백업은 별도 역할·timeout. 운영 DB TLS는 인증서 검증, 로컬 loopback만 명시적으로 TLS 없음 허용.

예정 환경변수(아직 파일에 추가하지 않음):

- 서버 전용 `DATABASE_URL`(app), `AUTH_DATABASE_URL`(authn), `MIGRATION_DATABASE_URL`(DDL 작업에서만 주입), `TEST_DATABASE_URL`(테스트에서만).
- `BETTER_AUTH_SECRET`(최소 32 랜덤 바이트 별도 비밀), `BETTER_AUTH_URL`/`APP_ORIGIN`/`TRUSTED_ORIGINS`(고정 허용 origin), `RATE_LIMIT_HMAC_KEY`, `SMTP_*`/`MAIL_FROM`, `APP_ENV`, `DATA_BACKEND`, `READ_ONLY_MODE`, pool/timeouts.
- DATA_BACKEND는 프로세스 시작 시 하나만 선택하고 자동 fallback하지 않는다. 각 전환의 auth adapter도 해당 backend와 원자적으로 선택, 불일치 기동 거부. 운영에서 demo 플래그/localhost DB/미설정 비밀이면 fail closed.
- 비밀은 서버 secret 파일/주입으로 관리, 이미지·Git·NEXT_PUBLIC·로그에 넣지 않는다. 요청의 forwarded host로 인증 URL을 만들지 않고 고정 origin 사용. Supabase 환경은 레거시 인스턴스에만 한정한다.

로그는 request_id·작업 종류·오류 코드·지연·DB pool 대기·commit 결과만, 메모/통증/연락처/비밀번호/쿠키/토큰 제외. 저장 성공/거절/충돌/복구 실패 지표와 디스크·DB 연결·마지막 백업 성공 시각을 관찰한다. 장애 알림 수신 담당은 1인 개발자, 24시간 의료 대응을 뜻하지 않는다. 초기 운영 rate limit은 DB 저장으로 재기동 때 사라지는 제한 우회를 피한다.

## 9. 전환·백업·롤백 실행안

### 구현 순서와 되돌릴 지점

| 실행 단계 | 작업/완료 증거 | 실패 시 복구 |
| --- | --- | --- |
| 3 | P0 실행 계약·계층 구분·현재 구현 실패 재현 | 기존 테스트 유지, 미구현은 BLOCKED로 분리 |
| 4 | Compose·Node24·Drizzle 스키마·합성 seed·clean/upgrade·백업 복원 | 새 일회용 환경만 폐기·재생성. 기존 Supabase/작업트리 보존 |
| 5 | Better Auth·서버 전용 서비스/저장소·세션/복구·교차 강사/승격 거절 | backend+auth 조합을 기존 버전으로 되돌림. 두 backend 동시 쓰기 금지 |
| 6~7 | 생성 원자성, 제출 정정·멱등성·경합·예외 주입 | 새 DB 트랜잭션 rollback, schema 변경은 다음 수정 migration으로 보완 |
| 8 | 해시 토큰·회수·재발급·공개 DTO, 생성→링크→제출→강사 확인 E2E | 신규 backend 사용 중지. 1단계 새 링크/수업404 실패도 이 흐름에서 회귀 확인 |
| 9 | 합성 복원/전환 리허설, 두 backend 결과 대조, 모바일·복구 시간 측정 | 깨끗한 별도 DB에 복원 후 검증. 현 DB 위에 blind restore 금지 |
| 10 | 운영 사용 전 승인, 메일·호스팅·보관/동의·지원 체계와 출시 게이트 확인 | 미통과면 파일럿 보류. 기술 READY와 운영 READY를 분리 |

### 데이터 유무에 따른 전환

- **실제 데이터 없음이 확인되면:** 새 빈 DB+검토된 migration으로 시작, 데모/테스트 계정은 재생성. 일반 ETL·CDC·이중 쓰기 시스템을 만들지 않는다. 원본 Supabase와 코드 snapshot은 보존.
- **데이터가 있거나 불명확하면:** 원본 접근 승인 전 추측해 폐기하지 않는다. 9단계에서 별도 승인된 읽기 전용 inventory/덤프·데이터 유무 확인이 선행. 실제 데이터가 있을 때만 작은 일회성 offline 변환을 작성한다.
- 데이터 있는 전환의 기본 순서: 변경 freeze → 원본 직접 Data API/RPC를 포함한 **모든 writer 차단** → 최종 백업 → 별도 대상 import → count/FK/시각/상태/checksum·교차 권한 검증 → 새 앱 읽기 전용 smoke → 승인 후 새 DB만 쓰기 허용. 기존 브라우저 SDK를 남긴 채 UI만 점검 모드로 바꾸는 것은 write freeze가 아니다.
- ID는 가능한 유지, auth user는 새 등록/이메일 검증·reset을 통해 연결하며 기존 비밀번호 해시·세션/JWT를 자동 이식하지 않는다. 기존 member link는 새 해시 형식과 검증 가능한 매핑이 있을 때만 임시 유지하고, 기본은 일괄 회수·재발급 안내. 원문 토큰을 import 로그에 남기지 않는다.
- 기존 개별 homework_logs는 제출 묶음을 확정할 정보가 없으면 임의 병합하지 않는다. 원본 dump를 보존하고, 필요할 때만 별도 읽기 전용 legacy 기록 변환/표시 규칙을 추가한다. 원본을 조용히 버리거나 새 정정 이력으로 위조하지 않는다. 그 매핑 확정은 실제 데이터 전환의 게이트이지 3단계 착수의 결정 공백이 아니다.

### 백업과 롤백

- 개발: 합성 seed 재현+원할 때 pg_dump custom 형식, 별도 일회용 DB pg_restore 검사. Docker volume 자체를 백업으로 부르지 않는다.
- 운영 목표: 매일 암호화 pg_dump(custom), 역할/GRANT·migration 이력·앱 revision·설정 설명도 보존. 같은 서버 밖 별도 저장소 복사, 키는 백업과 분리, 읽기·삭제 권한 최소화. 보관 기술 기본은 최근 7일 일별+4주 주별; 법적 정책/비용 승인은 실제 파일럿 전에 조정한다.
- 초기 복구 서비스 목표는 **RPO≤24시간, RTO≤4시간**이며 검증된 약속이 아니다. 매주 복원 smoke와 배포 전 새 DB 복원·역할·권한·쓰기 검사를 실시하고 9단계에서 실측한다. 목표 미달/데이터 손실 허용 불가이면 운영 시작을 보류하고 더 짧은 백업 또는 PITR을 추가한다. pg_dump는 WAL 기반 PITR 대체가 아니다. [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [PITR](https://www.postgresql.org/docs/18/continuous-archiving.html)
- schema는 expand→이행→나중 contract. 파괴적 contract는 이전 앱 롤백 기간이 끝난 뒤 별도 승인. migration은 단일 runner/lock, SQL 사전 검토·기록, 앱 기동 시 자동 실행 금지. DB major 업그레이드는 별도 리허설.
- 새 DB **쓰기 개방 전** 실패하면 새 앱을 내리고 검증한 원본 앱+auth+DB 조합으로 복귀할 수 있다. 새 DB **쓰기 개방 후**에는 오래된 Supabase로 URL만 되돌리지 않는다. 쓰기 차단→새 DB 백업→같은 새 DB와 호환되는 이전 앱 revision 또는 forward fix가 기본. 데이터 변환이 필요한 원본 복귀는 별도 대조·승인 전 금지.
- 복원 시 세션·reset 토큰·숙제 토큰이 과거 유효 상태로 부활할 수 있다. 네트워크 개방 전 auth 세션/verification 전부 폐기·재로그인, 숙제 링크 전부 회수·재발급 안내. 복원 후 멱등 request 이력과 업무 데이터가 같은 시점인지 확인하고 누락된 요청을 임의 재실행하지 않는다.
- 실제 백업 업로드·서버 구매·원본 권한 차단·운영 전환은 이 문서로 실행하지 않는다. Supabase 삭제는 파일럿 안정화·복구 증거와 사용자의 별도 파기 승인 모두 전에는 금지한다.

## 10. 실용성 검토와 판정

`homework-practical-review` 적용:

1. **확인된 사실:** [제품 기준](PRODUCT_BASELINE.md)은 원장 1계정·회원 무로그인이고, [1단계 결과](STAGE_1_LOCAL_DEMO_BASELINE.md)는 샘플 UI와 실제 저장을 구분했다. 현재 SDK·SQL은 §2 조사 근거와 같다.
2. **위험:** 추론상 1인 운영의 큰 부담은 계정/링크 복구와 백업 실패다. 링크 유출·중복 제출·DB 장애의 성공 오인은 회원 혼란과 지원 시간을 늘리므로 로그 최소화와 명시적 실패/정정이 필요하다.
3. **권장 결정:** 위 기술 선택을 구현 기준으로 확정한다. 원장 추가 입력은 늘리지 않고 연락처는 선택화하며, 새 링크 재발급의 기존 링크 무효 안내·최신 제출 표시·복원 알림을 같은 사용자 흐름으로 검증한다.
4. **이번 범위에서 뺄 것:** 코드 구현, 실제 데이터·배포·구매, 마이크로서비스·조직 기능·자동 카카오·일반 ETL·상시 이중 쓰기. 음성 코치/Pro 실험은 서비스 핵심 저장과 분리해 꺼도 기록 데이터가 유지되게 한다.
5. **검증 방법:** 3~9단계 합성 환경에서 실패 주입·동시성·두 강사·토큰 누출 검사·복원·실기기 E2E를 수행한다. 단계마다 관련 테스트→verify/build→diff→상태/핸드오프 순서를 따른다.

**판정: READY.** 인증·DB 도구·서버 책임·모델·토큰·멱등성·연결·전환/롤백의 구현 결정을 남기지 않았다. 질문은 0개다. 호스팅/메일 제공자 구매, 실제 데이터 유무 확인, 법적 정책, 복구 손실 허용의 운영 승인은 후속 파일럿/실이전 게이트이며 로컬 합성 구현을 막지 않는다.

문서 작성과 현재 회귀검사는 새 아키텍처의 구현 검증이 아니다. 2단계에서 앱·SQL·인증·패키지·환경변수 파일은 변경하지 않았다. 기존 48개 테스트·TypeScript·ESLint 및 build 통과, middleware 폐기 예정 경고 잔존. 활성 문서 9개 상대 링크 29개 오류 0, AGENTS 62줄 유지. 완료 시 1단계 manifest와 파일 해시를 대조해 비문서 변경이 없음을 검사했다. 과거 핸드오프는 당시 상태로 표시하고 현재 next=3으로 통일했다.
