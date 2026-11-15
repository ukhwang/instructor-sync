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

type LessonWithMemberRow = LessonRow & { member: MemberRow | MemberRow[] | null };
type SubmissionEmbed = Omit<SubmissionRow, "homework_id">;
type HomeworkWithSubmissionRow = HomeworkRow & { submission: SubmissionEmbed | SubmissionEmbed[] | null };

function single<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * 주간 보드 조회: 왕복 2회.
 *  1) 수업 + 회원(복합 FK 임베드)
 *  2) 해당 회원들의 최근 숙제 + 제출(1:1 임베드)
 * 2)는 1)의 회원 목록에 의존하므로 직렬이 최소다. (이전: 수업 → 회원/숙제 → 제출 3회)
 */
export async function getWeekBoard(weekStart: string, now: Date = new Date()): Promise<WeekBoard> {
  const supabase = await createClient();
  const rangeStart = `${weekStart}T00:00:00+09:00`;
  const rangeEnd = `${addDays(weekStart, 7)}T00:00:00+09:00`;

  const lessonsRes = await supabase
    .from("lessons")
    .select("id, member_id, starts_at, ends_at, status, member:members(id, name, package_remaining, package_total)")
    .gte("starts_at", rangeStart)
    .lt("starts_at", rangeEnd)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  if (lessonsRes.error) throw asDataAccessError("lessons.week", lessonsRes.error);
  const lessonRows = (lessonsRes.data ?? []) as unknown as LessonWithMemberRow[];

  const lessons: LessonRow[] = lessonRows.map(({ id, member_id, starts_at, ends_at, status }) => ({
    id,
    member_id,
    starts_at,
    ends_at,
    status,
  }));
  const membersById = new Map<string, MemberRow>();
  for (const row of lessonRows) {
    const member = single(row.member);
    if (member) membersById.set(member.id, member);
  }
  const memberIds = [...new Set(lessons.map((lesson) => lesson.member_id))];
  if (memberIds.length === 0) {
    return assembleWeekBoard({ weekStart, now, lessons, members: [], homeworks: [], submissions: [] });
  }

  const lookbackStart = `${addDays(weekStart, -HOMEWORK_LOOKBACK_DAYS)}T00:00:00+09:00`;
  const homeworkRes = await supabase
    .from("homework")
    .select("id, member_id, created_at, status, revoked_at, submission:homework_submissions(submitted_at, snapshot)")
    .in("member_id", memberIds)
    .gte("created_at", lookbackStart)
    .lt("created_at", rangeEnd)
    .order("created_at", { ascending: false })
    .limit(500);
  if (homeworkRes.error) throw asDataAccessError("homework.forWeek", homeworkRes.error);
  const homeworkRows = (homeworkRes.data ?? []) as unknown as HomeworkWithSubmissionRow[];

  const homeworks: HomeworkRow[] = homeworkRows.map(({ id, member_id, created_at, status, revoked_at }) => ({
    id,
    member_id,
    created_at,
    status,
    revoked_at,
  }));
  const submissions: SubmissionRow[] = homeworkRows.flatMap((row) => {
    const submission = single(row.submission);
    return submission ? [{ homework_id: row.id, submitted_at: submission.submitted_at, snapshot: submission.snapshot }] : [];
  });

  return assembleWeekBoard({
    weekStart,
    now,
    lessons,
    members: [...membersById.values()],
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
