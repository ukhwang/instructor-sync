# 숙제 v2 출시 마무리 — Luna 실행계획

작성: 2026-09-22. 이번 문서는 숙제 v2 마무리 전용이다. 현재 파일/Git/새 테스트 결과를 우선한다.

## 목표와 경계

강사 작성 → 공개 링크 → 세트 안내 → 회원 항목별 자기보고 → 최종 제출 → 강사 확인 → 같은 숙제 다시 내기를 연결한다.
이번에는 Supabase/Auth/Vercel 기존 프로젝트를 유지한다. docs/LATEST_HANDOFF.md의 9월 13일 자체 PostgreSQL 이전 단계로 넘어가지 않는다.
기존 미커밋/미추적/삭제 상태를 보존한다. 가격·Pro·회원 한도·인증·운동 콘텐츠 게시 정책은 변경하지 않는다.
운동 타이머 종료는 실제 수행 증거가 아니다. 자동 완료/자동 제출하지 않는다.

## 확인된 출발점

- lib/db.ts의 createHomework는 create_homework_v2를 호출한다. 운영에 RPC가 없으면 실패하므로 프론트만 먼저 배포하면 안 된다.
- 작성 UI에 목적·필수/선택·부담 시간, 요청 재시도 지원이 있다. 재구현하지 않는다.
- 20260921171403_homework_assignment_v2.sql 및 20260921173014_homework_submission_v2.sql과 로컬 DB 테스트가 있다. 운영 적용 여부는 이번 계획 작성 중 조회하지 않았다. 직전 보고는 미적용이다.
- MemberHomeworkClient.tsx는 여전히 complete/cant 및 구버전 submitHomeworkFeedbackRpc를 사용한다.
- VoiceCoachSession.tsx에는 ready 단계와 수동 세트 시작 버튼이 있다. 세트/휴식 타이머, 무음 fallback, 화면 숨김 시 일시정지가 구현돼 있다.
- lib/care-queue.ts는 partial을 처리하지만 lib/template.ts와 숙제 상세 로그 매핑은 추가 점검/보완이 필요하다.
- 재발급 원본 ID를 받는 생성 RPC는 있지만 사용자 재발급 진입점은 없다.
- 직전 실행 증거: verify 167 passed / 43 skipped / 0 failed, 타이머 테스트 16/16, TypeScript PASS. 이번 계획 작성에서는 테스트를 재실행하지 않았다. 현재 수정 후 build는 다시 필요하다.

## 실행 규칙

한 단계씩 구현하고 관련 테스트를 통과한 뒤 다음 단계로 이동한다. 전체 저장소/문서를 반복해서 읽지 않는다.
각 단계 종료 시 이 문서 맨 아래 실행 기록에 변경 파일·명령·결과·다음 시작점을 남긴다.
평범한 오류 수정은 계속한다. 권한 약화·파괴적 SQL·프로젝트 변경·secret 교체가 필요하면 해당 작업만 중단하고 근거를 기록한다.
DB 관련 작업 전 Supabase 및 Postgres 스킬과 데이터 무결성 문서를 읽는다. 운영 적용된 migration은 편집하지 않고 additive migration으로 보완한다.

## 0. 현재 상태와 계약 확인

읽을 것: git status --short --branch, AUTO_BUILD_STATE.md의 최근 항목, 관련 diff, 위 두 migration, lib/homework-assignment.ts, lib/types.ts, 공개 페이지/클라이언트, 현재 open_homework 정의.
공개 조회 응답에 item ID/순서/requirement/처방값이 실제 포함되는지 확인한다. TypeScript 타입만으로 있다고 간주하지 않는다. 누락 시 최소 공개 projection을 additive migration으로 보완한다. trainer 정보/내부 ledger/token을 새로 노출하지 않는다.
완료 조건: 조회→화면→제출→강사 조회의 필드/오류 매핑을 짧게 기록. 기존 API를 추측해 새 API를 만들지 않음.

## 1. 회원 제출 어댑터와 재시도 [P0]

대상: lib/db.ts, lib/types.ts, 필요한 작은 순수 helper와 tests/feedback-client.test.mjs 또는 별도 v2 테스트.

