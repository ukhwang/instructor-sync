# 무료 티어 0원 방어 패치 (Vercel Hobby + Supabase Free)

작성 2026-11-20. 기준 `main` `612f09f`. 목적: 캐싱 누수·불필요한 호출을 막아 **월 청구가 발생할 경로를 없앤다.**
이 문서는 "실측한 것"과 "추정"을 구분해 적는다.

## 1. 결론 요약

| 누수 포인트 | 패치 전 (실측) | 패치 후 | 방어 근거 |
| --- | --- | --- | --- |
| Vercel 이미지 변환 | `next/image` 사용 0건. GIF·포스터는 `raw.githubusercontent.com`을 `<img>/<video>`로 직접 로드 → 변환 호출 0회 | 동일 + `images.unoptimized: true`로 전역 잠금 | 코드 grep, `next.config.ts` |
| 미들웨어 Auth 호출 | 세션 쿠키 없는 요청은 `getUser()`가 네트워크 호출 0회(실측). 단 공개 경로에서도 매번 세션 검사 코드가 실행됨 | 공개 경로(`/`, `/demo*`, `/h/*`, `/report/*`, `/auth/*`)는 미들웨어에서 즉시 통과. `sb-` 쿠키가 없으면 Auth 호출 없이 판정 | `scripts/verify/auth-call-probe.mjs`, `lib/route-access.ts` |
| 정적 에셋 캐시 | `/exercise-media/*` = `public, max-age=0` | `public, max-age=31536000, immutable` | 로컬 `next start` 응답 헤더 실측 |
| 대시보드 Egress | `homework_logs(*)` — 세트 기록 payload(jsonb)까지 전량 | `homework_logs(id, homework_id, kind, created_at)` | `app/app/page.tsx` 소비 필드 확인 |
| 7일 미접속 일시정지 | 방어 없음 | `/api/health` + Vercel Cron 매일 1회 | 신규 라우트·`vercel.json` crons |

## 2. 무료 티어 회계 (근거: 벤더 문서)

- Vercel Hobby: Fast Data Transfer 100GB/월, Function Invocations 100만/월, Active CPU 4h/월,
  Image Transformations 5,000/월, CDN Requests 100만/월. 초과 시 과금이 아니라 **해당 기능이 최대 30일 멈춘다**
  (이미지 변환 초과 시 새 이미지는 402 응답). — https://vercel.com/docs/plans/hobby , https://vercel.com/docs/image-optimization/limits-and-pricing
- Supabase Free: DB 500MB, Egress 5GB(+캐시 5GB), 무제한 API 요청, MAU 5만.
  **7일간 DB 활동이 없으면 프로젝트 일시정지**(정지 전 1주 전 경고 메일, 정지 후 1년 내 복구 가능).
  공식 문서는 "지난 한 주 동안 하루 몇 번의 DB 요청이면 충분"이라고 안내한다. — https://supabase.com/pricing , https://supabase.com/docs/guides/platform/free-project-pausing
- 두 플랜 모두 한도 초과가 자동 결제로 이어지지 않는다(Free/Hobby는 한도 초과 시 정지·제한). 즉 "0원" 유지의 핵심은
  **한도 안에서 머무는 것**이고, 이 패치는 그 여유를 만든다.

## 3. 실측 근거

### 3-1. 이미지 최적화 — 이미 0이었다

```
$ grep -rn "next/image" app components        # 결과 0건
$ grep -rn "<Image" app components            # 결과 0건
$ grep -rln "<img" app components             # ExerciseMedia, page, MemberHomeworkClient 등 5개 (모두 <img>)
```

- 운동 GIF/포스터는 GitHub raw URL을 브라우저가 직접 받는다. Vercel CDN·이미지 변환을 타지 않는다.
- 트레이드오프: Vercel `Image Transformations` 5,000/월을 쓰지 않는 대신, GIF 원본(수백 KB)이 그대로 전송된다.
  트래픽의 출처가 GitHub이므로 Vercel 100GB와 Supabase Egress에는 잡히지 않는다.

### 3-2. 미들웨어 Auth 호출 — 실제 호출 횟수 측정

`node scripts/verify/auth-call-probe.mjs` (fetch를 가로채 호출 수를 셈, 2026-11-20):

