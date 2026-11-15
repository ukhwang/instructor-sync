# E2E (Playwright) — 5단계 원루프

운영 DB 와 무관한 **로컬 Supabase** 위에서 실데이터로 돈다. 모킹 없음, service_role 미사용(모든 준비·검증은 강사 본인 토큰 또는 anon 키로 RLS·RPC 경로를 그대로 탄다).
`E2E_SUPABASE_URL` 이 localhost 가 아니면 테스트가 시작 전에 중단된다 (`e2e/support/env.ts`).

| 파일 | 내용 |
| --- | --- |
| `one-loop.spec.ts` | 로그인 → 스케줄 생성 → 겹침 예약 차단 → 수업 완료(패키지 차감) → 숙제 바텀시트(마스터 DB 검색·코칭 태그) → `/h/[token]` 회원 제출(390×844, GIF 200, 64px 터치) → 대시보드·다음 수업 브리핑 → `/report/[token]` |
| `security.spec.ts` | 원장 간 격리(조회·RPC·직접 쓰기), anon 권한, 겹침 exclusion, `/h` 최소 노출·`no-store` |

## 1) 로컬 스택

Docker 가 있으면:

```bash
supabase start && supabase db reset        # supabase/migrations 전부 적용
# 출력된 API URL / anon key 를 아래 env 에 사용
```

Docker 가 없으면 (PostgreSQL 16 로컬 설치 필요, GoTrue·PostgREST 바이너리는 GitHub 릴리스에서 받음):

```bash
bash e2e/local-stack/start.sh             # 실행마다 새 DB 클러스터, UTC
source e2e/local-stack/.stack/e2e.env
# 끝나면: bash e2e/local-stack/stop.sh
```

## 2) 빌드 → 실행

```bash
export E2E_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL E2E_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run build                              # NEXT_PUBLIC_* 가 빌드에 인라인되므로 로컬 값으로 빌드
npm run test:e2e                           # next start -p 3100 자동 기동 (이미 떠 있으면 재사용)
# 번들 Chromium 을 받을 수 없는 환경: PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome npm run test:e2e
```

검증 범위 밖: 실제 카카오톡 인앱 브라우저·iOS Safari·실기기 음성 인식, 운영 Supabase 적용 상태.
