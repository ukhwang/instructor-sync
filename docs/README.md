# 운동숙제 문서 인덱스

> 문서 상태: **문서 권한과 읽기 경로의 기준**  
> 모든 작업에서 모든 문서를 읽지 않는다. 요청 유형에 맞는 기준 문서와 관련 코드만 읽는다.

## 현재 기준 문서

| 문서 | 역할 | 언제 읽는가 |
| --- | --- | --- |
| `../AGENTS.md` | 짧은 실행 규칙과 작업 경계 | 모든 작업의 시작점 |
| `../README.md` | 현재 구조, 로컬 실행, 검사 명령 | 실행·빌드·구조 파악 |
| `PRODUCT_BASELINE.md` | 사용자, 범위, 흐름, 지표, 결정 상태의 단일 기준 | 제품·UX·카피·우선순위 작업 |
| `DATA_INTEGRITY_AND_POSTGRES_MIGRATION.md` | 소유권·원자성·멱등성·토큰·이전 게이트 | DB·인증·토큰·데이터 접근 작업 |
| [POSTGRES_ARCHITECTURE_DECISION.md](POSTGRES_ARCHITECTURE_DECISION.md) | 자체 PostgreSQL 기술 선택·목표 모델·전환/복구의 확정 기준 | 새 데이터/인증 경계 구현·로컬 PostgreSQL 환경 작업 |
| [P0_VERIFICATION_MATRIX.md](P0_VERIFICATION_MATRIX.md) | P0 실행 계약 매핑·실패/차단 결과 | 데이터/인증 구현과 P0 재검증; 필요한 계층만 적용 |
| [../infra/postgres/README.md](../infra/postgres/README.md) | 합성 로컬 PostgreSQL 실행·마이그레이션·백업·복원 명령 | 4단계 환경 재현·검증 시 |
| `LATEST_HANDOFF.md` | 최근 확인 상태와 다음 작업 | 중단된 구현을 이어갈 때 |
| [EXECUTION_CONTROL.md](EXECUTION_CONTROL.md) | 단계 번호·상태·완료 증거·차단 사유의 단일 기준 | 단계 작업 시작·재개·완료 |
| [CHATGPT_PROJECT_INSTRUCTIONS.md](CHATGPT_PROJECT_INSTRUCTIONS.md) | ChatGPT 프로젝트에 붙여넣는 짧은 지침 | 프로젝트 작업환경 설정 |

정책이 충돌하면 제품 판단은 `PRODUCT_BASELINE.md`, 데이터 불변조건은 `DATA_INTEGRITY_AND_POSTGRES_MIGRATION.md`, 기술 선택은 `POSTGRES_ARCHITECTURE_DECISION.md`, 작업 경계는 `AGENTS.md`가 우선한다. 핸드오프와 검토서는 기준 문서를 바꾸지 않는다.

단계 번호와 상태는 `EXECUTION_CONTROL.md`를 우선한다. 데이터 문서의 이전 방향 1~6은 개념 순서이며 실행 단계 번호가 아니다. 기존 문서의 `실환경 검증됨`은 실행 상태에 기록할 때 일회용 환경·실기기·운영 검증으로 구체화한다. `운영 적용됨`은 배포 사실이며 `운영 검증됨`과 구분한다.

## 개인 Skill 사용 경로

- 중요한 새 기능·제품 정책·파일럿 범위·사용자 흐름·운영 방식의 구현 전 검토: `homework-practical-review`. 일반 코딩·단순 UI 수정에는 적용하지 않는다.
- 데이터·인증 작업: `homework-data-integrity`.
- 출시 준비 판정: `homework-release-gate`.
- 실제 설치 이름·설명과 검사 결과는 [최신 핸드오프](LATEST_HANDOFF.md)의 0단계 기록을 확인한다. 개인 설치 폴더는 `C:/Users/tmd31/.codex/skills/`이며 복제본을 저장소에 만들지 않는다.
- Skill은 검토 절차를 담당하며 제품 정책·데이터 불변조건은 기준 문서에만 유지한다. 해당 Skill이 없으면 미설치를 밝히고 기준 문서로 확인 가능한 작업만 진행한다. Skill 검토 완료로 간주하지 않는다.

## 참고 문서

| 문서 | 상태 | 사용 방법 |
| --- | --- | --- |
| [STAGE_1_LOCAL_DEMO_BASELINE.md](STAGE_1_LOCAL_DEMO_BASELINE.md) | 로컬 검증 증거/2026-09-12 | 1단계 데모 결과, 알려진 실패, 안전한 재실행·복구 방법 확인 시 |
| `EXERCISE_HOMEWORK_GO_TO_MARKET_PLAN.md` | 참고/일부 오래됨 | 2026-09-05 당시 구현 감사와 GTM 가설. 날짜·가격·파일럿 수치는 현재 확정값이 아님 |
| `REVIEW_FRONTEND_FIELD_2026-09-10.md` | 참고/검증 자료 | 프론트·현장 리스크와 제안의 근거를 찾을 때만 읽음 |
| `REVIEW_MARKET_FINANCE_2026-09-10.md` | 참고/검증 자료 | 시장·가격·단위경제 가설을 검토할 때만 읽음 |

## 보관 문서

| 문서 | 상태 | 주의 |
| --- | --- | --- |
| `DAILY_WORK_HANDOFF_2026-09-06.md` | 보관/비규범 | 소원 앱·인프라·운동숙제가 섞인 과거 기록. 현재 작업에 사용하지 않음 |
| `DAILY_WORK_HANDOFF_2026-09-07.md` | 보관/비규범 | 소원 앱과 운동숙제가 섞인 과거 기록. 현재 작업에 사용하지 않음 |

보관 문서는 삭제하지 않는다. 새 핸드오프에는 현재 저장소인 운동숙제만 기록하고, 제품 정책·가격·상세 스키마를 복제하지 않고 해당 기준 문서에 링크한다.

## 요청별 최소 읽기

- 제품 기능/카피/지표: `AGENTS.md` + `PRODUCT_BASELINE.md`
- UI/라우트/일반 버그: `AGENTS.md` + `README.md` + 관련 코드, 필요할 때만 `LATEST_HANDOFF.md`
- DB/인증/권한/토큰: `AGENTS.md` + `DATA_INTEGRITY_AND_POSTGRES_MIGRATION.md` + 관련 SQL/테스트
- 자체 PostgreSQL 이전 계획: 위 데이터 문서 + 실제 스키마/권한의 읽기 전용 조사 결과
- 시장/가격: `PRODUCT_BASELINE.md` + `REVIEW_MARKET_FINANCE_2026-09-10.md`; 가격은 제안으로 취급
- 현장/모바일 QA: `PRODUCT_BASELINE.md` + `REVIEW_FRONTEND_FIELD_2026-09-10.md` + 관련 화면 코드
