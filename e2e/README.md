# E2E (Playwright) — 로컬 Cloudflare Workers + 로컬 D1

운영 DB·실계정에는 절대 붙지 않는다. `E2E_BASE_URL`은 localhost만 허용한다(`e2e/support/env.ts`).

## 실행

```bash
cp .dev.vars.example .dev.vars   # BETTER_AUTH_SECRET 을 임의의 32자 이상으로, URL 은 http://localhost:8787
npm run cf:build                 # opennextjs-cloudflare build
npm run cf:migrate               # wrangler d1 migrations apply --local
npm run test:e2e                 # wrangler dev(8787)를 띄우고 전체 스펙 실행
```

- 이미 `wrangler dev`가 떠 있으면 `E2E_SKIP_WEBSERVER=1`.
- 번들 Chromium 버전이 다르면 `PLAYWRIGHT_CHROME_PATH=/path/to/chrome`.
- 로그인 rate limit(D1 `rate_limit`)은 IP 단위라, 짧은 시간에 반복 실행하면 429가 날 수 있다. 로컬 D1의 `rate_limit` 행을 지우거나 1분 뒤 재실행한다.

## 스펙

- `one-loop.spec.ts` (mobile-390, desktop-1280): 초대 가입한 원장 로그인 → 스케줄 → 겹치는 예약 차단 → 수업 완료(잔여 1회 차감) → 숙제 바텀시트(마스터 DB 검색·코칭 태그) → 출제 → 회원 모바일(로그인 없음) 세트 체크·통증·소감 제출 → 대시보드·다음 수업 브리핑 반영 → 10회차 리포트.
- `security.spec.ts` (desktop): 교차 원장 화면 차단, 세션 없음·위조 쿠키 차단(layout의 D1 세션 검증), 초대 없는 가입 403, 세션 쿠키 HttpOnly·Secure·SameSite=Lax, 로그인 rate limit 429, `/h`·`/report` 최소 노출·no-store·no-referrer, 공개 리포트 메모 비노출, 레거시 REST 부재.

픽스처(초대 행, 회원)는 `e2e/support/d1.ts`가 로컬 D1 파일에 직접 넣는다. 강사 계정은 실제 Better Auth 가입 엔드포인트로 만든다.
