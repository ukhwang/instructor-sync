import { expect, type Locator, type Page } from "@playwright/test";

/** 가로 스크롤(레이아웃 깨짐) 없음: 문서 폭이 뷰포트 폭을 넘지 않는다. */
export async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(
    Math.max(metrics.scrollWidth, metrics.bodyScrollWidth),
    `${label}: 가로 스크롤 발생 (scrollWidth=${metrics.scrollWidth}, body=${metrics.bodyScrollWidth}, clientWidth=${metrics.clientWidth})`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

/** 4060 시니어 UX: 핵심 터치 타깃 최소 높이·너비 */
export async function expectTouchTarget(locator: Locator, min = 64): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, "요소가 화면에 보이지 않아요").not.toBeNull();
  expect(Math.round(box!.height), `터치 높이 ${box!.height}px < ${min}px`).toBeGreaterThanOrEqual(min);
  expect(Math.round(box!.width), `터치 너비 ${box!.width}px < 44px`).toBeGreaterThanOrEqual(44);
}
