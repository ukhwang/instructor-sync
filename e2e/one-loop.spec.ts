import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

import { expectNoHorizontalScroll, expectTouchTarget } from "./support/layout";
import {
  addDays,
  createMember,
  nextMondayKst,
  select,
  signUpTrainer,
  slotLabel,
  type SeedMember,
  type TrainerSession,
} from "./support/supabase";

/**
 * 5단계 원루프 (실데이터, 모킹 없음)
 *  1. 원장 로그인 → /app/schedules → 수업 생성 → 겹치는 시간 재예약 차단
 *  2. 수업 완료(complete_lesson) → 숙제 바텀시트 자동 오픈 → 마스터 DB 검색·코칭 태그 → 출제 → /h/[token]
 *  3. 회원(로그인 없음, 390×844) → GIF 200 → 세트 체크 → 통증·부위·소감 제출
 *  4. 원장 대시보드·다음 수업 브리핑에 실데이터 반영 → /report/[token] 실데이터 렌더
 */

const MEMO = "브릿지 2세트에서 허리가 뻐근했어요";
const PAIN_SCORE = 7;

/** 레이아웃 육안 검토용 스크린샷을 리포트에 첨부한다 (playwright-report). */
async function snap(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(`${testInfo.project.name}-${name}`, {
    body: await page.screenshot({ fullPage: false, animations: "disabled" }),
    contentType: "image/png",
  });
}

async function loginAsTrainer(page: Page, trainer: TrainerSession): Promise<void> {
  await page.goto("/app/schedules");
  await expect(page).toHaveURL(/\/login/); // 미로그인 → 로그인 페이지로 차단
  await page.getByPlaceholder("trainer@gym.com").fill(trainer.email);
  await page.getByPlaceholder("••••••••").fill(trainer.password);
  await page.getByRole("button", { name: "대시보드 로그인" }).click();
  await expect(page).toHaveURL(/\/app(\/|$|\?)/);
}

async function openWeek(page: Page, weekStart: string): Promise<void> {
  await page.goto(`/app/schedules?week=${weekStart}`);
  await expect(page.getByRole("tablist", { name: "요일 선택" })).toBeVisible();
}

/** 모바일은 하루씩 보이므로 요일 탭을 먼저 고른다. */
async function focusDay(page: Page, isMobile: boolean, weekStart: string, date: string): Promise<void> {
  if (!isMobile) return;
  const index = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000);
  await page.getByRole("tablist", { name: "요일 선택" }).getByRole("tab").nth(index).click();
}

