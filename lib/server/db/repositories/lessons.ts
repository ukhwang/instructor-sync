import 'server-only';
import type { HomeworkRow, LessonRow, MemberRow, SubmissionRow } from '@/lib/schedule-board';
import { addDays } from '@/lib/schedule-schemas';
import { isDbError, isUniqueViolation, isUuid, newId, nowIso, parseJson, type Db } from '../sql';

/*
 * Was RPCs create_lessons / reschedule_lesson / complete_lesson /
 * revert_lesson_completion / set_lesson_status and the PostgREST week query.
 * - No-overlap: lessons_no_overlap_* triggers (was EXCLUDE USING gist).
 * - Package counter: lessons_complete_consumes_package / lessons_revert_restores_package
 *   triggers fire inside the single status-transition UPDATE, so a duplicate
 *   request changes nothing (was row locks inside plpgsql).
 */

type Row = Record<string, unknown>;
export type LessonEnvelope = { success: boolean; reason?: string; [key: string]: unknown };

const HOMEWORK_LOOKBACK_DAYS = 60;
const kstStartUtc = (date: string) => new Date(`${date}T00:00:00+09:00`).toISOString();

function toLesson(row: Row) {
  return {
    id: String(row.id),
    trainer_id: String(row.trainer_id),
    member_id: String(row.member_id),
    series_id: String(row.series_id),
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
    status: String(row.status),
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export interface WeekBoardRows {
  lessons: LessonRow[];
  members: MemberRow[];
  homeworks: HomeworkRow[];
  submissions: SubmissionRow[];
}

/** Week board data in ONE D1 round trip (was 2 PostgREST round trips). */
export async function getWeekBoardRows(db: Db, trainerId: string, weekStart: string): Promise<WeekBoardRows> {
  const rangeStart = kstStartUtc(weekStart);
  const rangeEnd = kstStartUtc(addDays(weekStart, 7));
  const lookbackStart = kstStartUtc(addDays(weekStart, -HOMEWORK_LOOKBACK_DAYS));
  const weekMembers = `SELECT DISTINCT member_id FROM lessons WHERE trainer_id = ? AND starts_at >= ? AND starts_at < ? AND status <> 'cancelled'`;
  const [lessonResult, homeworkResult] = await db.batch<Row>([
    db
      .prepare(
        `SELECT l.id, l.member_id, l.starts_at, l.ends_at, l.status,
                m.name AS member_name, m.package_remaining, m.package_total
           FROM lessons l JOIN members m ON m.id = l.member_id AND m.trainer_id = l.trainer_id
          WHERE l.trainer_id = ? AND l.starts_at >= ? AND l.starts_at < ? AND l.status <> 'cancelled'
          ORDER BY l.starts_at`,
      )
      .bind(trainerId, rangeStart, rangeEnd),
    db
      .prepare(
        `SELECT h.id, h.member_id, h.created_at, h.status, h.revoked_at, s.submitted_at, s.snapshot
           FROM homework h LEFT JOIN homework_submissions s ON s.homework_id = h.id
          WHERE h.trainer_id = ? AND h.member_id IN (${weekMembers})
            AND h.created_at >= ? AND h.created_at < ?
          ORDER BY h.created_at DESC
          LIMIT 500`,
      )
      .bind(trainerId, trainerId, rangeStart, rangeEnd, lookbackStart, rangeEnd),
  ]);
  const members = new Map<string, MemberRow>();
  const lessons: LessonRow[] = lessonResult.results.map((row) => {
    members.set(String(row.member_id), {
      id: String(row.member_id),
      name: String(row.member_name),
      package_remaining: row.package_remaining === null ? null : Number(row.package_remaining),
      package_total: row.package_total === null ? null : Number(row.package_total),
    });
    return {
      id: String(row.id),
      member_id: String(row.member_id),
      starts_at: String(row.starts_at),
      ends_at: String(row.ends_at),
      status: String(row.status),
    };
  });
  const homeworks: HomeworkRow[] = [];
  const submissions: SubmissionRow[] = [];
  for (const row of homeworkResult.results) {
    homeworks.push({
      id: String(row.id),
      member_id: String(row.member_id),
      created_at: String(row.created_at),
      status: String(row.status),
      revoked_at: (row.revoked_at as string | null) ?? null,
    });
    if (row.submitted_at) {
      submissions.push({ homework_id: String(row.id), submitted_at: String(row.submitted_at), snapshot: parseJson(row.snapshot, null) });
    }
  }
  return { lessons, members: [...members.values()], homeworks, submissions };
}

export async function createLessons(
  db: Db,
  trainerId: string,
  input: { seriesId: string; memberId: string; startsAt: string; durationMin: number; repeatWeeks: number },
): Promise<LessonEnvelope> {
  const start = new Date(input.startsAt);
  if (!isUuid(input.seriesId) || Number.isNaN(start.getTime()) || !Number.isInteger(input.durationMin)
    || input.durationMin < 10 || input.durationMin > 180 || !Number.isInteger(input.repeatWeeks)
    || input.repeatWeeks < 0 || input.repeatWeeks > 12) {
    return { success: false, reason: 'invalid_input' };
  }
  if (!isUuid(input.memberId)) return { success: false, reason: 'member_not_found' };
  const [memberResult, seriesResult] = await db.batch<Row>([
    db.prepare('SELECT id FROM members WHERE id = ? AND trainer_id = ?').bind(input.memberId, trainerId),
    db.prepare('SELECT 1 AS other FROM lessons WHERE trainer_id = ? AND series_id = ? AND member_id <> ? LIMIT 1').bind(trainerId, input.seriesId, input.memberId),
  ]);
  if (memberResult.results.length === 0) return { success: false, reason: 'member_not_found' };
  if (seriesResult.results.length > 0) return { success: false, reason: 'request_payload_conflict' };

  const now = nowIso();
  const week = 7 * 24 * 60 * 60 * 1000;
  const statements = Array.from({ length: input.repeatWeeks + 1 }, (_, index) => {
    const startsAt = new Date(start.getTime() + index * week);
    const endsAt = new Date(startsAt.getTime() + input.durationMin * 60 * 1000);
    return db
      .prepare(
        `INSERT INTO lessons (id, trainer_id, member_id, series_id, starts_at, ends_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
         ON CONFLICT (trainer_id, series_id, starts_at) DO NOTHING`,
      )
      .bind(newId(), trainerId, input.memberId, input.seriesId, startsAt.toISOString(), endsAt.toISOString(), now, now);
  });
  try {
    // All weeks or none (one transaction).
    await db.batch(statements);
  } catch (error) {
    if (isDbError(error, 'lesson_time_conflict')) return { success: false, reason: 'time_conflict' };
    if (isDbError(error, 'FOREIGN KEY constraint failed')) return { success: false, reason: 'member_not_found' };
    throw error;
  }
  const { results } = await db
    .prepare('SELECT * FROM lessons WHERE trainer_id = ? AND series_id = ? ORDER BY starts_at')
    .bind(trainerId, input.seriesId)
    .all<Row>();
  return { success: true, lessons: results.map(toLesson) };
}

async function ownedLesson(db: Db, trainerId: string, lessonId: string): Promise<Row | null> {
  if (!isUuid(lessonId)) return null;
  return db.prepare('SELECT * FROM lessons WHERE id = ? AND trainer_id = ?').bind(lessonId, trainerId).first<Row>();
}

async function packageRemaining(db: Db, trainerId: string, memberId: string): Promise<number | null> {
  const row = await db.prepare('SELECT package_remaining FROM members WHERE id = ? AND trainer_id = ?').bind(memberId, trainerId).first<Row>();
  return row ? Number(row.package_remaining) : null;
}

export async function rescheduleLesson(db: Db, trainerId: string, input: { lessonId: string; startsAt: string; durationMin: number }): Promise<LessonEnvelope> {
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime()) || !Number.isInteger(input.durationMin) || input.durationMin < 10 || input.durationMin > 180) {
    return { success: false, reason: 'invalid_input' };
  }
  const lesson = await ownedLesson(db, trainerId, input.lessonId);
  if (!lesson) return { success: false, reason: 'lesson_not_found' };
  if (lesson.status !== 'scheduled') return { success: false, reason: 'invalid_status' };
  try {
    const row = await db
      .prepare(
        `UPDATE lessons SET starts_at = ?, ends_at = ?, updated_at = ?
          WHERE id = ? AND trainer_id = ? AND status = 'scheduled' RETURNING *`,
      )
      .bind(start.toISOString(), new Date(start.getTime() + input.durationMin * 60000).toISOString(), nowIso(), input.lessonId, trainerId)
      .first<Row>();
    if (!row) return { success: false, reason: 'invalid_status' };
    return { success: true, lesson: toLesson(row) };
  } catch (error) {
    if (isDbError(error, 'lesson_time_conflict') || isUniqueViolation(error, 'lessons')) return { success: false, reason: 'time_conflict' };
    throw error;
  }
}

