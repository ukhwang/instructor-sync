import 'server-only';
import { z } from 'zod';
import type { ExerciseSnapshot, Homework, HomeworkItem, HomeworkLog } from '@/lib/types';
import { hashToken, openToken, sealToken } from '@/lib/server/security/tokens';
import {
  bool,
  canonicalJson,
  isDbError,
  isForeignKeyViolation,
  isUniqueViolation,
  isUuid,
  newId,
  nowIso,
  parseJson,
  type Db,
} from '../sql';

type Row = Record<string, unknown>;

/* ── Row mapping ──────────────────────────────────────────────────────────── */

export function toHomeworkItem(row: Row): HomeworkItem {
  return {
    id: String(row.id),
    homework_id: String(row.homework_id),
    order_index: Number(row.order_index),
    name: String(row.name),
    cue: String(row.cue ?? ''),
    target_sets: Number(row.target_sets),
    target_reps: String(row.target_reps),
    effort_kind: row.effort_kind as HomeworkItem['effort_kind'],
    reps: row.reps === null || row.reps === undefined ? null : Number(row.reps),
    hold_seconds: row.hold_seconds === null || row.hold_seconds === undefined ? null : Number(row.hold_seconds),
    seconds_per_rep: Number(row.seconds_per_rep),
    rest_seconds: Number(row.rest_seconds),
    per_side: bool(row.per_side),
    exercise_snapshot: parseJson<ExerciseSnapshot | null>(row.exercise_snapshot, null),
    requirement: (row.requirement as HomeworkItem['requirement']) ?? 'required',
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

export function toHomeworkLog(row: Row): HomeworkLog {
  return {
    id: String(row.id),
    homework_id: String(row.homework_id),
    kind: row.kind as HomeworkLog['kind'],
    payload: parseJson<HomeworkLog['payload']>(row.payload, {}),
    created_at: String(row.created_at),
  };
}

function toHomework(row: Row, items: HomeworkItem[], logs: HomeworkLog[], token: string): Homework {
  return {
    id: String(row.id),
    trainer_id: String(row.trainer_id),
    member_id: String(row.member_id),
    token,
    token_expires_at: String(row.token_expires_at),
    revoked_at: (row.revoked_at as string | null) ?? null,
    why: String(row.why),
    status: row.status as Homework['status'],
    opening_line: (row.opening_line as string | null) ?? null,
    assignment_purpose: (row.assignment_purpose as Homework['assignment_purpose']) ?? null,
    burden_budget_seconds: row.burden_budget_seconds === null ? null : Number(row.burden_budget_seconds),
    source_homework_id: (row.source_homework_id as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    items,
    logs,
    member: row.member_name
      ? {
          id: String(row.member_id),
          name: String(row.member_name),
          phone: String(row.member_phone ?? ''),
          package_remaining: Number(row.member_package_remaining ?? 0),
          end_state: String(row.member_end_state ?? ''),
        }
      : undefined,
  };
}

const HOMEWORK_SELECT = `
  SELECT h.id, h.trainer_id, h.member_id, h.token_sealed, h.token_expires_at, h.revoked_at, h.why, h.status,
         h.opening_line, h.assignment_purpose, h.burden_budget_seconds, h.source_homework_id, h.created_at, h.updated_at,
         m.name AS member_name, m.phone AS member_phone, m.package_remaining AS member_package_remaining,
         m.end_state AS member_end_state
    FROM homework h
    JOIN members m ON m.id = h.member_id AND m.trainer_id = h.trainer_id`;

/* ── Reads ────────────────────────────────────────────────────────────────── */

export interface ListHomeworkOptions {
  memberId?: string;
  limit?: number;
}

/**
 * Homework with member, items and logs in ONE D1 round trip (batched SELECTs).
 * The token is not unsealed for lists (no list view shows links); detail does.
 */
export async function listHomeworks(db: Db, trainerId: string, options: ListHomeworkOptions = {}): Promise<Homework[]> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  if (options.memberId !== undefined && !isUuid(options.memberId)) return [];
  const memberFilter = options.memberId ? ' AND h.member_id = ?' : '';
  const scope = `SELECT h.id FROM homework h WHERE h.trainer_id = ?${memberFilter} ORDER BY h.created_at DESC, h.id LIMIT ?`;
  const scopeArgs = options.memberId ? [trainerId, options.memberId, limit] : [trainerId, limit];
  const [homeworkResult, itemResult, logResult] = await db.batch<Row>([
    db.prepare(`${HOMEWORK_SELECT} WHERE h.trainer_id = ?${memberFilter} ORDER BY h.created_at DESC, h.id LIMIT ?`).bind(...scopeArgs),
    db.prepare(`SELECT * FROM homework_items WHERE homework_id IN (${scope}) ORDER BY order_index, id`).bind(...scopeArgs),
    db.prepare(`SELECT * FROM homework_logs WHERE homework_id IN (${scope}) ORDER BY created_at, id`).bind(...scopeArgs),
  ]);
  const items = groupBy(itemResult.results.map(toHomeworkItem), (item) => item.homework_id ?? '');
  const logs = groupBy(logResult.results.map(toHomeworkLog), (log) => log.homework_id ?? '');
  return homeworkResult.results.map((row) => toHomework(row, items.get(String(row.id)) ?? [], logs.get(String(row.id)) ?? [], ''));
}

export async function getHomework(db: Db, trainerId: string, homeworkId: string, secret: string): Promise<Homework | null> {
  if (!isUuid(homeworkId)) return null;
  const [homeworkResult, itemResult, logResult] = await db.batch<Row>([
    db.prepare(`${HOMEWORK_SELECT} WHERE h.id = ? AND h.trainer_id = ?`).bind(homeworkId, trainerId),
    db
      .prepare('SELECT i.* FROM homework_items i JOIN homework h ON h.id = i.homework_id WHERE h.id = ? AND h.trainer_id = ? ORDER BY i.order_index, i.id')
      .bind(homeworkId, trainerId),
    db
      .prepare('SELECT l.* FROM homework_logs l JOIN homework h ON h.id = l.homework_id WHERE h.id = ? AND h.trainer_id = ? ORDER BY l.created_at, l.id')
      .bind(homeworkId, trainerId),
  ]);
  const row = homeworkResult.results[0];
  if (!row) return null;
  const token = (await openToken(secret, row.token_sealed as string | null)) ?? '';
  return toHomework(row, itemResult.results.map(toHomeworkItem), logResult.results.map(toHomeworkLog), token);
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const value of values) {
    const bucket = map.get(key(value));
    if (bucket) bucket.push(value);
    else map.set(key(value), [value]);
  }
  return map;
}

/* ── Create (was RPC create_homework_v2 → create_homework → capture_exercise_snapshot) ── */

const snapshotInputSchema = z
  .object({
    exercise_id: z.string(),
    content_version: z.union([z.number(), z.string()]),
    source: z.enum(['seed', 'database']),
    name: z.string().optional(),
    default_cue: z.string().optional(),
  });

export const homeworkItemInputSchema = z.object({
  order_index: z.number().int().min(1).max(3),
  name: z.string().trim().min(1).max(120),
  cue: z.string().max(1000).optional().default(''),
  target_sets: z.number().int().min(1).max(99),
  target_reps: z.string().trim().min(1).max(50),
  effort_kind: z.enum(['reps', 'hold']).optional().default('reps'),
  reps: z.number().int().min(1).max(50).nullable().optional(),
  hold_seconds: z.number().int().min(1).max(300).nullable().optional(),
  seconds_per_rep: z.number().min(0.5).max(10).optional().default(3),
  rest_seconds: z.number().int().min(0).max(180).optional().default(20),
  per_side: z.boolean().optional().default(false),
  requirement: z.enum(['required', 'optional']).optional().default('required'),
  exercise_snapshot: snapshotInputSchema.nullable().optional(),
});

export const createHomeworkInputSchema = z.object({
  request_id: z.string().uuid(),
  member_id: z.string().uuid(),
  why: z.string().trim().min(1).max(2000),
  token: z.string().regex(/^[A-Za-z0-9_-]{21,}$/),
  token_expires_at: z.string().datetime({ offset: true }),
  assignment_purpose: z.enum(['routine', 'focus', 'review']).nullable().optional(),
  burden_budget_seconds: z.number().int().positive().nullable().optional(),
  source_homework_id: z.string().uuid().nullable().optional(),
  lesson_id: z.string().uuid().nullable().optional(),
  items: z
    .array(homeworkItemInputSchema)
    .min(1)
    .max(3)
    // Orders must be exactly 1..n (no duplicates, no gaps).
    .refine((items) => items.map((item) => item.order_index).sort().every((value, index) => value === index + 1), 'invalid_items')
    .refine((items) => items.some((item) => item.requirement === 'required'), 'invalid_items'),
});

export type CreateHomeworkInput = z.input<typeof createHomeworkInputSchema>;
export type CreateHomeworkResult =
  | { success: true; id: string; replayed: boolean; lesson_linked: boolean }
  | { success: false; reason: string };

function createReason(error: z.ZodError): string {
  const field = String(error.issues[0]?.path[0] ?? '');
  const map: Record<string, string> = {
    request_id: 'invalid_request_id',
    member_id: 'member_not_found',
    why: 'invalid_why',
    token: 'invalid_token',
    token_expires_at: 'invalid_expiry',
    assignment_purpose: 'invalid_assignment_purpose',
    burden_budget_seconds: 'invalid_burden_budget',
    source_homework_id: 'source_homework_not_found',
    lesson_id: 'lesson_not_found',
    items: 'invalid_items',
  };
  return map[field] ?? 'invalid_items';
}

/** Server-side snapshot capture. Database snapshots are re-read from the reviewed catalog. */
async function captureSnapshots(
  db: Db,
  items: z.output<typeof homeworkItemInputSchema>[],
): Promise<(string | null)[] | null> {
  const output: (string | null)[] = [];
  for (const item of items) {
    const snapshot = item.exercise_snapshot;
    if (!snapshot) {
      output.push(null);
      continue;
    }
    if (snapshot.source === 'database') {
      const row = await db
        .prepare(
          `SELECT id, content_version, name, default_cue, media_url, media_alt, source_note FROM exercise_catalog
            WHERE id = ? AND content_version = ? AND status = 'published' AND reviewed_at IS NOT NULL
              AND trim(COALESCE(reviewed_by, '')) <> '' AND trim(COALESCE(source_note, '')) <> ''`,
        )
        .bind(snapshot.exercise_id, Number(snapshot.content_version))
        .first<Row>();
      if (!row) return null;
      output.push(
        JSON.stringify({
          exercise_id: row.id,
          content_version: Number(row.content_version),
          source: 'database',
          name: row.name,
          default_cue: row.default_cue,
          media_url: row.media_url ?? null,
          media_alt: row.media_alt ?? null,
          source_note: row.source_note,
        }),
      );
      continue;
    }
    const raw = JSON.stringify(snapshot);
    if (!/^seed-[1-9][0-9]*$/.test(snapshot.exercise_id) || String(snapshot.content_version) !== '1' || raw.length > 4000) return null;
    output.push(
      JSON.stringify({
        exercise_id: snapshot.exercise_id,
        content_version: 1,
        source: 'seed',
        name: snapshot.name ?? null,
        default_cue: snapshot.default_cue ?? null,
        media_url: null,
        media_alt: null,
        source_note: '기존 기본 운동 목록',
      }),
    );
  }
  return output;
}

/**
 * Atomic + idempotent homework creation.
 * Reads (ownership, idempotency, snapshots) happen first; every write is in ONE
 * db.batch() so homework, all items and the idempotency row commit together or
 * not at all. The member/trainer composite FK and the source-homework trigger
 * re-check ownership inside the transaction.
 */
export async function createHomework(db: Db, trainerId: string, input: CreateHomeworkInput, secret: string): Promise<CreateHomeworkResult> {
  const parsed = createHomeworkInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, reason: createReason(parsed.error) };
  const data = parsed.data;
  const now = nowIso();
  if (new Date(data.token_expires_at).getTime() <= Date.now()) return { success: false, reason: 'invalid_expiry' };

  const member = await db.prepare('SELECT id FROM members WHERE id = ? AND trainer_id = ?').bind(data.member_id, trainerId).first<Row>();
  if (!member) return { success: false, reason: 'member_not_found' };
  if (data.source_homework_id) {
    const source = await db
      .prepare('SELECT id FROM homework WHERE id = ? AND trainer_id = ? AND member_id = ?')
      .bind(data.source_homework_id, trainerId, data.member_id)
      .first<Row>();
    if (!source) return { success: false, reason: 'source_homework_not_found' };
  }

  const tokenHash = await hashToken(data.token);
  const items = [...data.items].sort((a, b) => a.order_index - b.order_index);
  const payload = canonicalJson({
    member_id: data.member_id,
    why: data.why,
    token_sha256: tokenHash,
    token_expires_at_epoch: new Date(data.token_expires_at).getTime() / 1000,
    items: items.map(({ exercise_snapshot, ...rest }) => ({ ...rest, exercise_snapshot: exercise_snapshot ?? null })),
    assignment_purpose: data.assignment_purpose ?? null,
    burden_budget_seconds: data.burden_budget_seconds ?? null,
    source_homework_id: data.source_homework_id ?? null,
  });

  const replay = await replayAssignment(db, trainerId, data.request_id, data.member_id, payload);
  if (replay) return replay;

  const snapshots = await captureSnapshots(db, items);
  if (!snapshots) return { success: false, reason: 'invalid_items' };

  const homeworkId = newId();
  const sealed = await sealToken(secret, data.token);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO homework (id, trainer_id, member_id, token_hash, token_sealed, token_expires_at, why, status,
                               assignment_purpose, burden_budget_seconds, source_homework_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?, ?)`,
      )
      .bind(
        homeworkId,
        trainerId,
        data.member_id,
        tokenHash,
        sealed,
        new Date(data.token_expires_at).toISOString(),
        data.why,
        data.assignment_purpose ?? null,
        data.burden_budget_seconds ?? null,
        data.source_homework_id ?? null,
        now,
        now,
      ),
    ...items.map((item, index) =>
      db
        .prepare(
          `INSERT INTO homework_items (id, homework_id, order_index, name, cue, target_sets, target_reps, effort_kind, reps,
                                       hold_seconds, seconds_per_rep, rest_seconds, per_side, exercise_snapshot, requirement, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          homeworkId,
          item.order_index,
          item.name,
          item.cue ?? '',
          item.target_sets,
          item.target_reps,
          item.effort_kind,
          item.effort_kind === 'reps' ? item.reps ?? null : null,
          item.effort_kind === 'hold' ? item.hold_seconds ?? null : null,
          item.seconds_per_rep,
          item.rest_seconds,
          item.per_side ? 1 : 0,
          snapshots[index],
          item.requirement,
          now,
        ),
    ),
    db
      .prepare('INSERT INTO homework_assignment_requests (trainer_id, request_id, request_payload, homework_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(trainerId, data.request_id, payload, homeworkId, now),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    // A concurrent duplicate of this request loses on homework.token_hash (same token)
    // or on the idempotency key, depending on statement order: replay in both cases.
    if (isUniqueViolation(error)) {
      const raced = await replayAssignment(db, trainerId, data.request_id, data.member_id, payload);
      if (raced) return raced;
    }
    if (isDbError(error, 'homework.token_hash')) return { success: false, reason: 'invalid_token' };
    if (isDbError(error, 'source_homework_not_found')) return { success: false, reason: 'source_homework_not_found' };
    if (isForeignKeyViolation(error)) return { success: false, reason: 'member_not_found' };
    if (isDbError(error, 'CHECK constraint failed')) return { success: false, reason: 'invalid_items' };
    throw error;
  }

  let lessonLinked = false;
  if (data.lesson_id) lessonLinked = await linkHomeworkToLesson(db, trainerId, homeworkId, data.lesson_id);
  return { success: true, id: homeworkId, replayed: false, lesson_linked: lessonLinked };
}