- submit_homework_feedback_v2의 실제 시그니처에 맞는 별도 typed wrapper 작성. completed item IDs, 불편함 1~10, 선택 메모, request UUID 전달.
- 서버가 반환하는 결과/오류를 보존. 통신 오류를 완료/데모 성공으로 바꾸지 않는다. v2 오류 때 v1로 자동 재제출하지 않는다.
- 동일 제출 재시도는 UUID와 payload 고정. 응답 유실 후 입력을 바꿔 다른 제출을 시도하지 않도록 pending payload를 보존하고 재확인/재시도 경로 제공.
- 새로고침 후 재시도 상태 복구. 저장소 접근 불가 시 페이지 내 재시도는 가능하게 하고 복구 한계를 명시. 저장소에 원문 token을 값/키로 추가 저장하지 않는다.
- 성공 시에만 pending 상태 제거. already_submitted면 기존 기록 재조회, request_conflict/만료/회수면 해당 안내.
- 데모를 유지할 경우 v2의 집계와 불변성에 맞춘다. 데모 성공을 실제 저장 검증으로 보고하지 않는다.

테스트: 정확한 RPC 인자, 빈 선택, 같은 요청 재시도, 응답 유실, RPC 거부/예외, 입력 보존, 저장소 실패.

## 2. 회원 공개 입력과 제출 완료 화면 [P0]

대상: app/h/[token]/MemberHomeworkClient.tsx, 필요 시 page.tsx, 전용 클라이언트 테스트.

- 운동 순서·이름·세트/횟수·필수/선택을 보여주고 각 운동에 실제 수행 체크를 제공한다. 초기 선택은 비어 있다.
- 필수 모두 수행=complete, 일부만 수행=partial, 아무것도 수행하지 않음=cant. 선택 운동만 수행한 경우 partial. 최종 판정은 서버와 일치해야 한다.
- 완전 미수행은 명시적인 '못 했어요' 선택으로 확인한다. 미입력 상태를 자동 미수행 제출로 해석하지 않는다.
- '필수 운동은 모두 했어요' 빠른 선택은 필수 항목만 체크하고 선택 항목 수행을 추정하지 않는다.
- 불편함/메모를 함께 최종 제출. 전송 중 중복 클릭 차단, 실패 시 입력 유지.
- partial을 제출 기록 찾기/완료 안내/재접속에도 반영한다. 단순 initialLogs.length로 최종 제출 여부를 오판하지 않도록 확인한다.
- 제출 완료 뒤 수정 불가와 실제 전달된 항목/메모를 표시한다. 타이머를 끝냈다는 이유로 체크하거나 제출하지 않는다.

테스트: 필수 1+선택 1의 네 가지 선택 조합, 필수 2 중 1개, 구형 requirement 없는 항목, 완료 후 재접속/수정 차단, 오류 재시도.

## 3. 세트 진행 마무리 [P0]

대상: VoiceCoachSession.tsx, 공개 진입 문구, tests/voice-coach.test.mjs.

- 기존 ready 구현을 보존. 첫 시작/다음 세트/다음 운동은 버튼으로 진행, hold는 초 카운트다운, reps는 횟수 안내, 휴식은 초 카운트다운.
- '음성 코치' 진입 문구가 기능을 충분히 설명하는지 확인하고 '세트 안내 시작'처럼 화면 안내임을 알 수 있게 한다.
- ready 중 일시정지/백그라운드 복귀 후 시작 버튼이 눌려도 멈춰 있는 혼란이 없는지 검증. 이어서/시작 버튼 중 어떤 행동이 필요한지 명확히 하고 이중 클릭에 중복 타이머가 생기지 않게 한다.
- 다음 운동(운동 2개 이상), 마지막 세트, 좌우 전환, 중간 종료, 긴 이름/설명에서 390px 높이·스크롤을 검사한다.
- 좌우 전환은 현재 3초 준비 후 같은 세트 오른쪽으로 이동하는 동작임을 표시. 이것을 다음 세트 자동 진행과 혼동하지 않게 한다.
- 종료는 회원 응답 폼으로만 이동. 세트별 실수행 이력 저장/타이머 수행률 산정은 추가하지 않는다.

완료 조건: 시간만 지나서는 다음 세트 시작/최종 제출이 일어나지 않음, 무음/일시정지/숨김 테스트 통과.

## 4. 강사 화면의 부분 수행 해석 [P0]

대상: app/app/homework/[id]/page.tsx, lib/template.ts, lib/care-queue.ts 및 해당 로그 소비 화면만 검색.

