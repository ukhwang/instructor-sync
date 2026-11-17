import {
  DEMO_HOMEWORK_TOKEN,
  DEMO_TRAINER,
  demoSeedOf,
  type DemoLesson,
  type DemoState,
} from "./demo-seed";
import type { AssignHomeworkInput, GenerateWhyInput } from "./homework-schemas";
import { assignHomeworkInputSchema } from "./homework-schemas";
import {
  SCHEDULE_REASON_MESSAGE,
  createLessonsInputSchema,
  rescheduleLessonInputSchema,
  setLessonStatusInputSchema,
  type CreateLessonsInput,
  type RescheduleLessonInput,
  type ScheduleMutationResult,
  type SetLessonStatusInput,
} from "./schedule-schemas";
import type { Homework, HomeworkItem } from "./types";

/* ────────────────────────────────────────────────────────────
 * /demo 샌드박스 상태 전이 (순수 함수).
 * 프로덕션 서버 액션과 같은 입력 스키마·반환 형태를 흉내 내지만
 * 네트워크·DB·저장소에는 절대 닿지 않는다. 결과는 메모리 상태로만 존재한다.
 * ──────────────────────────────────────────────────────────── */

export interface Transition<T> {
  next: DemoState;
  result: T;
}

/** QuickAssignDrawer 의 AssignHomeworkOutcome 과 같은 형태 */
export type DemoAssignOutcome =
  | { ok: true; homework: Homework; lessonLinked: boolean }
  | { ok: false; message: string };

function fail<T>(state: DemoState, reason: keyof typeof SCHEDULE_REASON_MESSAGE): Transition<ScheduleMutationResult<T>> {
  return { next: state, result: { ok: false, reason, message: SCHEDULE_REASON_MESSAGE[reason] ?? "요청을 처리하지 못했어요." } };
}

function overlaps(lesson: DemoLesson, startMs: number, endMs: number): boolean {
  if (lesson.status === "cancelled") return false;
  return Date.parse(lesson.startsAt) < endMs && startMs < Date.parse(lesson.endsAt);
}

function hasConflict(lessons: DemoLesson[], startMs: number, endMs: number, excludeId?: string): boolean {
  return lessons.some((lesson) => lesson.id !== excludeId && overlaps(lesson, startMs, endMs));
}

function adjustPackage(state: DemoState, memberId: string, delta: number): { members: DemoState["members"]; remaining: number | null } {
  let remaining: number | null = null;
  const seed = demoSeedOf(memberId);
  const members = state.members.map((member) => {
    if (member.id !== memberId) return member;
    const cap = seed?.packageTotal ?? Number.MAX_SAFE_INTEGER;
    remaining = Math.min(cap, Math.max(0, member.packageRemaining + delta));
    return { ...member, packageRemaining: remaining };
  });
  return { members, remaining };
}

/** createLessonsAction 대응. 같은 seriesId 재요청은 기존 결과를 돌려준다(멱등). */
export function createDemoLessons(
  state: DemoState,
  input: CreateLessonsInput,
  createId: (week: number) => string,
): Transition<ScheduleMutationResult<{ lessonIds: string[] }>> {
  const parsed = createLessonsInputSchema.safeParse(input);
  if (!parsed.success) return fail(state, "invalid_input");
  const { seriesId, memberId, startsAt, durationMin, repeatWeeks } = parsed.data;
  if (!demoSeedOf(memberId)) return fail(state, "member_not_found");

  const replayedIds = state.series[seriesId];
  if (replayedIds) return { next: state, result: { ok: true, data: { lessonIds: replayedIds } } };

  const startMs = Date.parse(startsAt);
  const created: DemoLesson[] = [];
  for (let week = 0; week <= repeatWeeks; week += 1) {
    const begin = startMs + week * 7 * 86_400_000;
    const end = begin + durationMin * 60_000;
    if (hasConflict([...state.lessons, ...created], begin, end)) return fail(state, "time_conflict");
    created.push({
      id: createId(week),
      memberId,
      startsAt: new Date(begin).toISOString(),
      endsAt: new Date(end).toISOString(),
      status: "scheduled",
    });
  }
  const next: DemoState = {
    ...state,
    lessons: [...state.lessons, ...created].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    series: { ...state.series, [seriesId]: created.map((lesson) => lesson.id) },
  };
  return { next, result: { ok: true, data: { lessonIds: created.map((lesson) => lesson.id) } } };
}

/** completeLessonAction 대응. 이미 완료된 수업은 replayed=true (회차 중복 차감 없음). */
export function completeDemoLesson(
  state: DemoState,
  lessonId: string,
): Transition<ScheduleMutationResult<{ packageRemaining: number | null; replayed: boolean }>> {
  const lesson = state.lessons.find((item) => item.id === lessonId);
  if (!lesson) return fail(state, "lesson_not_found");
  if (lesson.status === "completed") {
    const member = state.members.find((item) => item.id === lesson.memberId);
    return { next: state, result: { ok: true, data: { packageRemaining: member?.packageRemaining ?? null, replayed: true } } };
  }
  if (lesson.status !== "scheduled") return fail(state, "invalid_status");
  const { members, remaining } = adjustPackage(state, lesson.memberId, -1);
  const lessons = state.lessons.map((item) => (item.id === lessonId ? { ...item, status: "completed" as const } : item));
  return { next: { ...state, lessons, members }, result: { ok: true, data: { packageRemaining: remaining, replayed: false } } };
}

