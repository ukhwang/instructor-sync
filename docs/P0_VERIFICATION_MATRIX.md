# P0 데이터 안전성 검사표 — 3·4단계

## 4단계 실제 PostgreSQL 검증 (2026-09-13)

판정: **PASS / 일회용 로컬 환경 검증됨**. 기존 앱 DB·환경변수·Supabase에는 접속하거나 변경하지 않았다.

| 순서 | 대상·증거 | 최종 결과 | 실패·보정 기록 |
| --- | --- | --- | --- |
| 1 | Docker Engine client/server 29.8.0, Compose 5.5.1, daemon 동작 | PASS | WSL 호출이 끝나면 컨테이너가 정상 종료되는 환경이므로 각 검증 호출에서 프로젝트 컨테이너를 명시적으로 시작 |
| 2 | clean apply: `homework-stage4-dev-db-1`, `127.0.0.1:55432`, 빈 전용 volume에 migration 0000·0001 및 합성 seed | PASS: migration 2, 대표 지문 생성 | 증거 출력이 없던 첫 seed 뒤 재실행은 PK 23505로 거절되고 트랜잭션이 유지됨. 이후 행 수·지문으로 최초 seed 성공 확인 |
| 3 | upgrade: test DB에 0000+대표 seed 후 0001 적용 | PASS: 적용 전후 SHA-256 `e770d1cbf5bceed3baf4064e51030a46be6f5e513ee1dbff32279e3c7b48d6e7`, 행 수 동일 | 중지된 컨테이너에 대한 최초 연결은 `ECONNREFUSED`; 재시작 뒤 동일 절차 성공, 실패 호출은 데이터 변경 없음 |
| 4 | [schema-integrity.test.mjs](../infra/postgres/schema-integrity.test.mjs) | PASS 11 / FAIL 0: 소유권·CHECK·1~3 연속 항목·원자 롤백·토큰·정정 lineage·멱등키·최소 권한·인덱스 | 최초 단일 부모 test 구조는 완료 위치를 식별하지 못해 독립 test 11개로 분리 후 실제 DB 통과 |
| 5 | `pg_dump -Fc --no-owner` 백업 및 `pg_restore --list` | PASS: `.local/stage4-homework-dev.dump`, 71,542 bytes, SHA-256 `5246dcaa8399936e58d3b37d9ae989235c5445aa22907e2d613d7dde02938fed` | 비밀·원문 토큰은 출력하지 않았고 파일은 Git 제외 |
| 6 | 별도 `homework-stage4-restore-db-1`, 별도 volume, `127.0.0.1:55434`에 `pg_restore --exit-on-error --no-owner` | PASS: migration 2, 지문 `match:true`, 행 수 2/2/2/1/2/1/1/1/1, 복원 DB 무결성 11/11 | DB 전역 객체인 NOLOGIN 역할 2개는 빈 대상에 선생성한 뒤 DB dump 복원 |
| 7 | `npm run verify`, `npm run build` | PASS: verify 오류 0, build 성공 | 최초 verify는 DB 대상 env 없이 전용 test를 수집해 2건 실패. 기본 실행에서는 해당 12개를 명시적 skip하고 전용 DB 명령에서 실행하도록 수정 후 재통과 |

Migration 식별자: `0000_fine_taskmaster`, `0001_integrity-contracts`. 실제 DB용 테스트 명령은 `HW_PG_DATABASE`와 `HW_PG_PORT`를 명시해야 하며, 미지정 `verify`의 skip은 실제 DB PASS 증거가 아니다. 개발·테스트·복원 컨테이너/volume은 모두 `com.homework.scope=synthetic-local-only`이고 포트는 각각 `127.0.0.1:55432/55433/55434`다. 명령과 복구 절차는 [로컬 PostgreSQL runbook](../infra/postgres/README.md)에 있다.

## 3단계 당시 계약 결과

2026-09-13 / **계약 구축 DONE, 데이터 안전성 미달**. 2단계 DONE을 확인하고 수행했다. 실제 신규 PostgreSQL·서버 구현은 아직 없다. 일반 `verify` 성공은 P0 해소 판정이 아니다.

## 결과와 실행

신규 **41개** = 실행 계약 30 + 소스/번들 검사 3 + 레거시 실패 재현 8. **PASS 3 / FAILED 8 / BLOCKED 30**. 기존 테스트 48개는 수정·삭제 없이 전부 PASS. 재실행 횟수/엄격 모드 실행을 새 테스트 수에 더하지 않는다.

