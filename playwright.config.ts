import { defineConfig, devices } from "@playwright/test";

/**
 * 원루프 E2E (원장 스케줄 → 수업 완료 → 숙제 출제 → 회원 모바일 제출 → 브리핑·리포트)
 * + 서버 인가/세션/공개 링크 계약.
 *
 * 실행 전제: 로컬 Cloudflare Workers 런타임(wrangler dev)과 로컬 D1.
 *   npm run cf:build && npm run cf:migrate && npm run test:e2e
 * E2E_BASE_URL 은 localhost 만 허용한다 (e2e/support/env.ts 에서 강제). 운영 DB 로는 절대 실행되지 않는다.
 * .dev.vars 의 BETTER_AUTH_URL 은 E2E_BASE_URL 과 같은 origin 이어야 한다 (기본 http://localhost:8787).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8787";
const executablePath = process.env.PLAYWRIGHT_CHROME_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    {
      name: "mobile-390",
      // API·RLS 계약 검증은 뷰포트와 무관하므로 데스크톱 프로젝트에서 한 번만 실행
      testIgnore: /security\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop-1280",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npx wrangler dev --port 8787 --ip 127.0.0.1",
        url: `${baseURL}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
