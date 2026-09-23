# 피칭 P1 실행 기록

실행일: 2026-09-22 / 프로젝트: `C:\Users\tmd31\instructor-sync`

## 단계 0 — 상태·제출 경계

- 확인: dirty worktree와 기존 `AUTO_BUILD_STATE.md`, package, 관련 코드·테스트를 먼저 확인했다.
- 수정: `MemberHomeworkClient`에 동기 in-flight 잠금과 storage 실패 시 동일 페이지 재시도용 request ID 보존을 추가했다. `못 했어요` 후 동작 checkbox를 다시 선택할 수 있게 했다. 초안 복원 시 현재 숙제에 없는 동작 ID를 제거한다.
- 테스트: submission draft/feedback/voice coach targeted 38 passed; TypeScript와 변경 파일 lint passed.
- 상태: 구현됨·로컬 검증됨. 새로고침 후 storage 자체가 거부되는 환경의 복원은 브라우저 정책상 보장하지 않으며 보고서에 남긴다.

## 단계 1 — 의존성 취약점

- `npm audit --json`, `npm audit --omit=dev --json`, `npm explain next better-auth @supabase/supabase-js` 실행.
- 운영 범위 결과: critical 1, high 18, moderate 13, low 9. `next@16.2.2`의 critical/high advisory가 남아 있다.
- 자동 force fix나 대규모 업데이트는 하지 않았다. `docs/PITCH_DEPENDENCY_AUDIT.md`에 근거와 후속 조치를 기록했다.
- Vercel install 로그는 별도로 19건(critical 1, high 10, moderate 5, low 3)을 출력했다. 로컬 집계와 차이가 있어 해소로 해석하지 않았다.
- 상태: 감사됨·로컬 분류됨·운영 미해결. P1 release caution.

## 단계 2 — 수업 기록

- `tests/session-note.test.mjs`와 관련 homework assignment DB 회귀를 실행했다.
- 구조화 메모 round-trip, legacy 자유 메모 보존, malformed fallback, 숙제 snapshot/멱등성/소유권 회귀가 통과했다.
- 상태: 로컬 검증됨. 로그인 합성 회원의 새로고침·클릭 흐름은 이번 단계에서 별도 실환경 재실행하지 않았다.

## 단계 3 — 세트·무음 타이머

- `tests/voice-coach.test.mjs`, `tests/coach.test.mjs` 실행: 24개 타이머/오디오 fallback 시나리오와 코치 입력 테스트 통과.
- 최초 시작 전 정지, 휴식 후 수동 다음 세트, 좌우 전환, 일시정지·재개, 무음/오디오 실패 fallback을 로컬 fake timer로 확인했다.
- 상태: 로컬 검증됨. 실제 기기와 Kakao WebView는 미실행이다.

## 단계 4 — 운동 DB 1차

- 기존 catalog/provider/migration/snapshot을 재사용했다. DB published·draft·archived 검색/권한/버전/snapshot 회귀와 assignment DB 테스트 통과.
- 회원 화면이 현재 이름 fallback만 사용하던 누락을 수정해 저장된 snapshot의 media/alt/default cue를 우선하고 legacy에만 이름 fallback을 쓴다.
- `docs/EXERCISE_CONTENT_REVIEW.md`에 12개 draft 후보와 검토 항목을 기록했다. 검토 완료 0개, 신규 published 0개이며 운영 콘텐츠 migration은 실행하지 않았다.
- 상태: 기반 구현됨·로컬 검증됨·운영 적용된 새 콘텐츠 없음·검토/게시 대기.

## 단계 5 이후 시작점

최종 gate를 실행했다: `npx tsc --noEmit` PASS, `npm run verify` PASS (182 passed / 43 skipped / 0 failed), `npm run build` PASS.

기존 Vercel 프로젝트에만 배포했다. deployment `dpl_FVDYwx6ZuKny441RUU3kRZ1xkC9J`는 READY이며 `https://instructor-sync-three.vercel.app`에 alias 됐다. Production HTTP smoke는 landing 200, login 200, 비로그인 `/app` 307, 기존 공개 링크 200이었다.

로그인 합성 회원의 새 클릭 흐름, 물리 390px/Kakao WebView, 운동 콘텐츠 검토·게시, Next advisory 수정은 아직 실행하지 않았다. 의존성 critical advisory가 남아 있어 최종 판정은 조건부로 유지한다.
