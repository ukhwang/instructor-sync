# 운동숙제 (Exercise Homework)

운동숙제는 강사가 카카오톡으로 회원별 운동 링크를 보내고, 회원의 완료 여부·통증·메모를 다음 수업 준비에 연결하는 Next.js 애플리케이션입니다. 현재 저장소의 제품 기준은 운동숙제이며, Git 기준 커밋에 남은 과거 강의 분석/FastAPI/LangChain 프로젝트는 현행 범위가 아닙니다.

## 현재 기술 기준

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS, TanStack Query, Zustand
- 호스팅: Cloudflare Workers (`@opennextjs/cloudflare`, `wrangler.jsonc`)
- 데이터/인증: Cloudflare D1(SQLite) + 서버 리포지토리(`lib/server/db/repositories/`), Better Auth on D1(초대제 가입, DB 세션)
- 상태: 코드 구현·로컬 Workers/D1 검증 완료, Cloudflare 계정 배포는 미적용. 이관 기준·명령·롤백은 [Cloudflare 이관 문서](docs/CLOUDFLARE_MIGRATION.md)
- 이전 Supabase 스키마(`supabase/migrations/`)는 롤백·의미 참조용으로만 남아 있고 앱 코드는 참조하지 않습니다.

주요 화면은 강사용 `app/app/`, 회원 공개 링크 `app/h/[token]/`, 로그인 `app/login/`에 있습니다. 강사 화면 읽기는 Server Component(`lib/db-server.ts`), 쓰기는 Server Action(`app/actions/`)이며 브라우저 DB 클라이언트는 없습니다. 현재 SQL은 `migrations/`(wrangler D1 형식)에 있습니다.

## 문서 찾기

- 제품 범위와 결정: [제품 기준](docs/PRODUCT_BASELINE.md)
- 데이터 불변조건: [데이터 무결성 기준](docs/DATA_INTEGRITY_AND_POSTGRES_MIGRATION.md)
- Cloudflare Workers + D1 구조·매핑·배포 명령: [Cloudflare 이관](docs/CLOUDFLARE_MIGRATION.md)
- 작업 규칙: [AGENTS.md](AGENTS.md)
- 최근 진행 상태: [최신 핸드오프](docs/LATEST_HANDOFF.md)
- 전체 문서 상태: [문서 인덱스](docs/README.md)
- 보관: 자체 PostgreSQL 트랙 [runbook](infra/postgres/README.md) (D1 이관으로 앱 런타임에서 사용하지 않음)

시장·가격·현장 검토서는 참고 자료이며 제품 정책의 기준이 아닙니다. 과거 일일 핸드오프에는 다른 프로젝트 내용이 섞여 있으므로 현재 작업의 시작점으로 사용하지 않습니다.

## 로컬 실행

```bash
npm install
cp .dev.vars.example .dev.vars
npm run cf:migrate
npm run dev
```

`npm run dev`는 `initOpenNextCloudflareForDev()`로 로컬 D1(`.wrangler/state`)과 `.dev.vars`를 붙입니다. 실제 Workers 런타임으로 확인하려면 `npm run preview`(빌드 + `wrangler dev`). 첫 강사 계정은 초대가 필요합니다: `node scripts/cf/invite-trainer.mjs you@example.com --local --apply` 후 `/login`에서 "초대받으셨나요? 회원가입". 실제 비밀값은 커밋하지 않습니다.

## 검사

```bash
npm run verify
npm run cf:build
npm run cf:dry-run
npm run test:e2e
```

`npm run verify`는 단위/D1 통합 테스트(node:sqlite 위에서 실제 `migrations/*.sql` 적용), TypeScript, ESLint를 실행합니다. `test:e2e`는 로컬 `wrangler dev` + 로컬 D1에서 Playwright를 돌립니다([e2e/README.md](e2e/README.md)). 이 결과는 Cloudflare 원격 배포, 실제 계정 격리, 카카오톡 인앱 브라우저 또는 모바일 오디오 검증을 대신하지 않습니다.