async function bookLesson(
  page: Page,
  opts: { date: string; time: string; member: SeedMember; duration: "30분" | "50분" | "60분" },
): Promise<void> {
  await page.getByRole("button", { name: slotLabel(opts.date, opts.time), exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("수업 예약")).toBeVisible();
  await sheet.getByRole("button", { name: new RegExp(`^${opts.member.name}`) }).click();
  await sheet.getByRole("button", { name: opts.duration, exact: true }).click();
  await sheet.getByRole("button", { name: "이번만", exact: true }).click();
  await sheet.getByRole("button", { name: `${opts.member.name}님 예약하기` }).click();
}

function lessonBlock(page: Page, time: string, member: SeedMember) {
  return page.getByRole("button", { name: new RegExp(`^${time} ${member.name}님 수업`) });
}

/** 낙관적(pending) 블록이 서버 확정 블록으로 교체될 때까지 기다린다. 퇴장 애니메이션 중인 pending 블록은 제외. */
async function expectConfirmedLesson(page: Page, time: string, member: SeedMember): Promise<void> {
  const blocks = lessonBlock(page, time, member);
  // 재조회·퇴장 애니메이션 사이의 순간 상태를 피하려고 "1개 + 활성 + 저장 중 아님"을 한 번에 폴링한다.
  await expect
    .poll(async () => {
      try {
        const count = await blocks.count();
        if (count !== 1) return `count=${count}`;
        if ((await blocks.textContent({ timeout: 1_000 }))?.includes("저장 중")) return "pending";
        return (await blocks.isEnabled({ timeout: 1_000 })) ? "confirmed" : "disabled";
      } catch {
        return "transition"; // 확인 사이에 pending 블록이 교체되는 중
      }
    })
    .toBe("confirmed");
}

interface LessonRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

async function memberContext(browser: Browser) {
  // 회원은 카톡 링크로 들어온다: 쿠키 없는 새 컨텍스트, 390×844 모바일.
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
}

test("원루프: 스케줄 → 수업 완료 → 숙제 출제 → 회원 모바일 제출 → 브리핑·리포트", async ({ page, browser, isMobile }, testInfo) => {
  const trainer = await signUpTrainer(testInfo.project.name);
  const member = await createMember(trainer, `김E2E${isMobile ? "모" : "데"}`);
  const weekStart = nextMondayKst();
  const lessonDayA = weekStart; // 월 10:00 (완료 처리할 수업)
  const lessonDayB = addDays(weekStart, 1); // 화 10:00 (다음 수업 → 브리핑 대상)

  let lessonA: LessonRow;
  let homeworkUrl = "";

  await test.step("1. 로그인 → 스케줄 → 수업 생성 → 이중 예약 차단", async () => {
    await loginAsTrainer(page, trainer);
    await openWeek(page, weekStart);
    await expectNoHorizontalScroll(page, "스케줄러");
    await snap(page, testInfo, "01-scheduler");

    await focusDay(page, isMobile, weekStart, lessonDayA);
    await bookLesson(page, { date: lessonDayA, time: "10:00", member, duration: "50분" });
    await expectConfirmedLesson(page, "10:00", member); // pending(낙관적) → 서버 확정

    // 겹치는 시간(09:30~10:30) 재예약 → 서버(btree_gist exclusion) 차단 → 토스트 + 낙관적 블록 롤백
    await bookLesson(page, { date: lessonDayA, time: "09:30", member, duration: "60분" });
    await expect(page.getByText("그 시간엔 이미 수업이 있어요.")).toBeVisible();
    await expect(lessonBlock(page, "09:30", member)).toHaveCount(0);

    const lessons = await select<LessonRow[]>(trainer, `lessons?select=id,starts_at,ends_at,status&member_id=eq.${member.id}`);
    expect(lessons, "DB 에는 첫 수업 1건만 존재").toHaveLength(1);
    lessonA = lessons[0]!;
    expect(Date.parse(lessonA.starts_at)).toBe(Date.parse(`${lessonDayA}T10:00:00+09:00`));
    expect(Date.parse(lessonA.ends_at) - Date.parse(lessonA.starts_at)).toBe(50 * 60_000);

    // 다음 수업(화 10:00)
    await focusDay(page, isMobile, weekStart, lessonDayB);
    await bookLesson(page, { date: lessonDayB, time: "10:00", member, duration: "50분" });
    await expect(page.getByText(`${member.name}님 수업을 예약했어요`).last()).toBeVisible();
    if (isMobile) await expectConfirmedLesson(page, "10:00", member);
    await expect
      .poll(async () => (await select<LessonRow[]>(trainer, `lessons?select=id&member_id=eq.${member.id}`)).length)
      .toBe(2);
  });

  await test.step("2. 수업 완료 → 숙제 바텀시트 → 마스터 DB 검색·코칭 태그 → 출제", async () => {
    await focusDay(page, isMobile, weekStart, lessonDayA);
    await lessonBlock(page, "10:00", member).first().click();
    const detail = page.getByRole("dialog");
    await expect(detail.getByRole("heading", { name: `${member.name}님` })).toBeVisible();
    await detail.getByRole("button", { name: "수업 완료하고 숙제 내기" }).click();

    // complete_lesson 성공 시에만 숙제 바텀시트가 열린다
    const drawer = page.getByRole("dialog", { name: "숙제 내기" });
    await expect(drawer).toBeVisible();
    await expectNoHorizontalScroll(page, "숙제 바텀시트");
    await snap(page, testInfo, "02-homework-sheet");

    const done = await select<Array<{ status: string; completed_at: string | null }>>(
      trainer,
      `lessons?select=status,completed_at&id=eq.${lessonA.id}`,
    );
    expect(done[0]?.status).toBe("completed");
    const memberRow = await select<Array<{ package_remaining: number }>>(trainer, `members?select=package_remaining&id=eq.${member.id}`);
    expect(memberRow[0]?.package_remaining, "패키지 1회 차감").toBe(9);

    // 기본 카드에서 버드독(GIF 없음)을 빼고 글루트 브릿지를 1번으로 둔다
    const cards = drawer.getByTestId("homework-card");
    await cards.filter({ hasText: "버드독" }).getByRole("button", { name: "삭제" }).click();
    await expect(cards).toHaveCount(1);
    const bridge = cards.filter({ hasText: "글루트 브릿지" });
    await bridge.getByRole("button", { name: "세트 감소" }).click(); // 3 → 2세트 (휴식 흐름 검증용)

    // 마스터 DB(1,334종) 검색 → 추가
    await drawer.getByPlaceholder(/운동 검색/).fill("랫풀다운");
    await drawer.getByRole("button", { name: /얼터네이트 랫풀다운/ }).first().click();
    await expect(cards).toHaveCount(2);
    const latPull = cards.filter({ hasText: "얼터네이트 랫풀다운" });
    // 세트를 1로 줄이고 코칭 태그 추가
    for (let i = 0; i < 5; i += 1) {
      const minus = latPull.getByRole("button", { name: "세트 감소" });
      if (await minus.isDisabled()) break;
      await minus.click();
    }
    const spineTag = latPull.getByRole("button", { name: "#척추 중립", exact: true });
    await expect(spineTag).toHaveAttribute("aria-pressed", "false");
    await spineTag.click();
    await expect(spineTag).toHaveAttribute("aria-pressed", "true");

    await drawer.getByRole("button", { name: /카카오톡으로 숙제 보내기 \(2개 동작\)/ }).click();
    await expect(page.getByText(`${member.name}님 숙제 준비 완료!`)).toBeVisible();
    homeworkUrl = (await page.getByRole("link", { name: "회원 화면 보기" }).getAttribute("href")) ?? "";
    expect(homeworkUrl).toMatch(/\/h\/[0-9a-f]{24}$/);

    // 실데이터 확인: 숙제가 방금 완료한 수업에 연결되고 동작·코칭 큐가 저장됨
    const token = homeworkUrl.split("/h/")[1];
    const hw = await select<Array<{ id: string; lesson_id: string | null; items: Array<{ name: string; target_sets: number; cue: string; order_index: number }> }>>(
      trainer,
      `homework?select=id,lesson_id,items:homework_items(name,target_sets,cue,order_index)&token=eq.${token}`,
    );
    expect(hw).toHaveLength(1);
    expect(hw[0]!.lesson_id, "수업 ↔ 숙제 연결").toBe(lessonA.id);
    const items = [...hw[0]!.items].sort((a, b) => a.order_index - b.order_index);
    expect(items.map((item) => item.name)).toEqual(["글루트 브릿지 (Glute Bridge)", "얼터네이트 랫풀다운"]);
    expect(items.map((item) => item.target_sets)).toEqual([2, 1]);
    expect(items[1]!.cue).toContain("척추 중립");

    await page.getByRole("button", { name: "완료하고 닫기" }).click();
  });

  await test.step("3. 회원(390×844, 로그인 없음): GIF 200 → 세트 체크 → 통증·소감 제출", async () => {
    const context = await memberContext(browser);
    const memberPage = await context.newPage();
    const path = new URL(homeworkUrl).pathname;

    const gifResponse = memberPage.waitForResponse(
      (response) => response.url().includes("raw.githubusercontent.com") && response.url().endsWith(".gif"),
    );
    const navigation = await memberPage.goto(path);
    expect(navigation?.status()).toBe(200);
    expect(navigation?.headers()["cache-control"] ?? "", "숙제 HTML 은 캐시 금지").toMatch(/no-store/);
    await expect(memberPage).toHaveURL(new RegExp(`${path}$`)); // 로그인·인트로로 돌리지 않음

    await expect(memberPage.getByText(`${member.name}님의 오늘 숙제`)).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: "글루트 브릿지 (Glute Bridge)" })).toBeVisible();
    expect((await gifResponse).status(), "1번 운동 GIF").toBe(200);
    const gif = memberPage.getByRole("img", { name: /글루트 브릿지.*동작 가이드/ });
    await expect(gif).toBeVisible();
    await expect.poll(() => gif.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expectNoHorizontalScroll(memberPage, "/h 운동 화면");
    await snap(memberPage, testInfo, "03-member-workout");

    const cta = memberPage.getByRole("button", { name: "1세트 완료! 쉬기" });
    await expectTouchTarget(cta);
    await cta.click();
    await memberPage.getByRole("button", { name: "바로 2세트 시작" }).click();
    await memberPage.getByRole("button", { name: "2세트 완료! 다음 운동" }).click();

    await expect(memberPage.getByRole("heading", { name: "얼터네이트 랫풀다운" })).toBeVisible();
    await expect(memberPage.getByText("척추 중립").first()).toBeVisible(); // 원장이 고른 코칭 큐
    const secondGif = memberPage.getByRole("img", { name: /얼터네이트 랫풀다운.*동작 가이드/ });
    await expect.poll(() => secondGif.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await memberPage.getByRole("button", { name: "1세트 완료! 마무리" }).click();

    await expect(memberPage.getByRole("heading", { name: "오늘 운동, 어떠셨어요?" })).toBeVisible();
    await memberPage.getByRole("radio", { name: /아픔/ }).click();
    const waist = memberPage.getByRole("button", { name: "허리", exact: true });
    await expectTouchTarget(waist);
    await waist.click();
    const score = memberPage.getByRole("button", { name: `${PAIN_SCORE}점`, exact: true });
    await expectTouchTarget(score);
    await score.click();

    // Web Speech API 미지원·거부 환경의 키보드 폴백: 입력칸에 직접 작성
    const mic = memberPage.getByRole("button", { name: /말로 남기기 시작|말하기 멈추기/ });
    if (await mic.count()) await expectTouchTarget(mic.first());
    await memberPage.locator("#voice-memo-text").fill(MEMO);
    await expectNoHorizontalScroll(memberPage, "/h 피드백 화면");
    await snap(memberPage, testInfo, "04-member-feedback");

    const submit = memberPage.getByRole("button", { name: "선생님께 보내기" });
    await expectTouchTarget(submit);
    await submit.click();
    await expect(memberPage.getByRole("heading", { name: "오늘 숙제 끝!" })).toBeVisible();

    // 서비스 워커 없음 → 과거 숙제 HTML 이 캐시에서 뜨는 경로 자체가 없다
    const registrations = await memberPage.evaluate(async () =>
      "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    );
    expect(registrations).toBe(0);
    await context.close();
  });

  await test.step("4. 대시보드·다음 수업 브리핑 실데이터 반영 → 10회차 리포트", async () => {
    // 대시보드 3초 브리핑 (회원 1명뿐이므로 브리핑 대상 = 이 회원)
    await page.goto("/app");
    const dashboardBriefing = page.getByRole("region", { name: "수업 전 3초 AI 브리핑" });
    await expect(dashboardBriefing.getByText(`${member.name} 님`, { exact: true })).toBeVisible();
    await expect(dashboardBriefing.getByText("회원 기록 기반")).toBeVisible();
    await expect(dashboardBriefing.getByText("샘플 데이터")).toHaveCount(0);
    await expect(dashboardBriefing.getByText(/허리/).first()).toBeVisible();
    await expect(dashboardBriefing.getByText(new RegExp(`${PAIN_SCORE}\\s*/\\s*10|${PAIN_SCORE}점`)).first()).toBeVisible();
    await expect(dashboardBriefing.getByText(/뻐근했어요/).first()).toBeVisible();
    await expectNoHorizontalScroll(page, "대시보드");
    await snap(page, testInfo, "05-dashboard-briefing");

    // 스케줄러: 다음 수업 블록 뱃지가 통증 주의(7 ≥ 6)로 바뀌고, 상세 브리핑에 소감이 보인다
    await openWeek(page, weekStart);
    await focusDay(page, isMobile, weekStart, lessonDayB);
    // (화) 예정 수업. 완료된 (월) 수업은 aria-label 끝에 ", 완료" 가 붙으므로 exact 로 구분한다.
    const nextLesson = page.getByRole("button", { name: `10:00 ${member.name}님 수업, 통증 주의`, exact: true });
    await expect(nextLesson).toBeVisible();
    await nextLesson.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(new RegExp(`통증 ${PAIN_SCORE}/10 · 허리`))).toBeVisible();
    await expect(sheet.getByRole("region", { name: "수업 전 3초 브리핑" }).getByText(/뻐근했어요/).first()).toBeVisible();
    await page.keyboard.press("Escape");

    // 10회차 리포트: 원장이 링크 발급 → 회원(비로그인)이 열람
    await page.goto(`/app/members/${member.id}`);
    await page.getByRole("button", { name: /리포트 링크 만들기/ }).click();
    const preview = page.getByRole("link", { name: /미리보기/ });
    await expect(preview).toBeVisible();
    const reportPath = new URL((await preview.getAttribute("href")) ?? "", "http://x").pathname;
    expect(reportPath).toMatch(/^\/report\/[0-9a-f]{24}$/);

    const context = await memberContext(browser);
    const reportPage = await context.newPage();
    await reportPage.goto(reportPath);
    await expect(reportPage.getByText(`${member.name}님`)).toBeVisible();
    await expect(reportPage.getByRole("heading", { name: /회차 마일스톤 리포트/ })).toBeVisible();
    await expect(reportPage.getByText("1회 중")).toBeVisible();
    await expect(reportPage.getByText("허리 통증 추이")).toBeVisible();
    await expect(reportPage.getByText("시연용 샘플 리포트")).toHaveCount(0);
    await expectNoHorizontalScroll(reportPage, "/report 리포트");
    await snap(reportPage, testInfo, "06-report");
    const html = await reportPage.content();
    expect(html, "리포트에 회원 연락처가 섞이지 않음").not.toContain(member.phone);
    await context.close();
  });
});
