import { randomBytes, randomUUID } from "node:crypto";


import { expect, test } from "@playwright/test";

import { addDays, createMember, nextMondayKst, rpc, select, signUpTrainer, type SeedMember, type TrainerSession } from "./support/supabase";

/**
 * 테넌트 격리·노로그인 토큰 최소 노출·캐싱 정책 (실DB + 실RLS, service_role 미사용).
 * 브라우저 UI 가 아니라 계약 검증이므로 데스크톱 프로젝트에서만 돈다 (playwright.config.ts testIgnore).
 */

type Envelope = { success: boolean; reason?: string; [key: string]: unknown };

interface Fixture {
  trainer: TrainerSession;
  member: SeedMember;
  lessonId: string;
  homeworkId: string;
  token: string;
}

async function seedTrainerWithHomework(label: string, hour: number): Promise<Fixture> {
  const trainer = await signUpTrainer(label);
  const member = await createMember(trainer, `격리${label}`);
  const startsAt = `${addDays(nextMondayKst(), 2)}T${String(hour).padStart(2, "0")}:00:00+09:00`;
  const lessons = await rpc<Envelope & { lessons: Array<{ id: string }> }>(trainer, "create_lessons", {
    p_series_id: randomUUID(),
    p_member_id: member.id,
    p_starts_at: startsAt,
    p_duration_min: 50,
    p_repeat_weeks: 0,
  });
  expect(lessons.success).toBe(true);
  const token = randomBytes(12).toString("hex");
  const created = await rpc<Envelope & { id: string }>(trainer, "create_homework_v2", {
    p_request_id: randomUUID(),
    p_member_id: member.id,
    p_why: "격리 검증용 숙제",
    p_token: token,
    p_token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    p_items: [
      {
        order_index: 1,
        name: "글루트 브릿지 (Glute Bridge)",
        cue: "천천히",
        target_sets: 2,
        target_reps: "10회",
        effort_kind: "reps",
        reps: 10,
        hold_seconds: null,
        seconds_per_rep: 3,
        rest_seconds: 20,
        per_side: false,
        requirement: "required",
      },
    ],
    p_assignment_purpose: "routine",
    p_burden_budget_seconds: null,
    p_source_homework_id: null,
  });
  expect(created.success, JSON.stringify(created)).toBe(true);
  return { trainer, member, lessonId: lessons.lessons[0]!.id, homeworkId: created.id, token };
}

