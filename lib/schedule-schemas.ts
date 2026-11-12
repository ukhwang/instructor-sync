import { z } from "zod";

/* ────────────────────────────────────────────────────────────
 * 스케줄러 공유 계약 (Server ↔ Client 경계).
 * "use server" 파일이 아니므로 클라이언트 컴포넌트에서도 안전하게 import 한다.
 * 모든 시각은 Asia/Seoul(UTC+9, 서머타임 없음) 기준으로 해석한다.
 * ──────────────────────────────────────────────────────────── */

export const KST_OFFSET_MINUTES = 9 * 60;
export const BUSINESS_START_HOUR_KST = 9;
export const BUSINESS_END_HOUR_KST = 22;
export const SLOT_MINUTES = 30;
export const PAIN_ALERT_THRESHOLD = 6;
export const LESSON_DURATION_CHOICES = [30, 50, 60] as const;
/** 추가 반복 주 수. 0=이번만, 3=4주 연속, 7=8주 연속 */
export const REPEAT_WEEK_CHOICES = [0, 3, 7] as const;

export const LESSON_STATUSES = ["scheduled", "completed", "no_show", "cancelled"] as const;
export const lessonStatusSchema = z.enum(LESSON_STATUSES);
export type LessonStatus = z.infer<typeof lessonStatusSchema>;

/** 🔴 통증 주의 > 🟢 숙제 완료 > 🟡 진행 중 > ⚪ 숙제 없음 */
export const HOMEWORK_BADGES = ["pain", "done", "in_progress", "none"] as const;
export const homeworkBadgeSchema = z.enum(HOMEWORK_BADGES);
export type HomeworkBadge = z.infer<typeof homeworkBadgeSchema>;

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "날짜 형식이 올바르지 않아요" });

/** KST 기준 분(0~1439) */
export function kstMinutesOfDay(iso: string): number {
  const date = new Date(iso);
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (utcMinutes + KST_OFFSET_MINUTES) % (24 * 60);
}

/** KST 기준 날짜 문자열 YYYY-MM-DD */
export function kstDateOf(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const shifted = new Date(date.getTime() + KST_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** YYYY-MM-DD + days */
export function addDays(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** 0=월 … 6=일 */
export function weekdayIndexOf(dateStr: string): number {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

/** 주어진 시각이 속한 주의 월요일 (KST) */
export function mondayOf(date: Date | string): string {
  const today = kstDateOf(date);
  return addDays(today, -weekdayIndexOf(today));
}

/** KST 날짜 + 분 → ISO(+09:00) */
export function kstIso(dateStr: string, minutesOfDay: number): string {
  const hh = String(Math.floor(minutesOfDay / 60)).padStart(2, "0");
  const mm = String(minutesOfDay % 60).padStart(2, "0");
  return `${dateStr}T${hh}:${mm}:00+09:00`;
}

export const weekStartSchema = isoDateSchema.refine((value) => weekdayIndexOf(value) === 0, {
  message: "주 시작일은 월요일이어야 해요",
});

function withinBusinessHours(startsAt: string, durationMin: number): boolean {
  const start = kstMinutesOfDay(startsAt);
  return start >= BUSINESS_START_HOUR_KST * 60 && start + durationMin <= BUSINESS_END_HOUR_KST * 60;
}

const BUSINESS_HOURS_MESSAGE = `운영 시간(${BUSINESS_START_HOUR_KST}:00~${BUSINESS_END_HOUR_KST}:00) 안에서만 예약할 수 있어요`;

export const createLessonsInputSchema = z
  .object({
    seriesId: z.uuid(),
    memberId: z.uuid({ message: "회원을 선택해주세요" }),
    startsAt: isoDateTimeSchema,
    durationMin: z.number().int().min(10).max(180),
    repeatWeeks: z.number().int().min(0).max(12),
  })
  .refine(({ startsAt, durationMin }) => withinBusinessHours(startsAt, durationMin), {
    message: BUSINESS_HOURS_MESSAGE,
    path: ["startsAt"],
  });
export type CreateLessonsInput = z.infer<typeof createLessonsInputSchema>;

export const rescheduleLessonInputSchema = z
  .object({
    lessonId: z.uuid(),
    startsAt: isoDateTimeSchema,
    durationMin: z.number().int().min(10).max(180),
  })
  .refine(({ startsAt, durationMin }) => withinBusinessHours(startsAt, durationMin), {
    message: BUSINESS_HOURS_MESSAGE,
    path: ["startsAt"],
  });
export type RescheduleLessonInput = z.infer<typeof rescheduleLessonInputSchema>;

export const lessonIdInputSchema = z.object({ lessonId: z.uuid() });
export type LessonIdInput = z.infer<typeof lessonIdInputSchema>;

export const setLessonStatusInputSchema = z.object({
  lessonId: z.uuid(),
  status: z.enum(["scheduled", "no_show", "cancelled"]),
});
export type SetLessonStatusInput = z.infer<typeof setLessonStatusInputSchema>;

/* ── 출력 계약 ─────────────────────────────────────────────── */

export const lessonBlockSchema = z.object({
  id: z.string().min(1),
  memberId: z.string().min(1),
  memberName: z.string().min(1),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  status: lessonStatusSchema,
  badge: homeworkBadgeSchema,
  /** 뱃지 옆 한 줄 요약 (예: "통증 7/10 · 허리") */
  homeworkSummary: z.string(),
  latestPainScore: z.number().int().min(0).max(10).nullable(),
  packageRemaining: z.number().int().min(0),
  packageTotal: z.number().int().min(0),
  /** true = 서버 저장 전 낙관적 블록 */
  pending: z.boolean(),
});
export type LessonBlock = z.infer<typeof lessonBlockSchema>;

export const weekBoardSchema = z.object({
  weekStart: weekStartSchema,
  generatedAt: isoDateTimeSchema,
  lessons: z.array(lessonBlockSchema),
});
export type WeekBoard = z.infer<typeof weekBoardSchema>;

export type ScheduleMutationResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; reason: string; message: string };

export const SCHEDULE_REASON_MESSAGE: Record<string, string> = {
  unauthorized: "로그인이 만료되었어요. 다시 로그인해주세요.",
  invalid_input: "입력값을 확인해주세요.",
  member_not_found: "회원 정보를 찾을 수 없어요.",
  lesson_not_found: "수업을 찾을 수 없어요. 화면을 새로고침 해주세요.",
  invalid_status: "지금 상태에서는 바꿀 수 없는 수업이에요.",
  time_conflict: "그 시간엔 이미 수업이 있어요.",
  request_payload_conflict: "같은 요청이 다른 내용으로 전송됐어요. 다시 시도해주세요.",
  network: "서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.",
};