/** revertLessonCompletionAction 대응 */
export function revertDemoCompletion(
  state: DemoState,
  lessonId: string,
): Transition<ScheduleMutationResult<{ packageRemaining: number | null }>> {
  const lesson = state.lessons.find((item) => item.id === lessonId);
  if (!lesson) return fail(state, "lesson_not_found");
  if (lesson.status !== "completed") return fail(state, "invalid_status");
  const { members, remaining } = adjustPackage(state, lesson.memberId, +1);
  const lessons = state.lessons.map((item) => (item.id === lessonId ? { ...item, status: "scheduled" as const } : item));
  return { next: { ...state, lessons, members }, result: { ok: true, data: { packageRemaining: remaining } } };
}

/** setLessonStatusAction 대응 (노쇼·취소·예정 복원). 완료 수업은 되돌리기만 허용. */
export function setDemoLessonStatus(state: DemoState, input: SetLessonStatusInput): Transition<ScheduleMutationResult> {
  const parsed = setLessonStatusInputSchema.safeParse(input);
  if (!parsed.success) return fail(state, "invalid_input");
  const lesson = state.lessons.find((item) => item.id === parsed.data.lessonId);
  if (!lesson) return fail(state, "lesson_not_found");
  if (lesson.status === "completed") return fail(state, "invalid_status");
  if (lesson.status === parsed.data.status) return { next: state, result: { ok: true, data: undefined } };
  if (
    parsed.data.status === "scheduled" &&
    hasConflict(state.lessons, Date.parse(lesson.startsAt), Date.parse(lesson.endsAt), lesson.id)
  ) {
    return fail(state, "time_conflict");
  }
  const lessons = state.lessons.map((item) => (item.id === lesson.id ? { ...item, status: parsed.data.status } : item));
  return { next: { ...state, lessons }, result: { ok: true, data: undefined } };
}

/** rescheduleLessonAction 대응 */
export function rescheduleDemoLesson(state: DemoState, input: RescheduleLessonInput): Transition<ScheduleMutationResult> {
  const parsed = rescheduleLessonInputSchema.safeParse(input);
  if (!parsed.success) return fail(state, "invalid_input");
  const lesson = state.lessons.find((item) => item.id === parsed.data.lessonId);
  if (!lesson) return fail(state, "lesson_not_found");
  if (lesson.status !== "scheduled") return fail(state, "invalid_status");
  const startMs = Date.parse(parsed.data.startsAt);
  const endMs = startMs + parsed.data.durationMin * 60_000;
  if (hasConflict(state.lessons, startMs, endMs, lesson.id)) return fail(state, "time_conflict");
  const lessons = state.lessons
    .map((item) =>
      item.id === lesson.id
        ? { ...item, startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() }
        : item,
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { next: { ...state, lessons }, result: { ok: true, data: undefined } };
}

/** assignHomeworkAction 대응. 토큰은 공개 데모 토큰(`demo-token`) 고정. */
export function assignDemoHomework(
  state: DemoState,
  input: AssignHomeworkInput,
  homeworkId: string,
  now: Date,
): Transition<DemoAssignOutcome> {
  const parsed = assignHomeworkInputSchema.safeParse(input);
  if (!parsed.success) {
    return { next: state, result: { ok: false, message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요" } };
  }
  const seed = demoSeedOf(parsed.data.memberId);
  if (!seed) return { next: state, result: { ok: false, message: SCHEDULE_REASON_MESSAGE.member_not_found } };

  const lessonLinked = Boolean(
    parsed.data.lessonId &&
      state.lessons.some((lesson) => lesson.id === parsed.data.lessonId && lesson.memberId === seed.id),
  );
  const customItems = parsed.data.customItems ?? [];
  const items: HomeworkItem[] = customItems.map((item, index) => ({
    id: `${homeworkId}-item-${index + 1}`,
    homework_id: homeworkId,
    order_index: index + 1,
    name: item.name,
    target_sets: item.sets,
    target_reps: item.reps,
    rest_seconds: item.restSec,
    cue: item.cue,
  }));
  const homework: Homework = {
    id: homeworkId,
    member_id: seed.id,
    trainer_id: DEMO_TRAINER.id,
    why: parsed.data.why ?? `${seed.name}님 오늘 수업 숙제`,
    token: DEMO_HOMEWORK_TOKEN,
    status: "sent",
    created_at: now.toISOString(),
    items,
    member: { id: seed.id, name: seed.name },
  };
  const firstName = customItems[0]?.name.replace(/\s*\(.*\)$/, "") ?? "운동";
  const summary = customItems.length > 1 ? `새 숙제 · ${firstName} 외 ${customItems.length - 1}개` : `새 숙제 · ${firstName}`;
  const members = state.members.map((member) =>
    member.id === seed.id ? { ...member, badge: "in_progress" as const, homeworkSummary: summary } : member,
  );
  return {
    next: { ...state, members, homeworks: { ...state.homeworks, [seed.id]: homework } },
    result: { ok: true, homework, lessonLinked },
  };
}

/** generateWhyAction 대응: 회원 시드 기반 템플릿 문장 (AI 호출 없음) */
export function generateDemoWhy(input: GenerateWhyInput): string {
  const seed = demoSeedOf(input.memberId);
  const name = seed?.name ?? "회원";
  const focus = seed?.focus ?? "오늘 수업 내용";
  return `${name}님, 오늘 수업에서 함께 확인한 ${focus}을(를) 집에서도 이어가기 위한 숙제예요. 통증 없는 범위에서 천천히 해주세요.`;
}
