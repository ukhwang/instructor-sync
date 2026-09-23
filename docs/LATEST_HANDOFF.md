# 운동숙제 최신 핸드오프

> 문서 상태: **현재 진행 상태 전용**  
> 갱신일: 2026-09-13  
> 제품 정책은 `PRODUCT_BASELINE.md`, 데이터 기준은 `DATA_INTEGRITY_AND_POSTGRES_MIGRATION.md`가 우선한다.

## 4단계 완료 (2026-09-13)

- 현재 단일 상태: **4 DONE → 다음 5 NOT_STARTED**. 5단계 코드·인증 전환은 시작하지 않았다.
- Ubuntu WSL 공식 Docker Engine client/server 29.8.0·Compose5.5.1·daemon을 확인했다. 기존 Docker 자원·시스템 패키지·DB는 제거하지 않았다.
- PostgreSQL17 전용 dev/test/restore 컨테이너와 volume을 만들고 각각 `127.0.0.1:55432/55433/55434`에만 바인딩했다. WSL 호출 종료 뒤 컨테이너가 멈추므로 runbook대로 명시 시작한다.
- Drizzle migration `0000_fine_taskmaster`·`0001_integrity-contracts`: clean apply PASS, 0000 대표 seed→0001 upgrade PASS, 적용 전후 데이터 지문 `e770d1…d6e7`과 행 수 동일.
- 실제 PostgreSQL 전체 스키마 무결성 PASS 11/11. 교차 강사 부모 참조, 입력 CHECK, 숙제+항목 원자 롤백, 1~3개 연속 순서, 토큰 해시/회수/재발급, 제출 정정 lineage, 멱등키, 최소 권한, 필수 인덱스를 검사했다.
- custom backup 71,542 bytes, SHA-256 `5246dcaa8399936e58d3b37d9ae989235c5445aa22907e2d613d7dde02938fed`; 별도 restore DB에 복원 후 지문 `match:true`, migration 2, 무결성 11/11.
- 최종 `npm run verify` PASS(오류 0; DB env 미지정 전용 테스트 12개는 명시적 skip), `npm run build` PASS. 실제 DB PASS는 별도의 명시 env 실행 증거이며 기본 skip과 구분한다.
- 상세 명령·실패/보정·증거: [P0 검사표](P0_VERIFICATION_MATRIX.md), [로컬 PostgreSQL runbook](../infra/postgres/README.md). 기존 앱 데이터·`.env.local`·Supabase URL/key/Auth/RLS/RPC/migration은 접속·변경·삭제하지 않았다. 외부 업로드·배포 없음.

## 3단계 완료 기록 (2026-09-13)