async function replayAssignment(db: Db, trainerId: string, requestId: string, memberId: string, payload: string): Promise<CreateHomeworkResult | null> {
  const existing = await db
    .prepare(
      `SELECT r.request_payload, r.homework_id, h.id AS owned_id
         FROM homework_assignment_requests r
         LEFT JOIN homework h ON h.id = r.homework_id AND h.trainer_id = r.trainer_id AND h.member_id = ?
        WHERE r.trainer_id = ? AND r.request_id = ?`,
    )
    .bind(memberId, trainerId, requestId)
    .first<Row>();
  if (!existing) return null;
  if (canonicalJson(parseJson(existing.request_payload, null)) !== payload) return { success: false, reason: 'request_payload_conflict' };
  if (!existing.owned_id) return { success: false, reason: 'homework_not_found' };
  return { success: true, id: String(existing.owned_id), replayed: true, lesson_linked: false };
}

/** Same-trainer, same-member link enforced by WHERE + homework_lesson_same_owner trigger. */
export async function linkHomeworkToLesson(db: Db, trainerId: string, homeworkId: string, lessonId: string): Promise<boolean> {
  if (!isUuid(homeworkId) || !isUuid(lessonId)) return false;
  try {
    const result = await db
      .prepare(
        `UPDATE homework SET lesson_id = ?, updated_at = ?
          WHERE id = ? AND trainer_id = ?
            AND EXISTS (SELECT 1 FROM lessons l WHERE l.id = ? AND l.trainer_id = homework.trainer_id AND l.member_id = homework.member_id)`,
      )
      .bind(lessonId, nowIso(), homeworkId, trainerId, lessonId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  } catch (error) {
    if (isDbError(error, 'lesson_not_found')) return false;
    throw error;
  }
}

/* ── Revoke (was RPC revoke_homework) ─────────────────────────────────────── */

export async function revokeHomework(db: Db, trainerId: string, homeworkId: string): Promise<boolean> {
  if (!isUuid(homeworkId)) return false;
  const now = nowIso();
  const result = await db
    .prepare(
      `UPDATE homework SET revoked_at = COALESCE(revoked_at, ?), status = 'revoked', updated_at = ?
        WHERE id = ? AND trainer_id = ?`,
    )
    .bind(now, now, homeworkId, trainerId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
