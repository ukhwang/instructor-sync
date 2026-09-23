# 🚀 2026-09-06 프로젝트 통합 핸드오프 (보관본)

> **문서 상태: 보관/비규범.** 소원 앱·운동숙제·로컬 인프라가 섞인 과거 기록이며 현재 운동숙제 작업의 시작점이나 제품 기준으로 사용하지 않는다. 현재 기준은 `PRODUCT_BASELINE.md`, 현재 진행 상태는 `LATEST_HANDOFF.md`를 본다.

> **목적**: 내일 새 세션 시작 시 수십 번의 파일 탐색 및 중복 질문 없이, **이 문서 하나만 읽고 즉시 작업에 착수하여 토큰 낭비를 0으로 만드는 것**입니다.

---

## 📌 1. Executive Summary (오늘 완료된 핵심 현황)

오늘(2026-09-05 ~ 09-06) 진행된 2개 주요 프로젝트의 작업 요약입니다.

| 프로젝트 | 디렉토리 | 오늘 완료된 작업 | 핵심 산출물 | 현재 빌드/동작 상태 |
|---|---|---|---|---|
| **소원앱 (SOWON)** | `C:\Users\tmd31\OneDrive\Desktop\Sowon_App` | - 전역 Figma MCP 연동 (`jack0311@inha.edu` Full Seat OAuth 완료)<br>- 37KB 규모 제품·BM·코드 심층 감사 보고서 작성<br>- 치명적 코드 결함 4건 발견<br>- 14일 피벗 로드맵 수립 | [SOWON_GROWTH_REVIEW_2026-09-05.md](file:///C:/Users/tmd31/OneDrive/Desktop/Sowon_App/docs/SOWON_GROWTH_REVIEW_2026-09-05.md) | 테스트 통과 29/29 (단, 실제 앱 커버리지 0%). 초대 수락 Mock 상태 |
| **운동숙제 (instructor-sync)** | `C:\Users\tmd31\instructor-sync` | - ESLint 에러 2건/경고 7건 올클리어<br>- Pro toggle 목업 UI 제거<br>- 모바일 UX 취약점(인앱오디오/잠금화면) 감사<br>- B2B 14일 파일럿/GTM 계획서 수립 | [EXERCISE_HOMEWORK_GO_TO_MARKET_PLAN.md](file:///C:/Users/tmd31/instructor-sync/docs/EXERCISE_HOMEWORK_GO_TO_MARKET_PLAN.md) | `tsc` 및 `npm run lint` 통과 (0 errors, 0 warnings). 빌드 클린 |
| **Herdr & 인프라** | 로컬 시스템 | - Herdr 프로세스 구동 및 멀티 에이전트 분업<br>- Codex 5시간 쿼터 리셋 확인 (작업 재개 가능) | - | 정상 동작 중 |

---

## 📂 2. 소원앱 (Sowon_App) 상세 현황 및 즉시 실행 가이드

### 2-1. 기본 정보
* **경로**: `C:\Users\tmd31\OneDrive\Desktop\Sowon_App`
* **기술 스택**: React Native (Expo), TypeScript, Supabase, Jest
* **상세 보고서 위치**: `docs/SOWON_GROWTH_REVIEW_2026-09-05.md`

### 2-2. 반드시 알아야 할 치명적 코드 결함 4건 (P0)
1. **초대 수락 Mock 처리 ([app/(auth)/invite/[code].tsx](file:///C:/Users/tmd31/OneDrive/Desktop/Sowon_App/app/\(auth\)/invite/[code].tsx:12))**:
   * **원인**: 초대 수락 버튼을 누르면 로컬 state `accepted=true`만 바꾸고 `setTimeout(..., 1200)` 후 메인 화면으로 리다이렉트됨.
   * **문제**: `relationshipService.acceptInvitation(code, user.id)` 백엔드 RPC를 전혀 호출하지 않아 **실제 DB상 커플 연결이 절대 이루어지지 않음**.
2. **OTP 전송 응답 미검증 ([app/(auth)/sign-in.tsx](file:///C:/Users/tmd31/OneDrive/Desktop/Sowon_App/app/\(auth\)/sign-in.tsx:14))**:
   * **원인**: `authService.signInWithOtp()` 호출 후 결과(성공/에러)를 체크하지 않고 즉시 `sent=true`로 전환. 이메일 발송 실패 시에도 사용자에게는 발송되었다고 표시됨.
3. **가짜 100% 테스트의 함정 ([__tests__/domain.invariants.test.ts](file:///C:/Users/tmd31/OneDrive/Desktop/Sowon_App/__tests__/domain.invariants.test.ts))**:
   * **원인**: 29개 테스트가 모두 통과하지만, 실제 소스 파일(`src/services/*`, `app/*`)을 호출하지 않고 테스트 파일 내부의 mock 시뮬레이션 함수(`simulateWishCreation`, `simulateStampAward` 등)만 검증.
   * **실태**: 실제 앱 소스코드 커버리지는 **0%** 상태임. 동시성 락, RLS, 실제 트랜잭션 검증 부재.
4. **타임라인에서 소원/도장 제외 ([src/services/timeline.service.ts](file:///C:/Users/tmd31/OneDrive/Desktop/Sowon_App/src/services/timeline.service.ts))**:
   * **원인**: 질문, 약속, 메모만 조합되고 소원/도장은 명시적으로 제외되어 있음. "부탁과 감사가 우리책에 누적된다"는 서비스 기획과 코드가 어긋나 있음.

### 2-3. 확정된 제품/BM/마케팅 피벗 결정 사항
* **50일 잠금 폐기**: 50문제를 모두 풀어야 AI 코치가 열리는 구조는 90% 이상의 커플이 D50 전 이탈하므로 자살행위임. **첫 질문 답변 직후 1회 무료 AI 코칭("이번 주 해볼 작은 부탁 1개")을 즉시 제공**하고, 이후 월 구독 Paywall로 연결.
* **관계의 화폐화(도장 3개 = 소원 1개) 부작용 완화**: 감사를 '부탁할 자격을 얻기 위한 노동'으로 만들지 않고 기본 부탁은 무료 제공.
* **단일 요금제**: **커플당 월 5,900원 (1인 결제 시 2인 모두 이용)**.
  * 부가세(10%), 스토어 수수료(15%), 환불(3%) 차감 후 수취액: 4,422원.
  * 유료 변동비(AI/서버 800원) 제외 시 **커플당 실 공헌이익: 3,622원**.
  * 고정비 30만원 기준 **손익분기점(BEP): 유료 361쌍 유지** (매월 1,805쌍 신규 유입 필요).
* **출시 범위 축소 (연기할 것)**:
  * ❌ AI 3종 페르소나 및 범용 대화방 (단일 기본 말투로 축소)
  * ❌ 프리미엄 테마 4종 (기본 테마 1개로 출시)
  * ❌ 50문 게이지 연출

### 2-4. 내일 바로 실행할 작업 (Action Items)
- [ ] **[P0] `invite/[code].tsx` 실DB 연동**: `relationshipService.acceptInvitation(code, user.id)` 호출, 에러 토스트, 성공 시 연결 관계 캐시 갱신.
- [ ] **[P0] `sign-in.tsx` OTP 처리 개선**: 발송 실패 에러 핸들링 및 성공 시에만 `sent=true` 전환.
- [ ] **[P1] 첫 질문 즉시 AI 생성 연동**: D0 첫 질문 완료 시 AI 부탁 1회 무료 생성 및 Paywall 모달 연동.
- [ ] **[P1] 커플 5,900원 IAP 화면 및 Supabase 구독 상태 필드 동기화**.

---

## 📂 3. 운동숙제 (instructor-sync) 상세 현황 및 즉시 실행 가이드

### 3-1. 기본 정보
* **경로**: `C:\Users\tmd31\instructor-sync`
* **기술 스택**: Next.js (App Router), TypeScript, Tailwind CSS, Supabase
* **상세 기획서 위치**: `docs/EXERCISE_HOMEWORK_GO_TO_MARKET_PLAN.md`

### 3-2. 오늘 완료된 작업
* **코드 정리**: ESLint 에러 2건 및 경고 7건 수정 완료.
* **UI 정리**: `TrainerNav.tsx` 및 `renewals/page.tsx`에 남아있던 테스트용 목업 "Pro toggle" 제거.
* **모바일 UX 취약점 분석**:
  * 카카오톡 인앱 브라우저에서 배경 전환 또는 잠금 화면 진입 시 Web Audio / AudioContext가 강제 정지되는 문제.
  * 회원이 숙제 완료 제출과 통증 일기를 분리 제출하다 통신 장애 발생 시 통증 기록이 증발하는 문제.
* **B2B 전환 기획 수립**:
  * 타깃: 원장이 직접 수업하는 1인 PT 스튜디오.
  * 모델: 14일 무료 파일럿(9/21 목표) → 월 49,000원(회원 30명 기준) 유료 전환.

### 3-3. 내일 바로 실행할 작업 (Action Items)
- [ ] **[P0] 원자적 숙제/통증 제출**: 숙제 완료 체크와 통증/피드백 제출을 단일 트랜잭션(atomic RPC)으로 묶어 데이터 유실 방지.
- [ ] **[P0] 카카오 인앱 오디오 백그라운드 유지**: 카운트 오디오 및 음성 가이드가 끊기지 않도록 silent audio keepalive 및 AudioContext 재개 처리.
- [ ] **[P1] 강사 공유 플로우 검증**: 강사가 숙제 생성 후 카카오톡으로 원클릭 공유하는 텍스트/링크 템플릿 실기기 테스트.

---

## 🖥️ 4. 개발 환경 및 인프라 현황

* **Herdr 상태**:
  * 프로세스 정상 (PID: 5988, 8240).
  * Tab 1: `instructor-sync` (Panes 1 & 2).
  * Tab 4: `sowon` (Pane 7: Figma MCP, Pane 8: Antigravity, Pane 9: Codex).
* **Codex API 쿼터**: 22:52 리셋 완료되어 현재 정상 사용 가능.
* **Figma MCP**: 글로벌 등록 완료 (`jack0311@inha.edu`), 디자인 컨텍스트 추출 도구 준비 완료.

---

## ⚡ 5. 내일 시작 시 AI에게 붙여넣을 1줄 프롬프트 (Token-Zero Prompt)

내일 새로운 대화창이나 에이전트를 열었을 때 아래 프롬프트 하나만 복사해서 전달하면, 불필요한 검색 없이 1초 만에 작업을 시작할 수 있습니다.

### 🎯 소원앱 (SOWON) 버그 수정 및 개발 착수용:
```text
C:\Users\tmd31\instructor-sync\docs\DAILY_WORK_HANDOFF_2026-09-06.md 문서를 읽고, 2-4절의 [P0] 버그 2개(app/(auth)/invite/[code].tsx의 실제 acceptInvitation RPC 호출 누락 수정, app/(auth)/sign-in.tsx의 OTP 발송 응답 검증)부터 소스 코드를 바로 수정해줘.
```

### 🎯 소원앱 (SOWON) 첫 질문 AI 연동 및 Paywall 작업용:
```text
C:\Users\tmd31\instructor-sync\docs\DAILY_WORK_HANDOFF_2026-09-06.md 문서를 읽고, 2-3절 및 docs/SOWON_GROWTH_REVIEW_2026-09-05.md에 정의된 대로 기존 50일 해금 게이지를 제거하고, 첫 질문 공동 완료 직후 무료 1회 AI 부탁 생성 트리거 및 5,900원 Paywall 화면을 구현해줘.
```

### 🎯 운동숙제 (instructor-sync) 작업용:
```text
C:\Users\tmd31\instructor-sync\docs\DAILY_WORK_HANDOFF_2026-09-06.md 문서를 읽고, 3-3절의 [P0] 과제(회원 숙제 완료 및 통증 피드백의 원자적 저장 Supabase 트랜잭션)를 구현해줘.
```