| 명령 | 실제 결과 | 의미 |
| --- | --- | --- |
| `npm run test:p0` | PASS 2, SKIP/BLOCKED 30, exit 0 | 소스 경계 검사만 성공. 목표 adapter 부재는 미검증 |
| `npm run test:p0:legacy` | FAILED 8, exit 1 | 원하는 불변조건을 그대로 assertion. 현행 구현 미충족 재현 |
| `npm run verify` | PASS 50(기존48+새2), BLOCKED 30; 타입·린트 성공, exit 0 | 기존 회귀 보존. 새 DB 성공 아님 |
| `npm run build` | PASS, exit 0 | Node20 기존 앱 빌드. 목표 Node24 검증 아님 |
| `npm run test:p0:bundle` | PASS 1, exit 0 | 이번 빌드의 client chunks에 관리자 비밀/합성 canary 없음 |
| `P0_REQUIRE_RUNTIME=1`로 `npm run test:p0` | PASS 2, 환경 미존재 실패 30, exit 1 | 미구현을 release PASS로 간주하지 않는 fail-closed 확인. 제품 assertion 실패 8건과 혼합하지 않음 |

명령의 PowerShell 환경 설정·adapter 계약은 [contracts/README](../contracts/README.md). 외부 DB 대신 닫힌 `127.0.0.1:9`, 명시적 demo flag, 합성 관리자 canary를 **해당 검사 프로세스에만** 주입했다. `.env.local`·기존 Supabase 설정은 수정하지 않았다. PGlite는 합성 메모리 DB이며 Docker/실 PostgreSQL/운영 RLS 검증으로 표시하지 않는다. middleware 폐기 예정 경고는 기존 항목이다.

## 계층별 단일 매핑

| 불변조건 | 계약 ID / 파일 | 현재 결과·후속 게이트 |
| --- | --- | --- |
| A가 B 회원·숙제·제출·피드백 읽기/수정 거절 | `OWN-members/homeworks/submissions/feedback`, [목표 계약](../contracts/p0-cases.mjs) | 4개 BLOCKED: 5단계 실제 인증 context/서비스·실DB 필요 |
| A가 B 회원에 숙제 생성 불가 | `OWN-parent` | BLOCKED; 현행 실패 LEGACY-OWN-parent |
| 본문 또는 두 번째 동작 실패 시 전체 rollback | `ATOMIC-homework_insert/exercise_insert_2` | 2개 BLOCKED; 현행 부분 저장 실패 LEGACY-ATOMIC |
| 제출·통증·메모·요약·receipt 원자성 | `ATOMIC-feedback` | BLOCKED; 기존 SQL 원자성 tests는 이미 PASS이며 삭제/중복 복제하지 않음. 새 구조에는 feedback/receipt 추가 원자 경계가 필요 |
| 같은 key 순차/동시 재시도 한 묶음, 다른 payload 충돌 | `IDEM-retry` | BLOCKED; 현행 중복 실패 LEGACY-IDEM |
| 새 key·수행 시각은 독립 후속 관찰 | `IDEM-followup` | BLOCKED; 정정으로 강제 병합 금지 |
| 정정은 원 observation/시각/원본 관계 보존, stale 정정 거절 | `HISTORY-correction` | BLOCKED |
| 정상·누락·변조·만료·회수 토큰 + 회수 뒤 receipt 재조회 | `TOKEN-normal/missing/tampered/expired/revoked/replay-after-revoke` | 6개 BLOCKED; 내부 이유 구분, 공개 안내 최소화 |
| 이름·개수·순서·잔여 횟수 검증 | `INPUT-*` | 8개 unit BLOCKED: 실제 validator 미구현. SDK mock 유효성으로 대체하지 않음 |
| 서버 validation을 우회한 SQL 제약 | `DB-constraints` | 1개 integration BLOCKED: 4단계 commit까지 실제 제약 검사. unit과 달리 DB 우회를 검사 |
| 강사 endpoint 무인증 거절 | `AUTH-no-session` | E2E BLOCKED: 실제 Route Handler 목록·세션 필요 |
| 자기 Pro/admin/active/trainer 권한 승격 거절 | `AUTH-escalation` | E2E BLOCKED; 현행 Pro 실패 LEGACY-PRIV |
| DB 장애를 빈 목록/데모/404로 숨기지 않음 | `ERROR-outage` | E2E BLOCKED; 현행 실패 LEGACY-OUTAGE |
| 공개 HTTP 최소 DTO·캐시/리퍼러·오류 매핑 | `TOKEN-public-minimum` | E2E BLOCKED; 위 토큰 판정 단위와 HTTP 공개 범위는 다른 책임 |
| 공개 env·클라이언트 import에 관리자 비밀 접근 없음 | `SECRET-public-env/client-import`, [소스 검사](../tests/p0-secrets.test.mjs) | 2개 PASS. 정적 검사 한계: 동적 import/계산된 env 접근 등은 실제 번들 검사로 보완 |
| 실제 client bundle의 비밀 없음 | `SECRET-bundle`, [번들 검사](../contracts/bundle-secrets.mjs) | 1개 PASS. 서버 chunk는 server secret을 포함할 수 있으므로 client static만 검사 |

