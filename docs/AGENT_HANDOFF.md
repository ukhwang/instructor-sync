# 운동숙제 LOW-USAGE 체크포인트

기준일 2026-09-13. 브랜치 `main`, HEAD `d30925bd437e504d64a514e533a5986e46f54829`. 작업트리는 과거 강의 앱 삭제와 운동숙제 코드·문서가 섞인 대규모 미커밋 상태이며 index는 비어 있다. stage all·일괄 커밋·reset·기존 변경 삭제 금지.

## 단계·복구 상태

- 0 작업환경, 1 로컬 데모, 2 PostgreSQL ADR, 3 P0 계약, **4 로컬 PostgreSQL 기반·스키마: DONE**.
- 다음은 5 인증·서버 전용 접근이며 NOT_STARTED. 첫 구현은 소유권·권한 격리 P0 하나만 다룬다.
- stage4 전 복구 ZIP: `C:/Users/tmd31/.codex/visualizations/2026/09/12/01a093c4-d507-7a61-affa-0e3b0264e203/instructor-sync-pre-stage4-2026-09-13/`; 90파일, SHA-256 `facc3ef20cdfc457fd7bc1f0adf5855b17658d6f46f11a54ad462a7f05eab789`.
- PostgreSQL 합성 로컬 기반은 `infra/postgres/`; 앱·DB 접근·인증 코드는 4단계에서 변경하지 않았다.

## 검증 증거

- 3단계 신규 41개: PASS3 / 재현 P0 실패8 / 미구현 차단30. 기존 테스트48개 PASS 유지.
- Docker Engine client/server 29.8.0, Compose5.5.1. dev/test/restore는 `127.0.0.1:55432/55433/55434`와 전용 volume.
- clean apply PASS; 0000→0001 upgrade 전후 지문 `e770d1…d6e7`·행 수 동일.
- 실제 PostgreSQL 스키마 무결성 dev 11/11, restore 11/11 PASS.
- backup 71,542 bytes, SHA-256 `5246dcaa8399936e58d3b37d9ae989235c5445aa22907e2d613d7dde02938fed`; 별도 DB restore 지문 일치.
- 최종 `npm run verify` 오류0, `npm run build` PASS. DB env 미지정 verify에서는 전용 DB 테스트12개를 skip하며 실제 DB 통과로 세지 않는다.
- 상세 결과: `docs/P0_VERIFICATION_MATRIX.md`; 명령: `infra/postgres/README.md`.

## 남은 P0 우선순위와 최소 수정점

1. 교차 강사 접근·자기 권한 승격: 계약 `OWN-members/homeworks/submissions/feedback`, `AUTH-escalation`; 관련 `contracts/p0-cases.mjs`, 향후 Route Handler/service/repository. DB 복합 FK는 구현됨. 최소 다음 수정은 강사 A/B 인증 context와 service ownership 조회 한 경계.
2. 숙제 생성 원자성: `ATOMIC-homework_insert/exercise_insert_2`; 관련 현행 `lib/db.ts#createHomework`, 신규 `app.homeworks/app.homework_exercises`. 최소 수정은 서버 service의 단일 transaction.
3. 제출 멱등성·후속/정정: `IDEM-retry/followup`, `HISTORY-correction`; 신규 `app.write_requests/submissions`. 스키마 제약은 구현됨. 최소 수정은 request receipt와 제출 transaction 한 경계.
4. 토큰·장애 의미: `TOKEN-*`, `ERROR-outage`; 최소 수정은 해시 조회 service와 DB_UNAVAILABLE→503 경계. 공개 오류에는 토큰 상태를 노출하지 않는다.

현행 재현 실패 8개는 `contracts/legacy-p0.mjs`: `LEGACY-OWN-parent`, `PRIV`, `IDEM`, `INPUT-name`, `INPUT-remaining`, `INPUT-order`, `ATOMIC`, `OUTAGE`. 4단계 DB 제약으로 parent/name/remaining/order/원자 기반은 생겼지만 앱·서버 계약 테스트가 아직 차단되어 P0 전체 해소로 표시하지 않는다.

## 절대 보호 경계

- 실제 회원/앱 DB, `.env.local`과 기존 환경변수, Supabase URL/key/Auth/RLS/RPC/migration을 변경·삭제·접속하지 않는다.
- 기존 Supabase 파기·이중 쓰기·외부 업로드·운영 배포 금지.
- 기존 Docker 자원·system package 제거 금지. 운동숙제 합성 전용 자원만 사용.

## LOW-USAGE

한 번에 P0 하나, 필요한 파일만, 최소 diff, 관련 테스트만 실행한다. 전체 verify/build는 모든 P0 수정 후 한 번, 문서 갱신도 최종 한 번. 로그 전문·전체 재탐색·불필요한 리팩터링 금지. 한 작업 성공 시 10줄 이내 보고 후 STOP.