- 당시 **3 DONE → 4 BLOCKED**, 5 NOT_STARTED였다. 현재 단일 상태 원본은 [EXECUTION_CONTROL](EXECUTION_CONTROL.md).
- [P0 검사표](P0_VERIFICATION_MATRIX.md): 신규 41개 중 PASS3/FAILED8/BLOCKED30. 테스트 위치·실행 명령·원인별 실패·미구현 adapter 계약은 검사표와 [contracts/README](../contracts/README.md)에 있다.
- `npm run verify`: 기존48+새2 PASS50, 미구현30 SKIP/BLOCKED, 타입·린트 성공. `npm run build` 성공, `npm run test:p0:bundle` PASS1. `test:p0:legacy`는 의도한 불변조건 미충족 8개로 exit1. 엄격 `P0_REQUIRE_RUNTIME=1`은 adapter 부재 시 exit1로 fail closed. Node20 기존 런타임이며 Node24/실PG/실세션 검증은 아니다.
- 우선 P0: 소유권/권한(교차 강사 회원 연결·자기 Pro 승격), 숙제 생성 원자성, 제출 멱등성. 입력 CHECK 누락·장애를 빈 목록으로 반환하는 문제도 기록했다. 기존 앱/SQL을 이 단계에서 고쳐 실패를 지우지 않았다.
- 최신 사용자 요청에 맞춰 3~5단계 명칭을 정정하고 ADR에 명칭 매핑과 후속 수행/정정 구분을 반영했다. 새 key+performed_at은 독립 관찰이며 정정과 다르다. 기술 라이브러리 선택은 유지했다.
- `homework-data-integrity` 미설치 재확인. 데이터 기준 문서와 Supabase/Postgres Skill로 검사했으며 개인 Skill 실행으로 주장하지 않는다.
- **4단계 차단:** 사용자는 공식 apt 저장소의 Docker Engine/Compose 설치를 승인했다. Ubuntu WSL 24.04.3·systemd 확인, Docker/Compose/psql 없음. `sudo -n true`가 `sudo: a password is required`로 실패해 추가 권한 시 중단 조건에 따라 설치를 멈췄다. root 우회·비밀번호 요청·패키지 제거·apt 저장소 추가·DB 생성 모두 하지 않았다. 사용자 직접 sudo 설치 또는 추가 권한의 명시적 허가 후 4단계 재개. 채팅에 비밀번호를 받지 않는다.
- 이번 변경: `contracts/` 실행 계약/실패 재현/비밀 검사, `tests/p0-*.test.mjs`, package.json의 테스트 script 3개, 관련 기준/실행/핸드오프 문서. 기존 테스트·앱·인증·Supabase SQL·package-lock·실제 환경변수 유지. 커밋·외부 DB·업로드·배포 없음.
- 새 복구 기준선: `C:/Users/tmd31/.codex/visualizations/2026/09/12/01a093c4-d507-7a61-affa-0e3b0264e203/instructor-sync-pre-stage3-2026-09-13/`, ZIP82개 해시 검사. SHA256·복구 방법은 P0 검사표. 이전 1단계 기준선도 보존.
- 최종 감사: 착수 전82개 중 허가된 문서5개+package.json만 변경, 나머지76개 해시 동일. 새 파일8개, 사라진 파일0, 기존 삭제 상태 동일, HEAD/index 유지. 상대 링크42개 오류0·diff/공백 검사 통과. 감사 재실행 스크립트는 위 복구 폴더의 `audit.cjs`다.

## 2단계 — 자체 PostgreSQL 기술 결정 (과거 완료 기록, 2026-09-13)

- 당시 판정 **READY**, 단계 **DONE**, 당시 다음 **3 / NOT_STARTED**. 현재 원본: [EXECUTION_CONTROL.md](EXECUTION_CONTROL.md). READY는 합성 로컬 구현 준비이며 실제 이전·운영 승인이 아니다.
- [ADR-001](POSTGRES_ARCHITECTURE_DECISION.md)에 로컬 Supabase 의존성 7개 테이블·RLS·5개 RPC·Auth/트리거·환경/테스트/배포 조사와 목표 모델을 기록했다. 실제 외부 프로젝트 상태·실데이터 유무는 확인하지 않았다.
- 확정: Docker Compose PostgreSQL17·목표 Node24, Better Auth 이메일/비밀번호·DB 세션, Drizzle+pg·단일 SQL migration 이력, Route Handler→서비스→저장소, 해시 토큰·복합 FK·트랜잭션/멱등 정정, 단일 쓰기 전환·백업/시점별 롤백. 상세 정책은 복제하지 않고 ADR을 따른다.
- `homework-practical-review` 적용 완료. `homework-data-integrity`는 9월 13일 개인 설치 폴더를 재확인했으나 없고 대화 목록에도 없다. 새로 만들지 않았으며 데이터 규범 문서와 Supabase/Postgres Skill을 대체 기준으로 검토했다. 해당 개인 Skill 사용 완료로 주장하지 않는다.
- 9월 12일 현재 코드의 `npm run verify`: 48/48·타입·린트 통과, `npm run build` 통과. 닫힌 loopback DB 주소와 기존 PGlite 합성 테스트만 사용. Node20에서의 기존 회귀 결과이며 목표 Node24/새 auth·DB 검증은 3단계 이후다. middleware 폐기 예정 경고 잔존.
- 이번 변경은 요청된 결정/데이터/실행/핸드오프 문서와 충돌 해소용 AGENTS·문서 인덱스·제품 기준의 최소 문구 수정이다. 앱·SQL·인증·패키지·환경변수 파일 변경 없음. 인덱스·HEAD·기존 삭제/미추적 코드 보존, 커밋·외부 업로드·DB 접속·배포 없음.
- 최종 문서 검사: 활성 문서 9개·상대 링크 29개 오류 0, AGENTS 62줄, `git diff --check` 통과. 1단계 manifest 기준 비문서 66개 해시 일치, 기준선 파일 삭제 없음. 기술 미확정/다음 단계 1이라는 오래된 현재형 문구를 정리했다.
- 사용자에게 필요한 기술 질문은 0개. 실제 제공자 구매·실제 데이터 존재 확인·보관/동의·복구 목표의 운영 승인은 파일럿/실제 전환 전에 필요하다. 기존 데모 새 링크 실패·수업404는 미해결이며 6~8단계 종단간 흐름 회귀 항목으로 유지한다.

