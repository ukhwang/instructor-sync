"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  SCHEDULE_REASON_MESSAGE,
  createLessonsInputSchema,
  lessonIdInputSchema,
  rescheduleLessonInputSchema,
  setLessonStatusInputSchema,
  weekStartSchema,
  type CreateLessonsInput,
  type LessonIdInput,
  type RescheduleLessonInput,
  type ScheduleMutationResult,
  type SetLessonStatusInput,
  type WeekBoard,
} from "@/lib/schedule-schemas";
import { callScheduleRpc, getWeekBoard } from "@/lib/schedule-server";

function invalid(error: z.ZodError): { ok: false; reason: string; message: string } {
  return {
    ok: false,
    reason: "invalid_input",
    message: error.issues[0]?.message ?? SCHEDULE_REASON_MESSAGE.invalid_input,
  };
}

function refreshScheduleViews(): void {
  revalidatePath("/app/schedules");
  revalidatePath("/app");
}

const lessonRowSchema = z.object({ id: z.string() });
const packageRemainingSchema = z.number().int().nullable().optional();

/* ── 읽기: 클라이언트 주간 이동/재조회용 (초기 렌더는 Server Component 가 직접 조회) ── */

export async function getWeekBoardAction(weekStart: string): Promise<ScheduleMutationResult<WeekBoard>> {
  const parsed = weekStartSchema.safeParse(weekStart);
  if (!parsed.success) return invalid(parsed.error);
  try {
    return { ok: true, data: await getWeekBoard(parsed.data) };
  } catch (error) {
    console.error("[getWeekBoardAction]", error instanceof Error ? error.message : "unknown");
    return { ok: false, reason: "network", message: "스케줄을 불러오지 못했어요." };
  }
}

/* ── 쓰기 ───────────────────────────────────────────────────── */

export async function createLessonsAction(
  input: CreateLessonsInput,
): Promise<ScheduleMutationResult<{ lessonIds: string[] }>> {
  const parsed = createLessonsInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const result = await callScheduleRpc(
    "create_lessons",
    {
      p_series_id: parsed.data.seriesId,
      p_member_id: parsed.data.memberId,
      p_starts_at: parsed.data.startsAt,
      p_duration_min: parsed.data.durationMin,
      p_repeat_weeks: parsed.data.repeatWeeks,
    },
    (payload) => ({
      lessonIds: z.array(lessonRowSchema).catch([]).parse(payload.lessons).map((row) => row.id),
    }),
  );
  if (result.ok) refreshScheduleViews();
  return result;
}

export async function completeLessonAction(
  input: LessonIdInput,
): Promise<ScheduleMutationResult<{ packageRemaining: number | null; replayed: boolean }>> {
  const parsed = lessonIdInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const result = await callScheduleRpc("complete_lesson", { p_lesson_id: parsed.data.lessonId }, (payload) => ({
    packageRemaining: packageRemainingSchema.catch(null).parse(payload.package_remaining) ?? null,
    replayed: payload.replayed === true,
  }));
  if (result.ok) refreshScheduleViews();
  return result;
}

export async function revertLessonCompletionAction(
  input: LessonIdInput,
): Promise<ScheduleMutationResult<{ packageRemaining: number | null }>> {
  const parsed = lessonIdInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const result = await callScheduleRpc(
    "revert_lesson_completion",
    { p_lesson_id: parsed.data.lessonId },
    (payload) => ({ packageRemaining: packageRemainingSchema.catch(null).parse(payload.package_remaining) ?? null }),
  );
  if (result.ok) refreshScheduleViews();
  return result;
}

export async function setLessonStatusAction(input: SetLessonStatusInput): Promise<ScheduleMutationResult> {
  const parsed = setLessonStatusInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const result = await callScheduleRpc(
    "set_lesson_status",
    { p_lesson_id: parsed.data.lessonId, p_status: parsed.data.status },
    () => undefined,
  );
  if (result.ok) refreshScheduleViews();
  return result;
}

export async function rescheduleLessonAction(input: RescheduleLessonInput): Promise<ScheduleMutationResult> {
  const parsed = rescheduleLessonInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const result = await callScheduleRpc(
    "reschedule_lesson",
    {
      p_lesson_id: parsed.data.lessonId,
      p_starts_at: parsed.data.startsAt,
      p_duration_min: parsed.data.durationMin,
    },
    () => undefined,
  );
  if (result.ok) refreshScheduleViews();
  return result;
}