```
no cookies              | fetch calls: 0 [] | error: AuthSessionMissingError
only unrelated cookie   | fetch calls: 0 [] | error: AuthSessionMissingError
expired session cookie  | fetch calls: 1 [ '/auth/v1/token?grant_type=refresh_token' ] | error: AuthApiError
```

- 쿠키가 없으면 `supabase.auth.getUser()` 자체가 Auth API를 부르지 않는다(supabase-js 2.101 / auth-js).
  즉 회원이 `/h/<token>` 링크를 여는 요청에서 Auth 과금성 호출은 원래 0이었다.
- 실제로 새던 지점은 **세션이 있는 브라우저의 모든 요청**이다. 공개 페이지(`/`, `/demo`, `/h/*`)를 봐도
  미들웨어가 `getUser()`를 불러 `GET /auth/v1/user`(또는 만료 시 refresh)를 1회씩 냈다.
- 패치 후: 공개 경로는 즉시 `NextResponse.next()`로 빠지고, `sb-` 쿠키가 없으면 `/app/*`도 Auth 호출 없이 리다이렉트한다.
  세션 검증은 `/app/*`·`/login`처럼 실제로 필요한 요청에서만 일어난다.

### 3-3. 정적 에셋 캐시 헤더

패치 전 실배포: `access-control-allow-origin: *`, `cache-control: public, max-age=0, must-revalidate` (public/ 자산).
패치 후 로컬 `next start` 실측:

```
$ curl -sI http://127.0.0.1:3100/exercise-media/glute-bridge.svg
HTTP/1.1 200 OK
Cache-Control: public, max-age=31536000, immutable
```

- `/`, `/demo`, `/login`은 원래부터 정적 프리렌더(`x-vercel-cache: HIT`, `x-nextjs-prerender: 1`)라 함수 호출이 없다.
- `/h/[token]`, `/report/[token]`은 토큰 상태가 매번 달라 `no-store`가 맞다(캐시하면 만료·회수한 링크가 계속 열린다). 그대로 둔다.

### 3-4. 대시보드 Egress (Supabase 5GB/월)

`lib/db-server.ts#getAllHomeworks`는 대시보드(`app/app/page.tsx`) 한 곳에서만 쓰인다. 이 화면이 실제로 읽는 로그 필드는
`kind`, `created_at`, `homework_id` 셋뿐이다(`lib/care-queue.ts`). 그런데 조회는 `homework_logs(*)`로 **모든 세트 로그의 payload(jsonb)** 까지
끌어왔다. 세트를 완료할 때마다 1행씩 쌓이므로 이 컬럼이 시간에 따라 무한히 커진다.

패치: `logs:homework_logs(id, homework_id, kind, created_at)`.

- 행 수는 그대로다(정확성 변화 없음). payload만 빠진다.
- **추정**: 로그 1행을 약 230바이트 → 약 120바이트로 보면, 대시보드 1회 로딩에서 로그 부분이 절반 가까이 줄어든다.
  실제 감소율은 Supabase 대시보드의 Database Egress 그래프로 확인해야 한다(추정치이며 실측 아님).

## 4. 변경 파일

| 파일 | 변경 |
| --- | --- |
| `next.config.ts` | `images.unoptimized: true`, `poweredByHeader: false`, `/exercise-media/*` immutable 캐시, `/api/health` no-store |
| `middleware.ts` | 공개 경로 즉시 통과, `sb-` 쿠키 부재 시 Auth 호출 생략, 정적 확장자 matcher 확대 |
| `lib/route-access.ts` | 공개/앱 경로·세션 쿠키 판정 순수 함수 (미들웨어·테스트 공용) |
| `app/api/health/route.ts` | 일시정지 방어 핑. anon 호출 가능한 `open_homework` RPC를 가짜 토큰으로 1회 호출 |
| `vercel.json` | `crons`에 `/api/health` 매일 03:00 UTC 등록 (Hobby는 하루 1회까지) |
| `lib/db-server.ts` | 대시보드 로그 조회 컬럼 축소(payload 제외) |
| `tests/route-access.test.mjs` | 경로·쿠키 판정 6개 테스트 |
| `scripts/verify/auth-call-probe.mjs` | Auth 호출 수 측정 프로브(재현용) |