## 1단계 — 로컬 데모와 기준선 결과 (과거 완료 기록, 2026-09-12)

- 당시 상태: **DONE**, 검증 수준: **로컬 검증됨**, 당시 다음 단계는 2였다. 현재 상태 원본: [EXECUTION_CONTROL.md](EXECUTION_CONTROL.md).
- 결과표·재실행 명령·복구 방법: [STAGE_1_LOCAL_DEMO_BASELINE.md](STAGE_1_LOCAL_DEMO_BASELINE.md).
- 데모 진입, 합성 회원 등록·수정, 1개/3개 동작 작성, 고정 샘플의 완료/못함·통증·메모 UI, 코치 제어, 첫 재등록 카드 확인. 실제 저장 성공으로 간주하지 않는다.
- 실패: 생성한 새 링크는 회원 화면에서 유효하지 않음. 일반 작성 완료 후 다음 수업 버튼은 `/app/session`으로 가서 404. Pro 제한 구간과 실제 음성 출력·실기기·실DB는 검증하지 않았다.
- `npm run verify`: 48/48 테스트·TypeScript·ESLint 통과. `npm run build`: 통과. 최초 빌드는 샌드박스 EPERM으로 실패했으나 동일 명령의 허용된 로컬 재실행으로 통과. middleware 폐기 예정 경고 잔존.
- 코드·DB·인증·의존성 수정 없음. 기존 비문서 파일 66개가 0단계 시작 시 해시와 동일함을 확인했다. 이번 수정은 실행 상태·핸드오프·문서 인덱스와 신규 검사 보고서뿐이다.
- 브랜치 `main`, HEAD `d30925bd437e504d64a514e533a5986e46f54829`, 스테이징 변경 없음. 기존 강의 앱 삭제와 운동숙제 신규 파일의 전체 전환 범위를 승인된 커밋 단위로 확정하지 못해 커밋하지 않았다.
- 새 로컬 기준선: `C:/Users/tmd31/.codex/visualizations/2026/09/12/01a093c4-d507-7a61-affa-0e3b0264e203/instructor-sync-stage1-baseline-2026-09-12/`. ZIP·Git patch·상태/해시 manifest·복구 설명을 함께 보존한다. 아래 pre-guidelines 스냅샷은 이전 이력이며 최신 기준선이 아니다.
- 검사용 서버·임시 탭 종료. 외부 DB·업로드·배포·실제 회원 데이터 사용 없음. 2단계 아키텍처·파일럿 결정은 착수하지 않았다.

## 0단계 — 작업환경 설정 결과 (과거 완료 기록, 2026-09-12)