- partial 라벨은 '일부 수행'. 완료/못함과 구분하고 완료한 운동을 보여준다.
- 기존 수행률 분자 complete, 분모 유효 발행 숙제 기준을 유지하되 필수 완료 의미를 정확히 안내. partial을 전체 완료로 계산하지 않는다.
- 일부 수행을 미응답으로 표시하지 않는다. 상담 문장은 실제 제출 항목만 근거로 작성한다.
- 타이머 진행=운동 수행, 수행=건강 개선이라는 추정 금지.

테스트: 세 상태 표시, 부분 수행 케어 큐, 상담 요약에 수행하지 않은 항목/성과가 생성되지 않음.

## 5. 같은 숙제 다시 내기 [P1, 이번 범위 포함]

대상: 숙제 상세, app/app/homework/new/page.tsx, stores/homework-draft-store.ts, lib/homework-assignment.ts.

- 상세에 '같은 숙제 다시 내기' 진입점. 본인 회원/숙제만 조회하고 작성 화면에 항목·순서·처방·필수/선택·목적·이유·부담 시간을 초안으로 복사한다.
- 복사는 발행이 아니다. 수정/최종 발행 시 새 homework ID/token/request ID/만료값과 source_homework_id를 사용한다.
- 원본 숙제/제출/snapshot을 변경하거나 원본 token/멱등키를 재사용하지 않는다.
- URL/재렌더로 작성 중 직접 수정한 초안을 계속 덮어쓰지 않게 초기화 1회와 출처를 관리한다. 기존 작성 초안 충돌 시 사용자에게 선택권을 준다.
- 과거 카탈로그 버전이 보관/게시 취소된 경우 몰래 최신 버전으로 대체하거나 출처를 지우지 않는다. 현 생성 RPC가 거부하면 재선택하도록 구체적으로 안내한다.

테스트: 값 복사, 새 식별자, 원본 보존, 다른 강사 접근 거부, 반복 로딩/재시도, 기존 초안 보존, 보관된 운동 안내.

## 6. 로컬 출시 Gate [P0]

각 단계의 관련 테스트 후 마지막 코드 기준으로 순서대로 1회 실행:
1. npx tsc --noEmit
2. npm run verify
3. npm run build

skip은 PASS로 합산하지 않는다. SQL 테스트는 소유권/원자성/멱등성/만료·회수 token/불변 제출을 포함해야 한다. PGlite 결과를 운영 DB/실기기 결과로 부르지 않는다.
현재 파일에서 필요한 migration 순서와 영향, 데이터 삭제 없는 앱 롤백 경로를 기록한다. v2 제출 발생 후 구버전 UI로 되돌리면 partial 표시가 빠질 수 있으므로 호환 reader를 유지하는 롤백을 준비한다.

## 7. 운영 반영과 실환경 Gate [P0]

기존 세션의 배포·안전한 migration 승인이 이번 범위에도 유효한지 확인한다. 이미 유효한 명시적 승인이 있으면 재승인을 요구하지 않는다. 없으면 구현/Gate/적용 목록을 완성해 최종 운영 승인만 요청한다.

- 기존 Supabase 프로젝트 qqlztmckqvyhbbnqwoft와 기존 Vercel 연결을 확인. secret 값 출력 금지.
- 운영 migration 이력과 dry-run 비교. 계획 외 pending migration 발견 시 함께 적용하지 말고 원인 확인.
- 필요한 additive migration을 먼저 적용, RPC 시그니처/EXECUTE/RLS/open_homework projection 확인 후 앱 배포.
- Production URL은 https://instructor-sync-three.vercel.app 사용. 외부 프로젝트 생성 금지.
- 합성 회원과 서로 다른 신규 링크로 complete/partial/cant를 각각 검증. 고객 숙제를 소비하지 않는다.
- 로그인/비로그인 차단 → 작성 → 공개 링크 → 무음 세트 안내 → 제출 → 새로고침 → 재제출 차단 → 강사 상세/대시보드/케어 큐 → 다시 내기 → 원본 보존 확인.
- 390px 브라우저 레이아웃과 실제 Kakao/기기 검증을 구분한다. 실기기 접근 불가면 MANUAL CHECK REQUIRED.
- 토큰 원문/실회원 정보/비밀값을 보고서에 남기지 않는다.

## 이번 출시 이후로 분리할 작업