## 실행된 현행 실패 — 원인별

[legacy-p0.mjs](../contracts/legacy-p0.mjs)는 현재 SQL/TS를 직접 읽는다. 실 Supabase의 적용 상태·공격 성공을 주장하지 않는다. 각 케이스마다 트랜잭션을 rollback해 다른 케이스와 분리한다.

| ID | 관찰 결과 | 원인·다음 구현 입력 |
| --- | --- | --- |
| LEGACY-OWN-parent | authenticated A INSERT가 B 회원 FK로 성공 | trainer/member 복합 FK + 서버 context 필요. PGlite는 관리형 Supabase 기본 table grants만 명시 모형화, RLS는 실제 migration 사용 |
| LEGACY-PRIV | 자기 프로필 is_pro가 false→true | 일반 사용자 수정 필드 whitelist + 관리 권한 분리 |
| LEGACY-IDEM | 같은 requestId로 2번 호출 시 complete 로그 2개 | 현재 wrapper/RPC가 key·performedAt을 사용하지 않음. write_requests UNIQUE와 제출 트랜잭션 필요 |
| LEGACY-INPUT-name | 공백 이름 UPDATE 성공 | 이름 길이/trim CHECK·validator 필요 |
| LEGACY-INPUT-remaining | 잔여 -1 UPDATE 성공 | 0..package_total CHECK 필요 |
| LEGACY-INPUT-order | 순번1 동작 2개 INSERT 성공 | 부모+순번 UNIQUE와 연속 1..n commit 조건 필요 |
| LEGACY-ATOMIC | 동작 실패 예외 뒤 body insert 1회 남음 | 실제 `createHomework`를 SDK 실패 모형으로 실행. 별개 insert 두 번의 비원자 경계 증거; 실 네트워크 트랜잭션 검증 아님 |
| LEGACY-OUTAGE | DB 예외에도 getMembers가 [] 반환 | 서비스 DB_UNAVAILABLE와 HTTP503로 명시 전파 |

최초 순번 fixture에서 reps 누락으로 **fixture의 기존 CHECK 실패**가 발생했다. reps=10으로 fixture만 수정 후 재실행해 의도한 중복 순번 허용 실패를 확인했다. 이 초기 도구/fixture 오류는 제품 P0 수에 포함하지 않는다.

가장 먼저 해소할 P0: **소유권/권한 경계(교차 강사·자기 승격) → 숙제 생성 원자성 → 제출 멱등성/후속·정정 구분**. 입력 CHECK와 명시적 장애 전파도 파일럿 전에 필수다.

## 보존·환경·다음 단계

- 착수 전 전체 로컬 소스 스냅샷: `C:/Users/tmd31/.codex/visualizations/2026/09/12/01a093c4-d507-7a61-affa-0e3b0264e203/instructor-sync-pre-stage3-2026-09-13/`.
- `workspace.zip` SHA256 `928b4d8d1bf816fe98b2927d490399181f0acc41c09c7e3284f23221c8c0c7a8`, 82개 파일을 압축에서 읽어 해시 대조. manifest에 HEAD·기존 삭제/미추적 상태, patch와 복구 설명 보존. 비밀값·의존성·빌드 제외, 실제 DB backup 아님.
- 사용자 변경과 과거 강의 앱 삭제는 유지. 이번 변경은 테스트/계약·npm 실행 script·관련 문서뿐이다. 앱/인증/기존SQL/lockfile/환경변수는 수정하지 않음. 커밋 범위가 섞여 커밋하지 않음.
- 최종 보존 감사: 기존82개 중 허가된6개 변경/76개 동일, 새8개, 삭제0, 기존 Git 삭제 상태·HEAD·빈 index 유지. 상대 문서 링크42개 오류0, diff/새 파일 공백 오류0.
- Windows/Ubuntu WSL 모두 Docker·Compose·psql·pg_dump 미설치. WSL Ubuntu24.04.3/systemd 확인. 사용자가 공식 Docker apt 저장소 설치를 허용했지만 사전 검사에서 `sudo -n true` → `sudo: a password is required`로 중단했다. WSL root로 우회하지 않았다. 설치/저장소 추가/시스템 패키지 변경/컨테이너·볼륨·DB 생성 모두 미수행.
- 3단계 DONE의 의미는 **실행 계약과 실패 입력 확보**다. 다음 4단계는 설치 권한 문제로 BLOCKED, 5단계는 선행 완료 전이므로 NOT_STARTED. 사용자가 WSL에서 sudo 설치를 직접 수행하거나 추가 권한을 명시적으로 제공한 뒤 4단계를 재개한다. 비밀번호를 채팅으로 받지 않는다.