- 당시 상태: **DONE**, 검증 수준: **로컬 검증됨**, 당시 다음 단계는 1이었다. 현재 단계·다음 단계는 [EXECUTION_CONTROL.md](EXECUTION_CONTROL.md)를 따른다.
- 사용 Skill: `skill-creator`. `AGENTS.md`는 이미 짧고 실행 가능하여 수정하지 않았다. 문서 인덱스에 실행 상태·설정용 지침·Skill 라우팅만 추가했다.
- [CHATGPT_PROJECT_INSTRUCTIONS.md](CHATGPT_PROJECT_INSTRUCTIONS.md)는 붙여넣기용 14줄이다. 현재 도구에 프로젝트 지침 직접 저장 기능이 없어 UI 설정은 미적용이다.
- 사용자 UI 작업 1개: ChatGPT 운동숙제 프로젝트 우측 상단 `⋯ → 프로젝트 설정 → 프로젝트 지침`에 위 파일 전문을 붙여넣고 저장한다. 로컬 설치 Skill과 저장소 파일은 일반 ChatGPT 대화에서 자동 접근 가능하다고 가정하지 않는다.

### 개인 Skill 설치 확인

| 이름 | 실제 확인 | 설명/범위 |
| --- | --- | --- |
| `homework-data-integrity` | 미설치: 검색한 경로에 해당 이름/설명을 가진 SKILL.md 없음 | 설치본 설명 확인 불가. 기대 역할은 데이터·인증 무결성 검토 |
| `homework-release-gate` | 미설치: 검색한 경로에 해당 이름/설명을 가진 SKILL.md 없음 | 설치본 설명 확인 불가. 기대 역할은 출시 준비 판정 |
| `homework-practical-review` | 신규 개인 설치·로컬 검증 완료 | 운동숙제 새 기능·제품 정책·센터 파일럿 범위·사용자 흐름·운영 방식의 구현 전 검토. 일반 코딩·단순 UI 수정·구현 후 코드 리뷰 제외 |

설치 확인은 대화 Skill 목록 대신 파일시스템을 우선했다. `C:/Users/tmd31/.codex/skills/`와 `.codex/plugins/cache/`의 SKILL.md 이름·설명을 검색했고, 사용자 `.agents/skills/`, `.claude/skills/` 및 저장소 `.agents/skills/`, `.claude/skills/`, `.codex/skills/` 경로도 확인했으나 존재하지 않았다. 확인하지 못한 다른 컴퓨터·클라우드의 설치 상태는 주장하지 않는다. 기존 두 Skill은 새로 만들지 않았다.

새 설치본: `C:/Users/tmd31/.codex/skills/homework-practical-review/SKILL.md`.
SHA-256: `EE533D37F7843E6068DDCA0CB39B9043A4E03A8F8D0393FED8B5D206F2115AC5`.
작업용 staging은 저장소 밖 visualization 폴더에 두었고, 개인 탐색 경로에는 설치본 하나만 있다. 현재 대화 목록의 갱신이나 자동 선택 성공까지 검증한 것은 아니다.

### 0단계 검사와 다음 작업 경계

- `quick_validate.py` 실행은 PyYAML 부재로 실패했다. 의존성 변경 없이 이 Skill의 단순 YAML 필드, 이름 규칙·길이, 설명·placeholder, 설치본 해시 일치, 문서 참조를 별도 Node 검사로 확인해 통과했다. 공식 검증기 통과로 표기하지 않는다.
- 적용 범위 수동 검토: 새 파일럿 운영 정책·사용자 흐름 검토는 적용, 버튼 색상 변경·단순 오류 수정·다른 프로젝트 요청은 제외. 자동 라우터 실험 결과는 아니다.
- 문서 링크·14줄 길이·0~10 단계 상태와 다음 단계 참조를 검사했다. `npm run verify` 48/48 테스트·TypeScript·ESLint 통과, `npm run build` 통과. 기존 middleware 폐기 예정 경고가 남는다.
- DB 검사는 기존 메모리 PGlite 테스트만 실행했으며 실제 DB에 연결하지 않았다. 앱·DB·인증·의존성 코드는 변경하지 않았다.
- 후속 데이터/인증 작업과 출시 판정에는 미설치 Skill 문제를 명시하고 필요한 대체 기준을 정해야 한다. 0단계 완료는 DB 이전·운영 사용 허가가 아니다.

