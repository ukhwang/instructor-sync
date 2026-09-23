# 운동숙제 Production 점검 보고서

점검일: 2026-09-21 (최근 배포 반영)  
프로젝트: `C:\Users\tmd31\instructor-sync`  
Production: [https://instructor-sync-three.vercel.app](https://instructor-sync-three.vercel.app)

## 현재 상태

G0부터 G4까지 구현·검증·배포했고, 이번 개선으로 기록 입력 신뢰성·현장 용어·상담 문장·공통 운동 검색·숙제 이유 초안 기반을 추가했다. 기존 작업과 미커밋 파일은 보존했다. Supabase는 기존 프로젝트 `qqlztmckqvyhbbnqwoft`를 유지했고, 모든 DB 변경은 삭제 없는 additive migration이다.

## 기능 점검

- G0 기록 신뢰성: PASS — 공개 링크 재접속 시 회원 메모가 불편함 로그로 대체되던 표시 오류 수정.
- G1 25명 경계: MANUAL CHECK REQUIRED — 현재 무료 화면 제한은 5명이며 25명 판매 권한·가격은 미확정으로 변경하지 않음.
- G2 측정 계약: PASS — 목표, 조건, 지표, 단위, 기준선, 재평가, 출처, 결측, 체감 의견 계약 확정.
- G3 안전한 저장: PASS — 목표·관찰·의견·멱등성 RPC, 소유권, RLS, anon 차단, 정정 연결 구현.
- G4 회원 변화 입력: PASS — 회원 상세에서 목표+기준선, 재평가, 회원 체감, 기록 표와 변화 문구 제공.
- 기록 입력 보완: 로컬 검증 PASS — 빈칸/0, 미측정 사유, 회원 보고/강사 측정, 정정 기록 UI를 분리.
- 상담 문장: 로컬 검증 PASS — 라벨 없는 자연스러운 한 문단으로 변경. 실제 회원별 문장 품질은 실환경 확인 필요.
- 공통 운동 검색: 구현됨·로컬 검증됨 — 현재 seed 목록을 공통 catalog interface로 검색. DB 게시 콘텐츠는 아직 없음.
- 숙제 이유 초안: 구현됨·로컬 검증됨 — 목적 버튼과 운동 기반 초안, 직접 수정 보존.
- 기존 로그인: PASS.
- 비로그인 `/app` 차단: PASS.
- 숙제 생성·공개 링크·완료/못함·불편함·메모·최종 제출: 기존 Production smoke PASS.
- 제출 후 수정 차단: 기존 Production smoke PASS.
- Dashboard/care queue 반영: 기존 Production smoke PASS.

## 품질 게이트

- `npx tsc --noEmit`: PASS
- `npm run verify`: PASS — 97 passed / 43 skipped / 0 failed
- `npm run build`: PASS
- 운동 카탈로그 migration `20260921010000_exercise_catalog.sql`: 운영 적용 완료, 게시 상태 콘텐츠 0건
- G3 DB 테스트: PASS — 소유권, 원자성, 멱등성, 잘못된 값, anon 실행 거부
- Production HTTP: landing 200, login 200, `/app` 307, 공개 링크 200
- Final Production wording smoke: landing 200 with old `된 것` 상담 라벨 미노출; `/app/renewals` 307 to login; public homework link 200.

## Supabase 점검

- Migration `20260921000000_member_progress_measurements.sql`: 운영 적용 완료
- 새 테이블 4개: RLS 활성화
- 새 테이블 직접 권한: PUBLIC/anon/authenticated 모두 차단
- G3 RPC: authenticated 실행 허용, anon 실행 차단
- SECURITY DEFINER: `search_path=""`
- 기존 숙제 피드백·공개 token 권한: 변경하지 않음

## 아직 운영 확인이 필요한 항목

1. 로그인한 합성 회원으로 목표 1개와 재평가 1개를 Production에서 입력하고 새로고침 후 유지되는지 확인.
2. 실기기 390px과 Kakao in-app browser에서 목표 입력·표가 가로로 넘치지 않는지 확인.
3. 기간 필터, 정정 UI, 강사 확인/다음 행동 이력은 G5/G6 작업으로 남아 있음.
4. CSV 내보내기·복구 리허설은 G7 작업으로 남아 있음.
5. 가격, 25명 권한, 결제, 회원 공유 링크는 미확정 정책이므로 자동 변경하지 않음.

## 최종 판정

**조건부 준비 상태**다. 핵심 숙제 흐름과 이번 개선의 코드·DB 기반은 Production에 반영됐지만, 로그인한 실제 합성 회원으로 새 안내 초안·운동 검색·변화 정정 흐름을 직접 실행한 실환경 검증과 운동 콘텐츠 검토가 남아 있다. 이 항목들을 확인하기 전에는 완전한 현장 판매 준비로 표시하지 않는다.

## Release continuation — 2026-09-21

이번 작업은 기존 변경을 보존한 채 다음 범위를 보완했다.

* 기록 입력: 빈칸·0·미측정 사유·출처를 분리하고, 실제 입력자는 강사로 저장하며, Asia/Seoul 날짜·정정 연결·동일 요청 재시도·오류 시 입력 보존을 보완했다. 기존 기록의 `actor` 값은 이력 보존을 위해 변경하지 않았다.
* 운동 선택: 숙제와 수업 기록이 공통 provider와 `ExercisePicker`를 사용한다. 게시된 DB 운동이 있으면 최신 버전을 사용하고, 현재 검토 전 seed 목록은 호환 fallback으로만 사용한다. 자연어 검색은 이름·별칭·태그·도구 토큰을 사용한다.
* 숙제 snapshot: 새 숙제 생성 시 검토된 DB 운동 버전의 이름·큐·미디어·출처를 `homework_items.exercise_snapshot`에 보존한다. 기존 숙제와 기존 migration은 수정하지 않았다. 검토 정보가 없는 운동은 게시·선택되지 않는다.
* 용어·문장: `SESSION ALERT`, 컨텍스트 표현을 `수업 준비 메모`, `회원 기록 요약`으로 교체했고, 랜딩·상담 문장은 재등록률이나 건강 개선을 보장하지 않고 저장된 회원 기록을 다음 수업 준비에 연결하도록 정리했다.

검증 및 운영 반영:

* 담당 회귀: 운동 catalog/DB/state 및 member progress 관련 테스트 34개 PASS.
* 최종 `npx tsc --noEmit`: PASS.
* 최종 `npm run verify`: 123 passed / 43 skipped / 0 failed. 기존 `infra/postgres/schema-integrity.test.mjs` unused `B` 경고 1건만 남았다.
* 최종 `npm run build`: PASS. Next.js `middleware` 명칭 폐기 예정 경고는 남아 있다.
* Supabase dry-run에서 새 migration 두 개만 확인한 뒤 적용했다: `20260921074826_member_progress_correctness.sql`, `20260921075052_exercise_catalog_snapshots.sql`. 적용 후 dry-run은 `upToDate: true`였다.
* 기존 Vercel 프로젝트 `instructor-sync`에 최종 배포를 완료했고 Production URL은 `https://instructor-sync-three.vercel.app`으로 유지된다.
* in-app browser에서 랜딩, 로그인된 `/app`, 수업 준비 화면, 숙제 작성 화면, 운동 검색 패널, 공개 숙제 링크를 확인했다. 랜딩과 수업 화면의 새 용어가 반영됐다. 브라우저 세션이 이미 인증되어 비로그인 `/app` 차단은 이번 탭에서 재검증하지 않았고, 이전 Production smoke의 307 근거를 유지한다.
* 합성 회원 `QA 기존회원 0921`로 Production에서 목표·기준선(60초) 저장, 재평가(90초) 저장, 최신 기록 정정(85초), 새로고침 후 60→85 변화 유지까지 확인했다. 실기기 390px/Kakao in-app browser와 공개 링크 최종 제출 재실행은 여전히 실환경 수동 게이트다. DB 운동 콘텐츠는 검토자·출처가 확정되기 전까지 게시하지 않는다.

현재 판정: **CONDITIONALLY READY**. 코드·로컬 게이트·두 additive migration·Production 배포는 완료됐지만 실기기/카카오와 회원 변화 입력의 브라우저 재현, 운영 운동 콘텐츠 검토가 남아 있다.

다음 시작점: G5 기간 필터와 접근 가능한 변화 보고서. 관찰값 0개·1개, 0과 결측, 정정·조건 변경을 먼저 순수 함수로 검증한 뒤 그래프와 G6 확인 이력을 연결한다.

## 다음 개발 시작점

G5에서 동일 목표·동일 조건의 관찰값을 기간별로 필터링하고 접근 가능한 변화 보고서를 만든다. 관찰값이 0개·1개인 상태와 결측·정정·조건 변경을 먼저 테스트한 뒤 G6의 `회원과 확인` 및 `다음 수업 계획` 이력을 연결한다.