export async function completeLesson(db: Db, trainerId: string, lessonId: string): Promise<LessonEnvelope> {
  const lesson = await ownedLesson(db, trainerId, lessonId);
  if (!lesson) return { success: false, reason: 'lesson_not_found' };
  if (lesson.status === 'completed') {
    return { success: true, replayed: true, lesson: toLesson(lesson), package_remaining: await packageRemaining(db, trainerId, String(lesson.member_id)) };
  }
  if (lesson.status !== 'scheduled') return { success: false, reason: 'invalid_status' };
  const now = nowIso();
  const updated = await db
    .prepare(
      `UPDATE lessons SET status = 'completed', completed_at = ?, updated_at = ?
        WHERE id = ? AND trainer_id = ? AND status = 'scheduled' RETURNING *`,
    )
    .bind(now, now, lessonId, trainerId)
    .first<Row>();
  const current = updated ?? (await ownedLesson(db, trainerId, lessonId));
  if (!current || current.status !== 'completed') return { success: false, reason: 'invalid_status' };
  return {
    success: true,
    replayed: !updated,
    lesson: toLesson(current),
    package_remaining: await packageRemaining(db, trainerId, String(current.member_id)),
  };
}

export async function revertLessonCompletion(db: Db, trainerId: string, lessonId: string): Promise<LessonEnvelope> {
  const lesson = await ownedLesson(db, trainerId, lessonId);
  if (!lesson) return { success: false, reason: 'lesson_not_found' };
  if (lesson.status === 'scheduled') {
    return { success: true, replayed: true, lesson: toLesson(lesson), package_remaining: await packageRemaining(db, trainerId, String(lesson.member_id)) };
  }
  if (lesson.status !== 'completed') return { success: false, reason: 'invalid_status' };
  try {
    const updated = await db
      .prepare(
        `UPDATE lessons SET status = 'scheduled', completed_at = NULL, updated_at = ?
          WHERE id = ? AND trainer_id = ? AND status = 'completed' RETURNING *`,
      )
      .bind(nowIso(), lessonId, trainerId)
      .first<Row>();
    const current = updated ?? (await ownedLesson(db, trainerId, lessonId));
    if (!current || current.status !== 'scheduled') return { success: false, reason: 'invalid_status' };
    return {
      success: true,
      replayed: !updated,
      lesson: toLesson(current),
      package_remaining: await packageRemaining(db, trainerId, String(current.member_id)),
    };
  } catch (error) {
    if (isDbError(error, 'lesson_time_conflict')) return { success: false, reason: 'time_conflict' };
    throw error;
  }
}