## 현재 기준

- 이 저장소의 현재 제품은 운동숙제 Next.js 애플리케이션이다.
- 소원 앱, 과거 강의 분석, FastAPI/LangChain 지침과 경로는 현재 범위가 아니다.
- 현재 Supabase Postgres/Auth/RLS/RPC를 유지한다. 자체 PostgreSQL 이전은 아직 시작하지 않았다.
- 운영 배포, 외부 업로드, 실제 데이터 접근·변경은 수행하지 않았다.

## 2026-09-12 완료

- 작업 전 상태를 외부 로컬 폴더에 전체 workspace ZIP과 Git binary patch로 보존하고 SHA-256을 기록했다.
- `AGENTS.md`를 제품 목표, 흐름, 진입점, 문서 라우팅, 보존 규칙, DB 불변조건, 검사·운영 경계만 남긴 실행 지침으로 교체했다.
- `PRODUCT_BASELINE.md`를 제품 결정의 단일 기준으로 만들고 확정·검증 중·제안·폐기와 구현·검증 상태를 분리했다.
- `DATA_INTEGRITY_AND_POSTGRES_MIGRATION.md`에 소유권·원자성·멱등성·토큰 최소 권한과 이전 착수 게이트를 정리했다.
- 과거 GTM/검토/일일 핸드오프를 참고 또는 보관 문서로 표시하고 `docs/README.md`에 요청별 최소 읽기 경로를 만들었다.
- 실제 DB 구조, SQL 마이그레이션, 인증 코드, 애플리케이션 코드는 변경하지 않았다.
- 문서 링크/상태 검사를 통과했고, `npm run verify`는 48/48 테스트·TypeScript·ESLint를 통과했으며 `npm run build`도 통과했다. 빌드에는 Next.js의 `middleware` 파일명 폐기 예정 경고가 남는다.

## 보존 스냅샷

경로: `C:\Users\tmd31\.codex\visualizations\2026\09\12\01a093c4-d507-7a61-affa-0e3b0264e203\instructor-sync-snapshot-2026-09-12-pre-guidelines`

- 기준 커밋: `d30925bd437e504d64a514e533a5986e46f54829`
- `workspace-current-safe.zip`: 현재 존재 파일 전체(비밀값·의존성·빌드 캐시 제외)
- `working-tree.patch`: 기준 커밋 대비 추적 변경과 삭제
- 복구 절차와 해시는 스냅샷 폴더의 `README.md` 참조

## 현재 데이터 위험과 미확정 사항

- 숙제와 동작 생성은 연속 insert라 중간 실패 시 부모 숙제가 남을 수 있다.
- 회원 제출은 원자적 RPC 코드와 로컬 롤백 테스트가 있으나 요청 ID가 없어 재시도 멱등성이 없다.
- 실제 Supabase 적용 상태와 두 실제 강사 계정 간 격리는 확인하지 않았다.
- 자체 PostgreSQL의 기술 선택·토큰·전환/롤백은 ADR-001에서 확정했다. 실제 제공자·운영 정책·적용/복구 검증은 남아 있다.
- 무료 10개 센터의 기간·회원 한도·지원 범위·유료 전환과 가격은 미확정이다.

## 다음 작업 전 체크리스트

다음 작업은 [EXECUTION_CONTROL.md](EXECUTION_CONTROL.md)의 **4단계 재개**다. Docker 설치 권한을 먼저 해결하고 AGENTS, 문서 인덱스, 실행 상태, ADR, P0 검사표에서 필요한 계약을 읽는다. 4단계 clean/upgrade·무결성·복원이 실제 통과하기 전 5단계를 시작하지 않는다. 과거 문맥이나 데이터 문서의 개념 번호를 실행 단계로 해석하지 않는다.

현재 판정: **기술 결정 READY / 4단계 환경 설치 BLOCKED / 실제 마이그레이션·운영 전환 미준비**. 사용자 요청 4~5단계는 미완료로 남아 있다.
