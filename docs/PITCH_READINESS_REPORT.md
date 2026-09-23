# 운동숙제 피칭 준비 보고서

점검일: 2026-09-22

## 판정

**조건부 피칭 가능 / Production 완전 READY 아님**

내일 피칭은 합성 회원과 확인된 브라우저 흐름으로 진행할 수 있다. `next@16.2.2`에 운영 의존성 critical/high advisory가 남아 있고, Kakao WebView·실기기·콘텐츠 검토는 완료되지 않았으므로 실제 센터 도입 또는 보안상 Production READY로 설명하지 않는다.

## P1 상태

| 항목 | 구현됨 | 로컬 검증 | 운영 적용 | 실환경 검증 |
|---|---|---|---|---|
| P1-1 Kakao/모바일 | 기존 흐름 유지 | 접근성·코드 점검 | 기존 배포 | **미실행** |
| P1-2 세트/무음 타이머 | 있음 | voice-coach 24개 통과 | 기존 배포 코드 기준 | **실기기 미실행** |
| P1-3 수업 기록 연결 | 있음 | session/assignment 회귀 통과 | 기존 migration 적용 | **이번 재실행 없음** |
| P1-4 의존성 감사 | 분류 문서 작성 | audit/explain 실행 | 취약점 수정 미적용 | **운영 영향 미확정** |
| P1-5 운동 DB | provider/snapshot 계약과 UI 보완 | catalog/DB 20여 테스트 통과 | 새 콘텐츠 0건 게시 | **콘텐츠 검토 미실행** |

## 품질 게이트

- `npx tsc --noEmit`: PASS
- `npm run verify`: PASS (182 passed / 43 skipped / 0 failed; 기존 ESLint warning 1개)
- `npm run build`: PASS (middleware convention deprecation warning)
- Vercel: READY, deployment `dpl_FVDYwx6ZuKny441RUU3kRZ1xkC9J`, 기존 alias 유지
- Production HTTP smoke: landing 200, login 200, 비로그인 `/app` 307, 공개 링크 200

인증 합성 회원 click-through, 물리 390px/Kakao WebView, 콘텐츠 검토, dependency advisory 수정은 실행하지 않았으므로 실환경 PASS로 표시하지 않는다.

## 운동 DB

기존 seed fallback은 40개이며 기존 호환 자료다. 이번 1차 콘텐츠 검토 후보는 12개, 사람 검토 완료 0개, DB 신규 published 0개다. 미디어 권리와 안내 문구를 확인하기 전에는 게시하지 않는다. 저장된 homework snapshot의 버전·미디어·안내가 이후 catalog 변경으로 바뀌지 않도록 회원 화면 우선순위를 보완했다.

## 피칭 범위

합성 회원으로 수업 기록 → 운동 검색 → 세트/횟수 조정 → 안내 초안 수정 → 공개 링크 → 회원 일부 수행/불편함/메모 제출 → 강사 기록 확인을 보여준다. 실제 건강 개선, 치료 효과, 재등록 성과, Kakao 지원, 가격·25명 한도·결제를 약속하지 않는다.

## 남은 P0/P1

- P0: 없음(현재 확인된 저장·제출 차단 버그는 단계 0에서 수정).
- P1: Next 보안 patch 검토, 실기기/Kakao 확인, 운동 콘텐츠 검토·게시 결정, 인증 합성 회원 재현 흐름.
