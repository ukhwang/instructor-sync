import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { asDataAccessError } from "./data-access-error";
import { assembleWeekBoard, type HomeworkRow, type LessonRow, type MemberRow, type SubmissionRow } from "./schedule-board";
import {
  SCHEDULE_REASON_MESSAGE,
  addDays,
  kstDateOf,
  type ScheduleMutationResult,
  type WeekBoard,
} from "./schedule-schemas";

/* ────────────────────────────────────────────────────────────
 * 스케줄 데이터 접근 (로그인한 강사 세션 + RLS).
 * 읽기는 RLS 로, 쓰기는 SECURITY DEFINER RPC 로만 한다.
 * ──────────────────────────────────────────────────────────── */

const HOMEWORK_LOOKBACK_DAYS = 60;

export async function getWeekBoard(weekStart: string, now: Date = new Date()): Promise<WeekBoard> {
  const supabase = await createClient();
  const rangeStart = `${weekStart}T00:00:00+09:00`;
  const rangeEnd = `${addDays(weekStart, 7)}T00:00:00+09:00`;

  const lessonsRes = await supabase
    .from("lessons")
    .select("id, member_id, starts_at, ends_at, status")
    .gte("starts_at", rangeStart)
    .lt("starts_at", rangeEnd)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  if (lessonsRes.error) throw asDataAccessError("lessons.week", lessonsRes.error);
  const lessons = (lessonsRes.data ?? []) as LessonRow[];

  const memberIds = [...new Set(lessons.map((lesson) => lesson.member_id))];
  if (memberIds.length === 0) {
    return assembleWeekBoard({ weekStart, now, lessons, members: [], homeworks: [], submissions: [] });
  }

  const lookbackStart = `${addDays(weekStart, -HOMEWORK_LOOKBACK_DAYS)}T00:00:00+09:00`;
  const [membersRes, homeworkRes] = await Promise.all([
    supabase.from("members").select("id, name, package_remaining, package_total").in("id", memberIds),
    supabase
      .from("homework")
      .select("id, member_id, created_at, status, revoked_at")
      .in("member_id", memberIds)
      .gte("created_at", lookbackStart)
      .lt("created_at", rangeEnd)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (membersRes.error) throw asDataAccessError("members.forWeek", membersRes.error);
  if (homeworkRes.error) throw asDataAccessError("homework.forWeek", homeworkRes.error);
  const homeworks = (homeworkRes.data ?? []) as HomeworkRow[];

  let submissions: SubmissionRow[] = [];
  if (homeworks.length > 0) {
    const submissionsRes = await supabase
      .from("homework_submissions")
      .select("homework_id, submitted_at, snapshot")
      .in(
        "homework_id",
        homeworks.map((homework) => homework.id),
      );
    if (submissionsRes.error) throw asDataAccessError("submissions.forWeek", submissionsRes.error);
    submissions = (submissionsRes.data ?? []) as SubmissionRow[];
  }

  return assembleWeekBoard({
    weekStart,
    now,
    lessons,
    members: (membersRes.data ?? []) as MemberRow[],
    homeworks,
    submissions,
  });
}

/** 오늘(KST) 수업 목록 — 대시보드 "오늘 수업" 카드용 */
export async function getTodayLessons(now: Date = new Date()) {
  const today = kstDateOf(now);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const board = await getWeekBoard(addDays(today, -weekday), now);
  return board.lessons.filter((lesson) => kstDateOf(lesson.startsAt) === today);
}

/* ── RPC 공통 처리 ─────────────────────────────────────────── */

const rpcEnvelopeSchema = z.object({
  success: z.boolean(),
  reason: z.string().optional(),
});

export async function callScheduleRpc<T>(
  fn: string,
  args: Record<string, unknown>,
  pick: (payload: Record<string, unknown>) => T,
): Promise<ScheduleMutationResult<T>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      console.error(`[schedule] ${fn} rpc error`, error.code ?? "", error.message);
      return { ok: false, reason: "network", message: SCHEDULE_REASON_MESSAGE.network };
    }
    const envelope = rpcEnvelopeSchema.safeParse(data);
    if (!envelope.success) {
      return { ok: false, reason: "unexpected_response", message: "결과를 확인하지 못했어요. 화면을 새로고침 해주세요." };
    }
    if (!envelope.data.success) {
      const reason = envelope.data.reason ?? "rejected";
      return { ok: false, reason, message: SCHEDULE_REASON_MESSAGE[reason] ?? "요청을 처리하지 못했어요." };
    }
    return { ok: true, data: pick(data as Record<string, unknown>) };
  } catch (error) {
    console.error(`[schedule] ${fn} failed`, error instanceof Error ? error.message : "unknown");
    return { ok: false, reason: "network", message: SCHEDULE_REASON_MESSAGE.network };
  }
}

/** 숙제 ↔ 수업 연결. 실패는 숙제 저장에 영향을 주지 않는다. */
export async function linkHomeworkToLesson(input: { homeworkId: string; lessonId: string }): Promise<boolean> {
  const result = await callScheduleRpc(
    "link_homework_to_lesson",
    { p_homework_id: input.homeworkId, p_lesson_id: input.lessonId },
    () => true,
  );
  return result.ok;
}
