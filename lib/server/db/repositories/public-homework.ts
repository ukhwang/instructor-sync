import 'server-only';
import type { OpenHomeworkResult } from '@/lib/types';
import { hashToken, sha256Hex } from '@/lib/server/security/tokens';
import { canonicalJson, isForeignKeyViolation, isUniqueViolation, isUuid, newId, nowIso, parseJson, type Db } from '../sql';
import { toHomeworkItem, toHomeworkLog } from './homeworks';

/*
 * Token-only (no login) access for /h/[token]. A valid, unrevoked, unexpired
 * token grants exactly: read this homework's minimal fields, and submit once.
 * It never yields trainer data, other members, or the token itself.
 */

type Row = Record<string, unknown>;

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{21,128}$/;

/** Was RPC open_homework. One D1 round trip (batch = one transaction). */
export async function openHomeworkByToken(db: Db, token: string, now: Date = new Date()): Promise<OpenHomeworkResult> {
  if (!TOKEN_SHAPE.test(token)) return { success: false, reason: 'not_found' };
  const tokenHash = await hashToken(token);
  const at = nowIso(now);
  const byToken = 'SELECT id FROM homework WHERE token_hash = ?';
  const [, homeworkResult, itemResult, logResult] = await db.batch<Row>([
    // First open moves sent/draft → opened; conditional so it is idempotent.
    db
      .prepare(
        `UPDATE homework SET status = 'opened', updated_at = ?
          WHERE token_hash = ? AND status IN ('draft', 'sent') AND revoked_at IS NULL AND token_expires_at >= ?`,
      )
      .bind(at, tokenHash, at),
    db
      .prepare(
        `SELECT h.id, h.why, h.status, h.token_expires_at, h.revoked_at, h.created_at, m.name AS member_name
           FROM homework h JOIN members m ON m.id = h.member_id AND m.trainer_id = h.trainer_id
          WHERE h.token_hash = ?`,
      )
      .bind(tokenHash),
    db
      .prepare(
        `SELECT id, homework_id, order_index, name, cue, target_sets, target_reps, effort_kind, reps, hold_seconds,
                seconds_per_rep, rest_seconds, per_side, requirement
           FROM homework_items WHERE homework_id = (${byToken}) ORDER BY order_index`,
      )
      .bind(tokenHash),
    db.prepare(`SELECT id, homework_id, kind, payload, created_at FROM homework_logs WHERE homework_id = (${byToken}) ORDER BY created_at, id`).bind(tokenHash),
  ]);
  const homework = homeworkResult.results[0];
  if (!homework) return { success: false, reason: 'not_found' };
  if (homework.revoked_at || homework.status === 'revoked') return { success: false, reason: 'revoked' };
  if (String(homework.token_expires_at) < at) return { success: false, reason: 'expired' };
  return {
    success: true,
    homework: {
      id: String(homework.id),
      why: String(homework.why),
      status: homework.status as NonNullable<OpenHomeworkResult['homework']>['status'],
      token_expires_at: String(homework.token_expires_at),
      created_at: String(homework.created_at),
    },
    member: { name: String(homework.member_name) },
    items: itemResult.results.map((row) => {
      const item = toHomeworkItem(row);
      delete item.created_at;
      delete item.exercise_snapshot;
      return item;
    }),
    logs: logResult.results.map((row) => {
      const log = toHomeworkLog(row);
      delete log.homework_id;
      return log;
    }),
  };
}

/* ── Submission (was RPC submit_homework_feedback_v2) ─────────────────────── */

export interface SubmitHomeworkInput {
  token: string;
  completedItemIds: string[];
  discomfortLevel: number;
  note: string | null;
  requestId: string;
}

export type SubmitHomeworkResponse = {
  success: boolean;
  reason?: string;
  submission_id?: string;
  log_id?: string;
  pain_log_id?: string;
  status?: 'logged';
  result?: 'complete' | 'partial' | 'cant';
  opening_line?: string;
  submitted_at?: string;
  snapshot_hash?: string;
};

