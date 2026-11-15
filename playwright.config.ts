import { defineConfig, devices } from "@playwright/test";

/**
 * 5단계 E2E 원루프 (원장 스케줄 → 수업 완료 → 숙제 출제 → 회원 모바일 제출 → 브리핑·리포트).
 *
 * 실행 전제: 로컬 Supabase(또는 동등한 로컬 스택)와 그 URL 로 빌드한 앱.
 *   E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY 는 localhost 만 허용한다 (e2e/support/env.ts 에서 강제).
 *   운영 DB 로는 절대 실행되지 않는다.
 *
 * 브라우저: 기본은 Playwright 번들 Chromium. 번들을 받을 수 없는 환경은
 *   PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome 처럼 설치된 Chrome 경로를 지정한다.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
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
        command: "npm run start -- -p 3100",
        url: `${baseURL}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
