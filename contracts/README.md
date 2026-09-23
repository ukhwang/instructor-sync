# P0 실행 계약

`p0-cases.mjs`는 목표 PostgreSQL의 수용 조건이다. 현재 구현을 복제한 참조 모델이 아니며 mock 서비스로 통과 처리하지 않는다. `legacy-p0.mjs`는 기존 Supabase 구현에 같은 위험이 존재하는지 별도로 재현하는 진단용 red suite다. 기존 회귀 테스트 파일과 명령은 그대로 유지한다.

## 실행과 판정

- `npm run test:p0`: 30개 목표 계약 + 2개 현재 소스 경계 검사. 미구현 adapter는 SKIP 메시지에 BLOCKED를 명시하고 통과 수에서 제외한다.
- `npm run test:p0:legacy`: 8개 현재 구현 진단. 예상 P0 실패라도 실제 assertion failure/exit 1을 유지한다. 기존 `verify`에서 이 실패를 숨긴 것이 아니라 신규 별도 진단이다. 출시 판정 시 별도로 반드시 읽는다.
- `npm run verify`: 기존 회귀와 새 기본 검사. 통과해도 BLOCKED/P0가 해소된 것은 아니다.
- `npm run build` 후 `npm run test:p0:bundle`: 실제 browser chunk에서 관리자 비밀/DB URL 검사. 빌드에는 `SUPABASE_SERVICE_ROLE_KEY`, `MIGRATION_DATABASE_URL`, `BETTER_AUTH_SECRET`에 `secret-scan.mjs`의 합성 canary를 프로세스 단위로 주입한다. `.env.local`은 수정하지 않는다.
- 엄격한 목표 게이트(PowerShell): `$env:P0_REQUIRE_RUNTIME='1'; npm run test:p0`. adapter 부재 시 실제 실패해야 한다. 일반 실행을 다시 할 때 `Remove-Item Env:P0_REQUIRE_RUNTIME`.

실패 종류는 assertion이 실행된 `FAILED`, 구현/환경 미존재로 assertion을 실행하지 못한 `BLOCKED`로 나눈다. TAP의 `ok ... # SKIP`는 PASS가 아니다. 릴리스 통과에는 BLOCKED=0도 필요하다.

## 실제 adapter 구현 계약 (4~8단계)

`postgres-adapter.mjs`의 `createFixture(layer, scenarioId)`가 fixture를 반환하도록 연결한다. 현재 파일은 의도적으로 없으며 빈 stub을 추가하지 않는다. adapter 오류를 catch해 SKIP으로 바꾸지 않는다. 모든 fixture는 다음을 보장한다.

- unit: 실제 입력 validator에 아래 잘못된 payload를 전달. DB 연결 불필요.
- integration: **실제 일회용 PostgreSQL과 실제 서비스/저장소**를 호출. 별도 연결에서 commit 결과를 관찰하고, 동시 재시도는 최소 2개 독립 연결. SQL 무결성 검사는 서버 validator를 우회한다.
- E2E: 실제 Next.js HTTP 경계와 실제 DB 세션 사용. 소유권 서비스 테스트를 반복하는 대신 HTTP 인증·입력 승격·오류/DTO 매핑을 검사. UI 실기기 검증과는 별개다.
- 합성 A/B 각각 활성·검증 계정, 회원·숙제·제출·feedback를 준비한다. 토큰은 정상/변조/만료/회수 각각 분리하고 만료는 DB 시각으로 제어한다. `ids.B`는 실제 UUID다. 결과/receipt는 원문 토큰·메모를 포함하지 않는다.
- 테스트마다 격리 DB 또는 rollback 가능한 fixture를 사용한다. `close()`가 연결·실패 주입을 해제한다. 외부 호스트/개발 DB/실데이터는 차단. reset/삭제는 명시적 disposable 이름 allowlist 확인 뒤에만 허용한다.
- `snapshot()`은 해당 fixture의 업무 행·feedback·요약·write_requests를 정렬·직렬화한다. 실패 주입 도구의 메타데이터는 제외한다. 정상 A/B 조회 성공을 먼저 보장해 무조건 거절 구현이 PASS하지 않게 한다.

### 메서드와 입력 의미

| 메서드 | 실제 구현에 연결할 의미 |
| --- | --- |
| `read/update(ctx,resource,id,patch)` | 인증된 서비스. 다른 소유자는 NOT_FOUND, 본인에 허용되는 변경만. 제출/feedback 원행 수정은 허용하지 않고 정정으로 연결 |
| `validPatch(resource)`, `validHomework(n=1)` | 소유권 외 원인으로 실패하지 않는 합성 요청. homework 기본 member는 A, items는 순번 1..n, UUID requestId/신규 aggregate 포함 |
| `createHomework(ctx,payload)` | 실제 생성 트랜잭션. 반환 후 별도 연결에서 검증 |
| `injectFailure(point)` | disposable DB의 AFTER INSERT 실패 trigger 등. 본문/2번째 동작/feedback 시점에서 실제 DB 예외. helper 자체 실패를 제품 실패로 기록하지 않음 |
| `validSubmission()` | 동일 호출을 재시도할 때 같은 requestId·performedAt·kind=complete·hasPain·note를 유지 |
| `submit(token,body)`, `bundleCounts()` | 실제 제출 서비스. fixture 생성분 제외하고 새 submissions/feedback/receipt 건수를 집계 |
| `submissions()`, `readSubmission(id)` | 관찰 시간/수신 순서가 명시된 행 조회. correction 이전 원행 byte/필드 보존 |
| `correct(token,id,body)` | supersedesId를 가진 새 버전 append. 원 observationId/performedAt 유지. stale version 거절 |
| `resolveToken`, `revoke` | 최소 capability 판정/강사 회수 서비스, 서버 시각 검사. 정상·누락·변조·만료·회수 내부 코드는 서로 구분 |
| `validate(case)` | 실제 Zod 등 호출 결과. name 공백/101자, items 0/4개·[1,1]·[1,3], remaining -1/total+1을 거절; 올바른 입력 통과. 잘못된 이름은 member/exercise 모두 검사 |
| `directInvalidWrite(case)` | SQL로 같은 제약을 우회 시도하고 COMMIT까지 수행. cross-trainer composite FK, zero-items 지연 constraint 포함 |
| `trainerEndpointInventory()` | 실제 Route Handler 파일에서 모든 강사 endpoint/method를 수집해 테스트 payload와 대조. 수동 allowlist만으로 빠진 endpoint를 PASS 처리하지 않음 |
| `http`, `forgePrivilege`, `publicRead` | 실제 loopback HTTP, 인증 쿠키 사용. DTO는 camelCase 계약, forbidden 필드명은 snake/camel 변형도 모두 검사 |
| `disconnectDatabase`, `databaseEndpointInventory` | 해당 테스트 앱의 DB 연결만 고장 내고 모든 데이터 경로가 503인지 확인. 타 DB 중지 금지 |
| `privilegeSnapshot` | 기존 권한과 신규 가입 결과를 모두 관찰. signup metadata 승격도 거절하고 상태 불변 확인 |

이 계약의 typed 도메인 오류는 `code`를 가진다. HTTP와 섞지 않는다. 권한 없는 다른 소유자와 없는 ID는 같은 외부 오류, DB 장애는 503, 무인증은 401. 토큰 상태를 내부에서 구분하되 공개 링크 오류 본문은 존재 유출을 줄이는 동일 안내다.
