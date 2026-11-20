import "server-only";
import { asDataAccessError } from "./data-access-error";
import { assembleWeekBoard } from "./schedule-board";
import {
  SCHEDULE_REASON_MESSAGE,
  addDays,
  kstDateOf,
  type ScheduleMutationResult,
  type WeekBoard,
} from "./schedule-schemas";
import { AuthRequiredError, requireTrainer } from "@/lib/server/auth/session";
import { getServerEnv } from "@/lib/server/env";
import { getWeekBoardRows, type LessonEnvelope } from "@/lib/server/db/repositories/lessons";

/* ────────────────────────────────────────────────────────────
 * 스케줄 데이터 접근 (로그인한 강사 세션 → trainerId 스코프 D1 쿼리).
 * 쓰기 규칙(겹침 금지·잔여 횟수 차감)은 D1 트리거와 리포지토리가 강제한다.
 * ──────────────────────────────────────────────────────────── */

async function scope() {
  const { trainerId } = await requireTrainer();
  const env = await getServerEnv();
  return { db: env.DB, trainerId };
}

/** 주간 보드 조회: D1 batch 1회 왕복 (수업+회원, 회원들의 최근 숙제+제출). */
export async function getWeekBoard(weekStart: string, now: Date = new Date()): Promise<WeekBoard> {
  try {
    const { db, trainerId } = await scope();
    const rows = await getWeekBoardRows(db, trainerId, weekStart);
    return assembleWeekBoard({ weekStart, now, ...rows });
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    console.error("[schedule] week board failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    throw asDataAccessError("lessons.week", error);
  }
}

/** 오늘(KST) 수업 목록 — 대시보드 "오늘 수업" 카드용 */
export async function getTodayLessons(now: Date = new Date()) {
  const today = kstDateOf(now);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const board = await getWeekBoard(addDays(today, -weekday), now);
  return board.lessons.filter((lesson) => kstDateOf(lesson.startsAt) === today);
}

/** 스케줄 쓰기 공통 처리: 세션 확인 → 리포지토리 → 사용자 메시지로 변환. */
export async function runScheduleMutation<T>(
  operation: string,
  mutate: (db: D1Database, trainerId: string) => Promise<LessonEnvelope>,
  pick: (payload: LessonEnvelope) => T,
): Promise<ScheduleMutationResult<T>> {
  try {
    const { db, trainerId } = await scope();
    const envelope = await mutate(db, trainerId);
    if (!envelope.success) {
      const reason = envelope.reason ?? "rejected";
      return { ok: false, reason, message: SCHEDULE_REASON_MESSAGE[reason] ?? "요청을 처리하지 못했어요." };
    }
    return { ok: true, data: pick(envelope) };
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return { ok: false, reason: "unauthorized", message: SCHEDULE_REASON_MESSAGE.unauthorized };
    }
    console.error(`[schedule] ${operation} failed`, error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return { ok: false, reason: "network", message: SCHEDULE_REASON_MESSAGE.network };
  }
}
