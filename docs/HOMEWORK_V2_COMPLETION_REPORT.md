# 숙제 v2 실행 보고서

점검일: 2026-09-22  
프로젝트: `C:\Users\tmd31\instructor-sync`  
운영 URL: https://instructor-sync-three.vercel.app

## 상태

판정: **CONDITIONALLY READY — 운영 반영 완료, 회원 실사용 클릭 검증 일부 남음**

이번 작업은 기존 작업 트리를 보존한 채 공개 숙제 제출 v2와 세트 진행 UX를 연결했다. 운영 migration 3개 적용과 기존 Vercel 프로젝트 배포까지 완료했으며, 실제 로그인 세션을 사용한 항목별 제출 클릭과 실기기 검증은 별도로 남겼다.

## 단계별 결과

| 단계 | 결과 | 근거 |
|---|---|---|
| 0. 계약 확인 | 구현됨·로컬 검증됨 | 공개 응답을 확인하고 `requirement` 공개 projection additive migration 추가 |
| 1. 제출 어댑터 | 구현됨·로컬 검증됨 | `submitHomeworkFeedbackV2Rpc`, UUID 재시도, 오류 보존 |
| 2. 회원 입력 | 구현됨·로컬 검증됨 | 필수/선택 체크, complete/partial/cant 판정, 메모·불편함 제출 |
| 3. 세트 진행 | 구현됨·로컬 검증됨 | 수동 세트 시작, 휴식 후 대기, 무음 화면 타이머 |
| 4. 강사 해석 | 구현됨·로컬 검증됨 | 일부 수행 표시, 수행 항목, 자연스러운 opening line |
| 5. 다시 내기 | 구현됨·로컬 검증됨 | 원본 초안 복사, 새 token/request ID, source_homework_id |
| 6. 로컬 Gate | PASS | TypeScript / Verify / Build |
| 7. 운영 Gate | 운영 적용됨·HTTP 실환경 검증됨 | migration 3개 적용, Vercel Ready, 주요 HTTP smoke |

## 변경된 주요 파일

- `app/h/[token]/MemberHomeworkClient.tsx`
- `app/h/[token]/VoiceCoachSession.tsx`
- `app/app/homework/[id]/page.tsx`
- `app/app/homework/new/page.tsx`
- `lib/db.ts`
- `lib/template.ts`
- `lib/types.ts`
- `stores/homework-draft-store.ts`
- `supabase/migrations/20260922100000_homework_public_item_requirements.sql`
- `tests/feedback-client.test.mjs`

## 품질 결과

- `npx tsc --noEmit`: PASS
- `npm run verify`: PASS — 170 passed / 43 skipped / 0 failed
- `npm run build`: PASS
- v2 DB 테스트: PASS — 기존 v2 security/atomicity/idempotency suite
- 세트 진행 테스트: PASS — 16/16
- 기존 lint warning: `infra/postgres/schema-integrity.test.mjs`의 미사용 변수 1건

## 운영·실환경 상태

- 신규 additive migration: 운영 적용됨 (`20260921171403`, `20260921173014`, `20260922100000`)
- 기존 Supabase 프로젝트: 유지, 새 테이블 RLS 및 v2/create/open RPC 권한·빈 `search_path` 확인
- Vercel: 기존 프로젝트 Production 배포 완료, 기존 alias 유지
- Production HTTP: landing/login 200, 비로그인 `/app`·작성 경로 307, 공개 링크 200
- Production 공개 `open_homework` RPC: known public token read returned `success=true`, one item, `requirement=required` (token/value 자체는 보고서에 기록하지 않음)
- Production 공개 제출 v2: 로그인 세션으로 항목 선택·submit 클릭은 미실행
- 390px 실기기/Kakao in-app browser: 검증하지 않음
- 실제 회원 데이터: 사용하지 않음

## 다음 시작점

1. 로그인한 합성 회원으로 complete/partial/cant와 동일 request 재시도를 Production에서 확인한다.
2. 공개 링크에서 세트 시작·휴식 후 다음 세트·무음 화면 타이머를 확인한다.
3. 강사 상세의 일부 수행·수행 항목·다시 내기와 원본 보존을 확인한다.
4. 390px 및 Kakao in-app browser에서 가로 넘침과 버튼 접근성을 확인한다.

