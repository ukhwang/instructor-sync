import { randomBytes, randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { E2E_BASE_URL } from "./support/env";
import { createMember, execute, select, sha256, signUpTrainer, type SeedMember, type TrainerSession } from "./support/d1";

/**
 * Tenant isolation, session guard and public-link minimum exposure on the local
 * Workers runtime + local D1 (HTTP contract, no UI). Desktop project only.
 */

interface Fixture {
  trainer: TrainerSession;
  member: SeedMember;
  homeworkId: string;
  token: string;
}

const MEMO = "원장만 알아야 하는 비밀 메모";

function seedHomework(trainer: TrainerSession, member: SeedMember): { homeworkId: string; token: string } {
  const token = randomBytes(12).toString("hex");
  const homeworkId = randomUUID();
  execute(
    `INSERT INTO homework (id, trainer_id, member_id, token_hash, token_expires_at, why, status)
     VALUES (?, ?, ?, ?, ?, '격리 검증용 숙제', 'sent')`,
    homeworkId,
    trainer.userId,
    member.id,
    sha256(token),
    new Date(Date.now() + 86_400_000).toISOString(),
  );
  execute(
    `INSERT INTO homework_items (id, homework_id, order_index, name, cue, target_sets, target_reps, effort_kind, reps)
     VALUES (?, ?, 1, '글루트 브릿지 (Glute Bridge)', '천천히', 2, '10회', 'reps', 10)`,
    randomUUID(),
    homeworkId,
  );
  return { homeworkId, token };
}

async function seed(label: string): Promise<Fixture> {
  const trainer = await signUpTrainer(label);
  const member = createMember(trainer, `격리${label}`);
  return { trainer, member, ...seedHomework(trainer, member) };
}

async function page(request: APIRequestContext, path: string, cookie?: string) {
  return request.get(path, { headers: cookie ? { cookie } : {}, maxRedirects: 0 });
}

test.describe("D1 서버 인가 · 세션 · 공개 링크", () => {
  let a: Fixture;
  let b: Fixture;

  test.beforeAll(async () => {
    a = await seed("A");
    b = await seed("B");
  });

  test("다른 원장의 회원·숙제 화면은 열리지 않는다 (서버 스코프)", async ({ request }) => {
    const member = await page(request, `/app/members/${a.member.id}`, b.trainer.cookie);
    expect(member.status()).toBe(200);
    const memberHtml = await member.text();
    expect(memberHtml).toContain("회원을 찾을 수 없습니다");
    expect(memberHtml).not.toContain(a.member.phone);

    const homework = await page(request, `/app/homework/${a.homeworkId}`, b.trainer.cookie);
    const homeworkHtml = await homework.text();
    expect(homeworkHtml).toContain("숙제를 찾을 수 없습니다");
    expect(homeworkHtml).not.toContain(a.token);

    // 대조군: 본인은 보인다 (토큰은 봉인 저장이 없는 fixture라 링크는 비어 있음)
    const own = await page(request, `/app/members/${a.member.id}`, a.trainer.cookie);
    expect(await own.text()).toContain(a.member.phone);
  });

  test("세션 없음·위조 쿠키는 /app 에 들어올 수 없다", async ({ request }) => {
    for (const path of ["/app", "/app/members", "/app/schedules", `/app/members/${a.member.id}`]) {
      const anonymous = await page(request, path);
      expect(anonymous.status(), path).toBe(307);
      expect(anonymous.headers()["location"]).toContain("/login");
    }
    // 쿠키 존재만으로는 통과하지 못한다: 미들웨어(쿠키 유무)는 통과시키지만 layout 이 D1 세션을 검증한다.
    for (const name of ["__Secure-homework.session_token", "homework.session_token"]) {
      const forged = await page(request, "/app/members", `${name}=forged.value`);
      expect([303, 307, 308], name).toContain(forged.status());
      expect(forged.headers()["location"]).toContain("/login");
    }
  });

  test("초대 없는 가입은 거부되고, 세션 쿠키는 HttpOnly·SameSite=Lax 이다", async ({ request }) => {
    const uninvited = await request.post("/api/auth/sign-up/email", {
      headers: { Origin: E2E_BASE_URL },
      data: { email: `nobody-${randomUUID()}@e2e.local`, password: "long-enough-password", name: "x" },
    });
    expect(uninvited.status()).toBe(403);
    expect(await uninvited.json()).toMatchObject({ message: "SIGNUP_INVITE_REQUIRED" });

    const signIn = await request.post("/api/auth/sign-in/email", {
      headers: { Origin: E2E_BASE_URL },
      data: { email: a.trainer.email, password: a.trainer.password },
    });
    expect(signIn.status()).toBe(200);
    const sessionCookie = signIn.headersArray().find((header) => header.name.toLowerCase() === "set-cookie" && header.value.includes("session_token"));
    expect(sessionCookie?.value).toMatch(/HttpOnly/i);
    expect(sessionCookie?.value).toMatch(/SameSite=Lax/i);
    expect(sessionCookie?.value).toMatch(/Path=\//);
    // Production build (OpenNext sets NODE_ENV=production): Secure + __Secure- prefix.
    expect(sessionCookie?.value).toMatch(/; Secure/i);
    expect(sessionCookie?.value).toMatch(/^__Secure-homework\.session_token=/);
    expect(signIn.headers()["cache-control"]).toMatch(/no-store/);

    // 프로필 권한 필드는 가입 경로로 올릴 수 없다 (NV-2)
    const profile = select<Array<{ is_pro: number }>>("SELECT is_pro FROM profiles WHERE id = ?", a.trainer.userId);
    expect(profile[0]?.is_pro).toBe(0);
  });

  test("로그인 시도는 D1 기반 rate limit 으로 제한된다", async ({ request }) => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request.post("/api/auth/sign-in/email", {
        headers: { Origin: E2E_BASE_URL },
        data: { email: b.trainer.email, password: "wrong-password-123" },
      });
      statuses.push(response.status());
    }
    expect(statuses).toContain(401);
    expect(statuses).toContain(429);
    expect(select<Array<{ n: number }>>("SELECT count(*) AS n FROM rate_limit")[0]!.n).toBeGreaterThan(0);
  });

  test("/h/[token] 는 최소 정보만 노출하고 캐시되지 않는다", async ({ request }) => {
    const response = await page(request, `/h/${a.token}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toMatch(/no-store/);
    expect(response.headers()["referrer-policy"], "토큰 URL 이 Referer 로 새지 않음").toBe("no-referrer");
    expect(response.headers()["x-robots-tag"]).toMatch(/noindex/);
    const html = await response.text();
    expect(html).toContain(a.member.name);
    for (const secret of [a.member.phone, a.member.id, a.trainer.userId, a.trainer.email, b.member.name, b.token]) {
      expect(html, `노출 금지 값: ${secret}`).not.toContain(secret);
    }
    const missing = await page(request, `/h/${randomBytes(12).toString("hex")}`);
    expect(await missing.text()).toContain("유효하지 않은 링크입니다");
  });

  test("공개 리포트는 회원 메모 원문을 싣지 않는다 (NV-1)", async ({ request }) => {
    const submissionId = randomUUID();
    const snapshot = JSON.stringify({
      version: 2, homework_id: a.homeworkId, result: "partial", discomfort_level: 6,
      note: `기분: 아픔 | 부위: 허리 | 통증: 6/10 | 세트: 1/2 | 메모: ${MEMO}`, exercises: [], submitted_at: new Date(Date.now() - 60_000).toISOString(),
    });
    execute(
      "INSERT INTO homework_submissions (id, homework_id, snapshot, snapshot_hash, submitted_at) VALUES (?, ?, ?, ?, ?)",
      submissionId, a.homeworkId, snapshot, sha256(snapshot), new Date(Date.now() - 60_000).toISOString(),
    );
    const reportToken = randomBytes(12).toString("hex");
    execute(
      "INSERT INTO milestone_reports (id, trainer_id, member_id, token_hash, session_number, created_at, expires_at) VALUES (?, ?, ?, ?, 10, ?, ?)",
      randomUUID(), a.trainer.userId, a.member.id, sha256(reportToken), new Date().toISOString(), new Date(Date.now() + 86_400_000).toISOString(),
    );
    const response = await page(request, `/report/${reportToken}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    const html = await response.text();
    expect(html).toContain(a.member.name);
    expect(html).not.toContain(MEMO);
    expect(html).not.toContain(a.member.phone);
    expect(response.headers()["cache-control"]).toMatch(/no-store/);
  });

  test("레거시 REST 엔드포인트는 없다 (DB는 서버 내부 바인딩으로만 접근)", async ({ request }) => {
    for (const path of [`/api/members/${a.member.id}`, `/api/homeworks/${a.homeworkId}`, "/rest/v1/members", "/auth/callback"]) {
      expect((await page(request, path)).status(), path).toBe(404);
    }
  });
});