- 매일 자동 발행/하나의 링크로 날짜별 반복 제출/상시 루틴 일정: 현재 1회 불변 제출 계약과 별도의 데이터 설계가 필요. '다시 내기'로 구현됐다고 주장하지 않는다.
- 반복 주기별 부담량 합산·회원별 하루 필수량 상한: 현재 부담 시간 입력은 실제 자동 제한이 아님.
- G5 기간별 변화 그래프, G6 확인/다음 행동 이력, G7 CSV/복구 리허설: 이번 숙제 v2 완료와 별도 작업.
- 운동 DB 콘텐츠 검토·게시, 센터별 개인 운동 라이브러리: 기존 수동 운동 입력/검색과 별도 기능.
- 결제/가격/25명 권한: 미확정 정책 변경 금지.

## 최종 보고와 인수인계

docs/HOMEWORK_V2_COMPLETION_REPORT.md에 항목별 구현됨/로컬 검증됨/운영 적용됨/실환경 검증됨을 따로 기록한다.
테스트 명령/통과·실패·skip 수, migration 운영 상태, 배포 URL, smoke 증거, 미실행 검증, 남은 P0/P1을 적는다.
AUTO_BUILD_STATE.md 및 LATEST_HANDOFF.md에는 이번 숙제 v2 상태를 날짜와 함께 추가하되 과거 작업 기록을 지우지 않는다.
완료 조건: 단계 1~5 구현과 단계 6 PASS, 운영 승인이 있는 경우 단계 7까지 완료. 접근 차단/실기기 미확인은 완료로 표시하지 않는다.

## 실행 기록

- 2026-09-22: 단계 0 완료. 현재 dirty worktree, 공개 RPC/응답, v2 migration, 관련 클라이언트와 상세 화면을 확인했다. `open_homework` 응답에 `requirement`이 없어 additive projection migration을 추가했다. Supabase CLI가 설치되지 않았고 `npx supabase`는 npm 캐시 EPERM으로 실행하지 못해 운영 적용 상태는 미확인으로 남겼다.
- 2026-09-22: 단계 1 완료. `submitHomeworkFeedbackV2Rpc`와 request UUID/항목 정규화/오류 보존/데모 fallback을 추가했다. RPC 인자와 거부 테스트를 추가했다.
- 2026-09-22: 단계 2 완료. 회원 공개 화면에서 항목별 수행 체크, 필수 동작 일괄 선택, 못 했어요, 불편함/메모, 제출 중 중복 방지와 sessionStorage 기반 동일 payload 재시도를 연결했다. v2 RPC가 없는 운영 환경에서는 성공으로 위장하지 않는다.
- 2026-09-22: 단계 3 완료. 기존 `VoiceCoachSession` ready 단계와 수동 세트/다음 동작 버튼을 보존·검증했다. 첫 세트/휴식 뒤/0초 휴식 뒤 자동 진행하지 않으며 무음 화면 타이머를 유지한다.
- 2026-09-22: 단계 4 완료. 강사 숙제 상세에 `일부 수행`과 회원이 선택한 동작을 표시하고, 상담 opening line이 partial을 근거 없이 완료로 표현하지 않게 보완했다.
- 2026-09-22: 단계 5 완료. 숙제 상세에 `같은 숙제 다시 내기`를 추가하고 source homework를 초안으로 복사한다. 발행 시 새 token/request ID와 source_homework_id를 사용하고 원본을 보존한다.
- 2026-09-22: 단계 6 완료. `npx tsc --noEmit` PASS; `npm run verify` PASS (170 passed / 43 skipped / 0 failed, 기존 unused-variable warning 1건); `npm run build` PASS. 관련 DB/클라이언트/타이머 테스트는 PASS.
- 2026-09-22: 단계 7 부분 완료. CLI 인증을 확인하고 기존 프로젝트 `qqlztmckqvyhbbnqwoft`에 dry-run으로 확인한 additive migration 3개를 적용했다. 원격 migration list가 세 파일 모두 적용됨을 확인했고, 새 테이블 RLS와 v2/create/open RPC 권한·`search_path`를 읽기 전용 SQL로 확인했다. 기존 Vercel 프로젝트에 Production 배포하여 `Ready` 및 기존 alias를 확인했다. HTTP smoke는 landing/login 200, 비로그인 `/app` 및 작성 경로 307, 공개 링크 200이며 공개 `open_homework` RPC가 `requirement`을 반환함을 확인했다. 로그인된 항목별 제출 클릭, 실제 390px/Kakao 기기 검증은 아직 수행하지 않았다. 다음 시작점: 로그인 합성 회원으로 complete/partial/cant 제출과 재시도를 실행한다.