## 남은 P1

- 매일 반복 숙제/상시 숙제 일정 계약
- G5 기간별 회원 변화 보고서
- G6 회원 확인·다음 행동 이력
- G7 CSV 내보내기·복구 리허설
- 운동 DB 콘텐츠 검토·게시

## Production P0 correction — 2026-09-22

판정: **READY FOR DEMO — 핵심 숙제 제출 흐름 실환경 검증 완료**

기존 보고 뒤 실제 코드를 다시 확인하면서, 동작을 체크해도 제출 버튼이 활성화되지 않고 `못 했어요`만 제출할 수 있는 Production P0를 발견했다. 제출 가능 조건을 `수행 동작 1개 이상 또는 못함 명시`로 바로잡고 기존 작업을 보존한 채 기존 Vercel 프로젝트에 재배포했다.

### 수정 및 검증

- 항목 체크, `필수 동작을 모두 했어요`, `못 했어요`를 서로 일관된 단일 선택 상태로 연결했다.
- 실패한 제출 초안은 homework ID, 정렬된 수행 항목, 불편함, 메모, 선택 상태, payload fingerprint, request UUID만 `sessionStorage`에 보존한다. 공개 token은 저장하지 않는다.
- 같은 payload 재시도는 같은 request UUID를 사용하고, 사용자가 내용을 바꾸면 새 UUID를 사용한다. 성공 또는 `already_submitted` 확인 후 초안을 제거한다.
- Production에서는 `NEXT_PUBLIC_DEMO_MODE=true`여도 데모 인증·데이터 fallback이 켜지지 않도록 환경 경계를 고정했다.
- Supabase 조회 장애가 회원 0명·숙제 0건·잘못된 공개 링크로 위장되지 않도록 핵심 목록/상세/공개 링크 경로를 재시도 가능한 오류로 분리했다.
- `.env.local`의 중복 Supabase URL/공개키 정의는 실제 최종 적용값을 유지한 채 각각 1개로 정리했다. 사용되지 않는 service role 값은 교체하거나 삭제하지 않았다.

### 최종 Gate

- `npx tsc --noEmit`: PASS
- `npm run verify`: PASS — 180 passed / 43 skipped / 0 failed
- `npm run build`: PASS
- Vercel Production: READY, deployment `dpl_5uvTfmNi6xnFEKwxTWRwqRyHJiqe`
- Production URL: https://instructor-sync-three.vercel.app

### Production 실환경 검증

- HTTP: landing 200, login 200, 비로그인 `/app` 307, 공개 링크 200.
- 로그인된 390px in-app browser: 숙제 작성 화면의 1~2개 동작, 필수 수준, 세트/횟수, Why, 생성 버튼 접근 가능.
- 합성 회원 `QA 기존회원 0921`에 QA 숙제 3건을 생성했다.
- 완료: 동작 체크만으로 제출 버튼 활성화, 제출 성공, 재접속 후 수정 UI 미노출.
- 일부 수행: 필수 2개 중 1개 선택, 불편함 6/10, 합성 메모 제출 성공. 강사 상세에 `일부 수행`과 수행 동작명이 반영됨.
- 못함: `못 했어요` 선택과 합성 메모 제출 성공.
- Dashboard: 세 제출이 최근 활동에 반영되고 상담/케어 큐가 50% 수행률과 다음 수업 확인 필요로 갱신됨.
- Kakao 실제 in-app browser와 음성/무음 세트 타이머의 이번 배포 수동 실행은 미실행이다. 해당 항목은 PASS로 표시하지 않는다.

### 남은 비차단 항목

- Kakao 실제 in-app browser에서 390px 가로 넘침과 오디오 권한 차단 상태 확인.
- Production에서 세트 시작·휴식 후 다음 세트·무음 타이머를 한 번 수동 실행.
- Production 환경변수는 이름과 동작만 검증했다. 운영 비밀값을 로컬로 내려받는 작업은 자동 승인 검토에서 거부되어 값 자체는 읽지 않았다.
