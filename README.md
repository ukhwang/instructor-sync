# 운동숙제 (Exercise Homework)

운동숙제는 강사가 카카오톡으로 회원별 운동 링크를 보내고, 회원의 완료 여부·통증·메모를 다음 수업 준비에 연결하는 Next.js 애플리케이션입니다. 현재 저장소의 제품 기준은 운동숙제이며, Git 기준 커밋에 남은 과거 강의 분석/FastAPI/LangChain 프로젝트는 현행 범위가 아닙니다.

## 현재 기술 기준

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS, TanStack Query, Zustand
- 현재 데이터/인증: Supabase Postgres, Supabase Auth, RLS, Security Definer RPC
- 예정 방향: 자체 PostgreSQL용 합성 로컬 기반과 스키마는 구축·검증했습니다. 애플리케이션 데이터 경계·인증은 아직 전환하지 않았고 기존 Supabase는 유지합니다.

주요 화면은 강사용 `app/app/`, 회원 공개 링크 `app/h/[token]/`, 로그인 `app/login/`에 있습니다. 브라우저 데이터 접근은 `lib/db.ts`, 서버 데이터 접근은 `lib/db-server.ts`, 현재 SQL은 `supabase/migrations/`에 있습니다.

## 문서 찾기

- 제품 범위와 결정: [제품 기준](docs/PRODUCT_BASELINE.md)
- 데이터 불변조건과 이전 준비: [데이터 무결성 및 PostgreSQL 이전 기준](docs/DATA_INTEGRITY_AND_POSTGRES_MIGRATION.md)
- 작업 규칙: [AGENTS.md](AGENTS.md)
- 최근 진행 상태: [최신 핸드오프](docs/LATEST_HANDOFF.md)
- 전체 문서 상태: [문서 인덱스](docs/README.md)
- 합성 로컬 PostgreSQL: [실행·백업·복원 runbook](infra/postgres/README.md)

시장·가격·현장 검토서는 참고 자료이며 제품 정책의 기준이 아닙니다. 과거 일일 핸드오프에는 다른 프로젝트 내용이 섞여 있으므로 현재 작업의 시작점으로 사용하지 않습니다.

## 로컬 실행

```bash
npm install
npm run dev
```

로컬 환경 변수 이름은 `.env.example`을 기준으로 하고 실제 비밀값은 커밋하지 않습니다. 데모 모드는 실제 저장·권한 동작을 증명하지 않습니다.

## 검사

```bash
npm run verify
npm run build
```

`npm run verify`는 단위/DB 테스트, TypeScript, ESLint를 실행합니다. 이 통과 결과는 운영 Supabase 적용, 실제 계정 격리, 카카오톡 인앱 브라우저 또는 모바일 오디오 검증을 대신하지 않습니다.