export async function setLessonStatus(db: Db, trainerId: string, lessonId: string, status: string): Promise<LessonEnvelope> {
  if (!['scheduled', 'no_show', 'cancelled'].includes(status)) return { success: false, reason: 'invalid_input' };
  const lesson = await ownedLesson(db, trainerId, lessonId);
  if (!lesson) return { success: false, reason: 'lesson_not_found' };
  if (lesson.status === status) return { success: true, replayed: true, lesson: toLesson(lesson) };
  if (lesson.status === 'completed') return { success: false, reason: 'invalid_status' };
  try {
    const updated = await db
      .prepare(`UPDATE lessons SET status = ?, updated_at = ? WHERE id = ? AND trainer_id = ? AND status NOT IN ('completed', ?) RETURNING *`)
      .bind(status, nowIso(), lessonId, trainerId, status)
      .first<Row>();
    if (!updated) {
      const current = await ownedLesson(db, trainerId, lessonId);
      if (current?.status === status) return { success: true, replayed: true, lesson: toLesson(current) };
      return { success: false, reason: 'invalid_status' };
    }
    return { success: true, replayed: false, lesson: toLesson(updated) };
  } catch (error) {
    if (isDbError(error, 'lesson_time_conflict')) return { success: false, reason: 'time_conflict' };
    throw error;
  }
}