const OPENING_LINE = {
  complete: '지난 숙제의 필수 동작을 완료하셨어요. 수행 기록과 불편함을 확인하고 오늘 수업을 이어갈게요.',
  partial: '지난 숙제 중 일부 동작을 수행하셨어요. 어려웠던 동작과 불편함부터 확인할게요.',
  cant: '지난 숙제 수행이 어려우셨어요. 이유와 불편함을 확인하고 오늘 할 수 있는 동작부터 맞춰볼게요.',
} as const;

async function readSubmissionState(db: Db, tokenHash: string, requestId: string) {
  const byToken = 'SELECT id FROM homework WHERE token_hash = ?';
  const [homeworkResult, itemResult, requestResult, submittedResult] = await db.batch<Row>([
    db.prepare('SELECT id, status, revoked_at, token_expires_at FROM homework WHERE token_hash = ?').bind(tokenHash),
    db.prepare(`SELECT * FROM homework_items WHERE homework_id = (${byToken}) ORDER BY order_index, id`).bind(tokenHash),
    db
      .prepare(`SELECT request_payload, response FROM homework_submission_requests WHERE homework_id = (${byToken}) AND request_id = ?`)
      .bind(tokenHash, requestId),
    db.prepare(`SELECT id FROM homework_submissions WHERE homework_id = (${byToken})`).bind(tokenHash),
  ]);
  return {
    homework: homeworkResult.results[0] ?? null,
    items: itemResult.results,
    request: requestResult.results[0] ?? null,
    alreadySubmitted: submittedResult.results.length > 0,
  };
}

function tokenStateFailure(homework: Row | null, at: string): SubmitHomeworkResponse | null {
  if (!homework) return { success: false, reason: 'not_found' };
  if (homework.revoked_at || homework.status === 'revoked') return { success: false, reason: 'revoked' };
  if (String(homework.token_expires_at) <= at) return { success: false, reason: 'expired' };
  return null;
}

/**
 * Atomic + idempotent member submission.
 *
 * D1 has no interactive transactions, so this is: validated reads → ONE batch of
 * writes. The batch begins with a guarded INSERT (… SELECT … WHERE not revoked AND
 * not expired) so revocation/expiry is re-checked inside the transaction; if it
 * inserts nothing, the following item-result INSERTs violate their foreign key and
 * the whole batch rolls back. UNIQUE(homework_id) on homework_submissions stops a
 * concurrent second submission; the loser re-reads and returns the winner's
 * response for the same request id (replay) or already_submitted.
 */