## 5. 검증 결과 (2026-11-20, 로컬)

```
tsc --noEmit                exit 0
eslint                      exit 0  (0 errors, 10 warnings — 기존 경고 그대로)
node --test                 291 tests / pass 248 / fail 0 / skip 43
next build                  exit 0  (/api/health 추가, 정적 9p·동적 12p)
```

로컬 `next start -p 3100` 스모크 (쿠키 없는 익명 요청):

```
/                     200
/demo                 200
/demo/members         200
/h/demo-token         200
/report/sample-token-demo  200
/login                200
/app                  307 -> /login?next=%2Fapp
/app/schedules        307 -> /login?next=%2Fapp%2Fschedules
/api/health           503 {"ok":false,"db":"unconfigured"}   ← 로컬에 Supabase env 없음(정상)
```

## 6. 주의점

1. **Vercel Hobby는 상업적 이용에 제약이 있다.** Hobby는 비상업·개인 사용 기준이고, 매출이 발생하는 서비스는
   Pro($20/월) 사용이 약관상 전제다. 무료로 운영하는 동안에도 결제를 받기 시작하면 플랜을 올려야 한다.
2. **Supabase 5GB Egress**가 실질 한도다. 한도 초과 시 과금이 아니라 알림 + 유예 후 제한이고, 제한은 다음 사이클에 풀린다.
   여전히 가장 큰 증가 요인은 `homework_logs` 누적이며, 다음 단계는 "회원별 최근 1건 + 14일 집계"를 DB 뷰/RPC로 내리는 것이다
   (스키마 변경이라 이번 패치에서는 손대지 않았다).
3. **7일 일시정지**: 정지되면 회원 링크·대시보드가 모두 멈춘다. `/api/health` 핑이 이를 막는다.
   핑은 GitHub Actions가 아니라 **Vercel Cron**(`vercel.json` `crons`)으로 건다. Hobby도 하루 1회 cron을 허용하고
   (실행 시각은 지정한 시간대 안에서 ±59분 흔들림), 별도 권한·시크릿이 필요 없으며 저장소 60일 무활동으로 꺼지지 않는다.
   (GitHub Actions로 걸려면 GitHub App에 `workflows` 권한이 필요해 이번 푸시에서는 쓸 수 없었다. 부록 A에 YAML을 남겨 둔다.)
4. **핑은 anon 키로 `open_homework`를 호출한다.** `members` 등 테이블은 anon 권한이 회수돼 있어(마이그레이션 540·553행)
   테이블 직접 조회는 401이다. 나중에 이 RPC의 anon 권한을 회수하면 핑이 503을 돌려주게 되고(화면 없이 로그로만 확인 가능),
   그때는 `vercel.json` cron을 잠시 끄거나 anon 실행 권한을 되돌려야 한다.
5. 미들웨어는 Next 16.2에서 `proxy.ts`로 이름이 바뀌는 중이라는 deprecation 경고가 빌드에 남는다. 동작에는 문제가 없어
   이번에는 `middleware.ts`를 유지했다(파일명 변경은 라우팅 전반에 영향).

## 부록 A. GitHub Actions 대안 (사용하려면 App 권한 필요)

푸시 시 `refusing to allow a GitHub App to create or update workflow` 로 거절됐다. GitHub App에 `workflows` 권한을 주거나
사용자가 직접 이 파일을 만들면 아래로 주 2회~매일 핑을 중복으로 걸 수 있다(Vercel Cron과 함께 써도 무해).
사용자는 `https://github.com/apps/pickle/installations/new` 에서 권한을 추가할 수 있다.

```yaml
name: Supabase keep-alive
on:
  schedule:
    - cron: "0 3 * * *" # 매일 03:00 UTC = 12:00 KST
  workflow_dispatch: {}
permissions:
  contents: read
jobs:
  ping:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Ping /api/health
        run: |
          set -uo pipefail
          url="https://instructor-sync-three.vercel.app/api/health"
          code=$(curl -sS -o health.json -w '%{http_code}' --max-time 30 "$url") || code="000"
          cat health.json || true
          if [ "$code" != "200" ]; then
            echo "::error::keep-alive ping failed (HTTP ${code})"
            exit 1
          fi
```