test.describe("테넌트 격리 (RLS + SECURITY DEFINER RPC)", () => {
  let a: Fixture;
  let b: Fixture;

  test.beforeAll(async () => {
    a = await seedTrainerWithHomework("A", 10);
    b = await seedTrainerWithHomework("B", 10); // 같은 시각이어도 강사가 다르면 겹침 아님
  });

  test("다른 원장의 회원·수업·숙제·제출·리포트는 조회되지 않는다", async () => {
    for (const path of [
      `members?select=id,phone&id=eq.${a.member.id}`,
      `lessons?select=id&id=eq.${a.lessonId}`,
      `homework?select=id,token&id=eq.${a.homeworkId}`,
      `homework_items?select=id&homework_id=eq.${a.homeworkId}`,
      `homework_submissions?select=id&homework_id=eq.${a.homeworkId}`,
      `milestone_reports?select=id&member_id=eq.${a.member.id}`,
    ]) {
      expect(await select<unknown[]>(b.trainer, path), path).toEqual([]);
    }
    // 본인 데이터는 보인다 (대조군)
    expect(await select<unknown[]>(a.trainer, `lessons?select=id&id=eq.${a.lessonId}`)).toHaveLength(1);
  });

  test("다른 원장의 자원으로는 RPC 쓰기가 거부된다", async () => {
    const attempts: Array<[string, Record<string, unknown>, string]> = [
      ["create_lessons", { p_series_id: randomUUID(), p_member_id: a.member.id, p_starts_at: `${nextMondayKst()}T15:00:00+09:00`, p_duration_min: 50, p_repeat_weeks: 0 }, "member_not_found"],
      ["complete_lesson", { p_lesson_id: a.lessonId }, "lesson_not_found"],
      ["revert_lesson_completion", { p_lesson_id: a.lessonId }, "lesson_not_found"],
      ["set_lesson_status", { p_lesson_id: a.lessonId, p_status: "cancelled" }, "lesson_not_found"],
      ["reschedule_lesson", { p_lesson_id: a.lessonId, p_starts_at: `${nextMondayKst()}T16:00:00+09:00`, p_duration_min: 50 }, "lesson_not_found"],
      ["link_homework_to_lesson", { p_homework_id: a.homeworkId, p_lesson_id: a.lessonId }, "not_found"],
      ["link_homework_to_lesson", { p_homework_id: b.homeworkId, p_lesson_id: a.lessonId }, "not_found"],
      ["create_milestone_report", { p_member_id: a.member.id, p_token: randomBytes(12).toString("hex") }, "member_not_found"],
    ];
    for (const [fn, args, reason] of attempts) {
      const result = await rpc<Envelope>(b.trainer, fn, args);
      expect(result, `${fn} 는 거부돼야 함`).toMatchObject({ success: false, reason });
    }
    // A 의 수업은 그대로
    const lesson = await select<Array<{ status: string }>>(a.trainer, `lessons?select=status&id=eq.${a.lessonId}`);
    expect(lesson[0]?.status).toBe("scheduled");
  });

  test("테이블 직접 쓰기로 다른 원장 데이터를 바꿀 수 없다", async () => {
    // 다른 원장 소속으로 회원 INSERT → RLS with_check 위반
    const { supabaseUrl, anonKey } = (await import("./support/env")).e2eEnv();
    const insert = await fetch(`${supabaseUrl}/rest/v1/members`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${b.trainer.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trainer_id: a.trainer.userId, name: "침투", phone: "010-0000-0000" }),
    });
    expect(insert.status).toBe(403);

    // 다른 원장 회원 UPDATE → 0행
    const update = await fetch(`${supabaseUrl}/rest/v1/members?id=eq.${a.member.id}`, {
      method: "PATCH",
      headers: { apikey: anonKey, Authorization: `Bearer ${b.trainer.accessToken}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ package_remaining: 0 }),
    });
    expect(await update.json()).toEqual([]);

    // lessons 는 직접 쓰기 권한 자체가 없다 (RPC 전용)
    const lessonInsert = await fetch(`${supabaseUrl}/rest/v1/lessons`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${a.trainer.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trainer_id: a.trainer.userId, member_id: a.member.id, series_id: randomUUID(), starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 3_000_000).toISOString() }),
    });
    expect(lessonInsert.status).toBe(403);
  });

  test("같은 원장 이중 예약은 DB exclusion 으로 막힌다 (서버 검증과 별개)", async () => {
    const startsAt = `${addDays(nextMondayKst(), 2)}T10:30:00+09:00`; // A 의 10:00~10:50 과 겹침
    const result = await rpc<Envelope>(a.trainer, "create_lessons", {
      p_series_id: randomUUID(),
      p_member_id: a.member.id,
      p_starts_at: startsAt,
      p_duration_min: 30,
      p_repeat_weeks: 0,
    });
    expect(result).toMatchObject({ success: false, reason: "time_conflict" });
  });

  test("anon 은 토큰 RPC 외에 아무것도 읽거나 실행할 수 없다", async () => {
    const { supabaseUrl, anonKey } = (await import("./support/env")).e2eEnv();
    for (const table of ["members", "homework", "lessons", "homework_submissions", "milestone_reports", "profiles"]) {
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, { headers: { apikey: anonKey } });
      expect(response.status, `${table} anon 조회`).toBe(401);
    }
    for (const fn of ["create_lessons", "complete_lesson", "create_homework_v2", "create_milestone_report"]) {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: "{}",
      });
      expect([401, 404], `${fn} anon 실행`).toContain(response.status);
    }
  });

  test("/h/[token] 는 최소 정보만 노출하고 캐시되지 않는다", async ({ request }) => {
    const opened = await rpc<Record<string, unknown>>(null, "open_homework", { p_token: a.token });
    expect(Object.keys(opened).sort()).toEqual(["homework", "items", "logs", "member", "success"]);
    expect(Object.keys(opened.member as object)).toEqual(["name"]);
    expect(Object.keys(opened.homework as object).sort()).toEqual(["created_at", "id", "status", "token_expires_at", "why"]);

    const response = await request.get(`/h/${a.token}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toMatch(/no-store/);
    const html = await response.text(); // HTML + 인라인 RSC payload
    expect(html).toContain(a.member.name);
    for (const secret of [a.member.phone, a.member.id, a.trainer.userId, a.trainer.email, b.member.name, b.token]) {
      expect(html, `노출 금지 값: ${secret}`).not.toContain(secret);
    }

    // 무작위·잘못된 토큰은 존재 여부를 흘리지 않고 같은 안내를 보여준다
    const missing = await request.get(`/h/${randomBytes(12).toString("hex")}`);
    expect(await missing.text()).toContain("숙제");
  });
});