export async function submitHomeworkByToken(db: Db, input: SubmitHomeworkInput, now: Date = new Date()): Promise<SubmitHomeworkResponse> {
  if (!TOKEN_SHAPE.test(input.token)) return { success: false, reason: 'not_found' };
  const tokenHash = await hashToken(input.token);
  const at = nowIso(now);
  const requestId = String(input.requestId ?? '');
  const state = await readSubmissionState(db, tokenHash, isUuid(requestId) ? requestId : '00000000-0000-0000-0000-000000000000');

  const tokenFailure = tokenStateFailure(state.homework, at);
  if (tokenFailure) return tokenFailure;
  const homeworkId = String(state.homework!.id);
  if (!isUuid(requestId)) return { success: false, reason: 'invalid_request_id' };
  if (!Number.isInteger(input.discomfortLevel) || input.discomfortLevel < 1 || input.discomfortLevel > 10) {
    return { success: false, reason: 'invalid_discomfort_level' };
  }
  const ids = Array.isArray(input.completedItemIds) ? input.completedItemIds : null;
  if (!ids || ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    return { success: false, reason: 'invalid_completed_item_ids' };
  }
  const completed = [...ids].sort();
  const note = input.note?.trim() || null;
  const payload = canonicalJson({ completed_item_ids: completed, discomfort_level: input.discomfortLevel, note });

  if (state.request) {
    if (canonicalJson(parseJson(state.request.request_payload, null)) !== payload) return { success: false, reason: 'request_payload_conflict' };
    return parseJson<SubmitHomeworkResponse>(state.request.response, { success: false, reason: 'rpc_failed' });
  }
  if (state.alreadySubmitted) return { success: false, reason: 'already_submitted' };

  const items = state.items;
  if (!items.some((item) => item.requirement === 'required')) return { success: false, reason: 'invalid_homework_items' };
  const itemIds = new Set(items.map((item) => String(item.id)));
  if (completed.some((id) => !itemIds.has(id))) return { success: false, reason: 'invalid_completed_item_ids' };

  const completedSet = new Set(completed);
  const result: 'complete' | 'partial' | 'cant' =
    completed.length === 0
      ? 'cant'
      : items.every((item) => item.requirement !== 'required' || completedSet.has(String(item.id)))
        ? 'complete'
        : 'partial';

  const exercises = [...items]
    .sort((a, b) => Number(a.order_index) - Number(b.order_index) || String(a.id).localeCompare(String(b.id)))
    .map((row) => {
      const item = toHomeworkItem(row);
      return {
        id: item.id,
        order_index: item.order_index,
        name: item.name,
        cue: item.cue,
        target_sets: item.target_sets,
        target_reps: item.target_reps,
        effort_kind: item.effort_kind,
        reps: item.reps,
        hold_seconds: item.hold_seconds,
        seconds_per_rep: item.seconds_per_rep,
        rest_seconds: item.rest_seconds,
        per_side: item.per_side,
        exercise_snapshot: item.exercise_snapshot ?? null,
        requirement: item.requirement,
        completed: completedSet.has(item.id),
      };
    });
  const snapshot = {
    version: 2,
    homework_id: homeworkId,
    result,
    discomfort_level: input.discomfortLevel,
    note,
    exercises,
    submitted_at: at,
  };
  const snapshotJson = JSON.stringify(snapshot);
  const snapshotHash = await sha256Hex(snapshotJson);
  const submissionId = newId();
  const logId = newId();
  const painLogId = newId();
  const opening = OPENING_LINE[result];
  const response: SubmitHomeworkResponse = {
    success: true,
    submission_id: submissionId,
    log_id: logId,
    pain_log_id: painLogId,
    status: 'logged',
    result,
    opening_line: opening,
    submitted_at: at,
    snapshot_hash: snapshotHash,
  };

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO homework_submissions (id, homework_id, snapshot, snapshot_hash, submitted_at)
         SELECT ?, h.id, ?, ?, ? FROM homework h
          WHERE h.id = ? AND h.token_hash = ? AND h.revoked_at IS NULL AND h.status <> 'revoked' AND h.token_expires_at > ?`,
      )
      .bind(submissionId, snapshotJson, snapshotHash, at, homeworkId, tokenHash, at),
    ...exercises.map((exercise) =>
      db
        .prepare('INSERT INTO homework_item_results (submission_id, homework_id, homework_item_id, requirement, completed) VALUES (?, ?, ?, ?, ?)')
        .bind(submissionId, homeworkId, exercise.id, exercise.requirement ?? 'required', exercise.completed ? 1 : 0),
    ),
    db
      .prepare('INSERT INTO homework_logs (id, homework_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(logId, homeworkId, result, JSON.stringify(note ? { note, completed_items: completed } : { completed_items: completed }), at),
    db
      .prepare('INSERT INTO homework_logs (id, homework_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(painLogId, homeworkId, 'pain', JSON.stringify({ pain_area: '현재 느끼는 불편함', pain_level: input.discomfortLevel }), at),
    db
      .prepare(`UPDATE homework SET status = 'logged', opening_line = ?, updated_at = ? WHERE id = ?`)
      .bind(opening, at, homeworkId),
    db
      .prepare('INSERT INTO homework_submission_requests (homework_id, request_id, request_payload, response) VALUES (?, ?, ?, ?)')
      .bind(homeworkId, requestId, payload, JSON.stringify(response)),
  ];

  try {
    await db.batch(statements);
    return response;
  } catch (error) {
    if (!isUniqueViolation(error) && !isForeignKeyViolation(error)) throw error;
    // Lost a race or the token changed state mid-flight: report the committed truth.
    const after = await readSubmissionState(db, tokenHash, requestId);
    const failure = tokenStateFailure(after.homework, nowIso());
    if (after.request) {
      if (canonicalJson(parseJson(after.request.request_payload, null)) !== payload) return { success: false, reason: 'request_payload_conflict' };
      if (failure) return failure;
      return parseJson<SubmitHomeworkResponse>(after.request.response, { success: false, reason: 'rpc_failed' });
    }
    if (failure) return failure;
    if (after.alreadySubmitted) return { success: false, reason: 'already_submitted' };
    throw error;
  }
}
