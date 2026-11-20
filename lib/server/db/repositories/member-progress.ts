import 'server-only';
import type {
  MemberProgressGoal,
  MemberProgressGoalInput,
  MemberProgressObservation,
  MemberProgressObservationInput,
  MemberProgressOpinion,
  MemberProgressResult,
} from '@/lib/member-progress-types';
import { bool, canonicalJson, isDbError, isUniqueViolation, isUuid, newId, nowIso, parseJson, seoulToday, type Db } from '../sql';

/*
 * Was RPCs create_member_progress_goal / record_member_progress_observation /
 * get_member_progress (incl. the 20260921074826 correctness fixes).
 * Idempotency: the request row is written in the same batch as the data, with
 * the final response precomputed (ids are generated up front). A concurrent
 * duplicate fails on the (trainer_id, request_id) key and replays the stored response.
 */

type Row = Record<string, unknown>;

const UNITS: Record<string, string> = { duration: 'seconds', reps: 'count', distance: 'meters', difficulty: 'score_0_10' };
const METRICS = new Set(Object.keys(UNITS));
const DIRECTIONS = new Set(['increase', 'decrease', 'none']);
const SOURCES = new Set(['member_report', 'trainer_measurement']);
const ACTORS = new Set(['member', 'trainer']);
const OPINIONS = new Set(['better', 'same', 'worse', 'unknown']);

const fail = (reason: string): MemberProgressResult => ({ success: false, reason });
const blank = (value: string | null | undefined) => !value || value.trim() === '';
const finite = (value: number) => typeof value === 'number' && Number.isFinite(value);
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

async function readRequest(db: Db, trainerId: string, requestId: string, payload: string): Promise<MemberProgressResult | null> {
  const existing = await db
    .prepare('SELECT request_payload, response FROM member_progress_requests WHERE trainer_id = ? AND request_id = ?')
    .bind(trainerId, requestId)
    .first<Row>();
  if (!existing) return null;
  if (canonicalJson(parseJson(existing.request_payload, null)) !== payload) return fail('request_conflict');
  return existing.response ? parseJson<MemberProgressResult>(existing.response, fail('rpc_failed')) : null;
}

function measurementFailure(input: {
  metric: string;
  measured_on: string;
  value?: number | null;
  unmeasured_reason?: string | null;
  memo?: string | null;
  source: string;
  actor: string;
  opinion?: string | null;
}, today: string): MemberProgressResult | null {
  const value = input.value ?? null;
  if (!isDate(input.measured_on)) return fail('measured_on_required');
  if (input.measured_on > today) return fail('measured_on_future');
  if (value === null && blank(input.unmeasured_reason)) return fail('unmeasured_reason_required');
  if (value !== null && (!finite(value) || value < 0 || (input.metric === 'difficulty' && (value > 10 || !Number.isInteger(value))))) {
    return fail('invalid_value');
  }
  if (!SOURCES.has(input.source) || !ACTORS.has(input.actor)) return fail('invalid_source');
  if (value !== null && !blank(input.unmeasured_reason)) return fail('value_reason_conflict');
  if ((input.unmeasured_reason?.trim().length ?? 0) > 200 || (input.memo?.length ?? 0) > 1000) return fail('text_too_long');
  if (input.opinion && !OPINIONS.has(input.opinion)) return fail('invalid_opinion');
  return null;
}

export async function createProgressGoal(db: Db, trainerId: string, input: MemberProgressGoalInput, now: Date = new Date()): Promise<MemberProgressResult> {
  if (!isUuid(input.request_id)) return fail('request_id_required');
  if (!isUuid(input.member_id)) return fail('member_not_found');
  const member = await db.prepare('SELECT id FROM members WHERE id = ? AND trainer_id = ?').bind(input.member_id, trainerId).first<Row>();
  if (!member) return fail('member_not_found');

  const payload = canonicalJson({
    member_id: input.member_id, name: input.name, condition: input.condition, metric: input.metric,
    direction: input.direction, unit: input.unit, target_value: input.target_value,
    definition_version: input.definition_version, reassessment_due_on: input.reassessment_due_on ?? null,
    measured_on: input.measured_on, value: input.value ?? null, unmeasured_reason: input.unmeasured_reason ?? null,
    source: input.source, actor: input.actor, memo: input.memo ?? null, opinion: input.opinion ?? null,
  });
  const replay = await readRequest(db, trainerId, input.request_id, payload);
  if (replay) return replay;

  if (blank(input.name) || input.name.trim().length > 100 || blank(input.condition) || input.condition.trim().length > 500) {
    return fail('invalid_goal_text');
  }
  if (!METRICS.has(input.metric) || !DIRECTIONS.has(input.direction) || !Number.isInteger(input.definition_version)
    || input.definition_version < 1 || !finite(input.target_value) || input.target_value < 0) {
    return fail('invalid_goal');
  }
  if (UNITS[input.metric] !== input.unit) return fail('invalid_unit');
  if (input.metric === 'difficulty' && (input.target_value > 10 || !Number.isInteger(input.target_value))) return fail('invalid_target_value');
  const measurement = measurementFailure(input, seoulToday(now));
  if (measurement) return measurement;

  const active = await db
    .prepare('SELECT count(*) AS n FROM member_progress_goals WHERE member_id = ? AND trainer_id = ? AND is_active = 1')
    .bind(input.member_id, trainerId)
    .first<{ n: number }>();
  if ((active?.n ?? 0) >= 3) return fail('active_goal_limit');

  const at = nowIso(now);
  const goalId = newId();
  const observationId = newId();
  const response: MemberProgressResult = { success: true, goal_id: goalId, observation_id: observationId };
  const statements: D1PreparedStatement[] = [
    db
      .prepare('INSERT INTO member_progress_requests (trainer_id, request_id, request_payload, response, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(trainerId, input.request_id, payload, JSON.stringify(response), at),
    db
      .prepare(
        `INSERT INTO member_progress_goals (id, trainer_id, member_id, series_id, name, condition, metric, direction, unit, target_value,
                                            definition_version, is_active, reassessment_due_on, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(goalId, trainerId, input.member_id, newId(), input.name.trim(), input.condition.trim(), input.metric, input.direction,
        input.unit, input.target_value, input.definition_version, isDate(input.reassessment_due_on) ? input.reassessment_due_on : null, at, at),
    db
      .prepare(
        `INSERT INTO member_progress_observations (id, trainer_id, member_id, goal_id, definition_version, metric, unit, measured_on,
                                                   value, unmeasured_reason, source, actor, memo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'trainer', ?, ?)`,
      )
      .bind(observationId, trainerId, input.member_id, goalId, input.definition_version, input.metric, input.unit, input.measured_on,
        input.value ?? null, input.unmeasured_reason?.trim() || null, input.source, input.memo?.trim() || null, at),
  ];
  if (input.opinion) {
    statements.push(
      db
        .prepare('INSERT INTO member_progress_opinions (id, trainer_id, member_id, observation_id, opinion, actor, created_at) VALUES (?, ?, ?, ?, ?, \'trainer\', ?)')
        .bind(newId(), trainerId, input.member_id, observationId, input.opinion, at),
    );
  }
  try {
    await db.batch(statements);
    return response;
  } catch (error) {
    if (isUniqueViolation(error, 'member_progress_requests')) {
      const raced = await readRequest(db, trainerId, input.request_id, payload);
      if (raced) return raced;
    }
    if (isDbError(error, 'active_goal_limit')) return fail('active_goal_limit');
    throw error;
  }
}

export async function recordProgressObservation(
  db: Db,
  trainerId: string,
  input: MemberProgressObservationInput,
  now: Date = new Date(),
): Promise<MemberProgressResult> {
  if (!isUuid(input.request_id)) return fail('request_id_required');
  if (!isUuid(input.goal_id)) return fail('goal_not_found');
  const goal = await db
    .prepare(
      `SELECT g.id, g.member_id, g.definition_version, g.metric, g.unit FROM member_progress_goals g
         JOIN members m ON m.id = g.member_id AND m.trainer_id = g.trainer_id
        WHERE g.id = ? AND g.trainer_id = ?`,
    )
    .bind(input.goal_id, trainerId)
    .first<Row>();
  if (!goal) return fail('goal_not_found');

  const payload = canonicalJson({
    goal_id: input.goal_id, definition_version: input.definition_version, metric: input.metric, unit: input.unit,
    measured_on: input.measured_on, value: input.value ?? null, unmeasured_reason: input.unmeasured_reason ?? null,
    source: input.source, actor: input.actor, memo: input.memo ?? null, opinion: input.opinion ?? null,
    supersedes_observation_id: input.supersedes_observation_id ?? null, correction_reason: input.correction_reason ?? null,
  });
  const replay = await readRequest(db, trainerId, input.request_id, payload);
  if (replay) return replay;

  if (input.definition_version !== Number(goal.definition_version) || input.metric !== goal.metric || input.unit !== goal.unit) {
    return fail('goal_definition_mismatch');
  }
  const measurement = measurementFailure(input, seoulToday(now));
  if (measurement) return measurement;

  const memberId = String(goal.member_id);
  if (input.supersedes_observation_id) {
    if (blank(input.correction_reason)) return fail('correction_reason_required');
    if (input.correction_reason!.trim().length > 500) return fail('correction_reason_too_long');
    const original = isUuid(input.supersedes_observation_id)
      ? await db
          .prepare('SELECT measured_on, source, definition_version FROM member_progress_observations WHERE id = ? AND goal_id = ? AND member_id = ? AND trainer_id = ?')
          .bind(input.supersedes_observation_id, input.goal_id, memberId, trainerId)
          .first<Row>()
      : null;
    if (!original) return fail('superseded_observation_not_found');
    if (original.measured_on !== input.measured_on || original.source !== input.source || Number(original.definition_version) !== input.definition_version) {
      return fail('correction_context_mismatch');
    }
    const corrected = await db
      .prepare('SELECT 1 AS found FROM member_progress_observations WHERE supersedes_observation_id = ?')
      .bind(input.supersedes_observation_id)
      .first<Row>();
    if (corrected) return fail('observation_already_corrected');
  } else if (!blank(input.correction_reason)) {
    return fail('superseded_observation_required');
  }

  const at = nowIso(now);
  const observationId = newId();
  const response: MemberProgressResult = { success: true, observation_id: observationId };
  const statements: D1PreparedStatement[] = [
    db
      .prepare('INSERT INTO member_progress_requests (trainer_id, request_id, request_payload, response, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(trainerId, input.request_id, payload, JSON.stringify(response), at),
    db
      .prepare(
        `INSERT INTO member_progress_observations (id, trainer_id, member_id, goal_id, definition_version, metric, unit, measured_on, value,
                                                   unmeasured_reason, source, actor, memo, supersedes_observation_id, correction_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'trainer', ?, ?, ?, ?)`,
      )
      .bind(observationId, trainerId, memberId, input.goal_id, input.definition_version, input.metric, input.unit, input.measured_on,
        input.value ?? null, input.unmeasured_reason?.trim() || null, input.source, input.memo?.trim() || null,
        input.supersedes_observation_id || null, input.correction_reason?.trim() || null, at),
  ];
  if (input.opinion) {
    statements.push(
      db
        .prepare('INSERT INTO member_progress_opinions (id, trainer_id, member_id, observation_id, opinion, actor, created_at) VALUES (?, ?, ?, ?, ?, \'trainer\', ?)')
        .bind(newId(), trainerId, memberId, observationId, input.opinion, at),
    );
  }
  try {
    await db.batch(statements);
    return response;
  } catch (error) {
    if (isUniqueViolation(error, 'member_progress_requests')) {
      const raced = await readRequest(db, trainerId, input.request_id, payload);
      if (raced) return raced;
    }
    if (isUniqueViolation(error, 'member_progress_observations')) return fail('observation_already_corrected');
    throw error;
  }
}

export async function getMemberProgress(db: Db, trainerId: string, memberId: string): Promise<MemberProgressResult> {
  if (!isUuid(memberId)) return fail('member_not_found');
  const [memberResult, goalResult, observationResult, opinionResult] = await db.batch<Row>([
    db.prepare('SELECT id FROM members WHERE id = ? AND trainer_id = ?').bind(memberId, trainerId),
    db.prepare('SELECT * FROM member_progress_goals WHERE member_id = ? AND trainer_id = ? ORDER BY created_at, id').bind(memberId, trainerId),
    db.prepare('SELECT * FROM member_progress_observations WHERE member_id = ? AND trainer_id = ? ORDER BY measured_on, created_at, id').bind(memberId, trainerId),
    db.prepare('SELECT * FROM member_progress_opinions WHERE member_id = ? AND trainer_id = ? ORDER BY created_at, id').bind(memberId, trainerId),
  ]);
  if (memberResult.results.length === 0) return fail('member_not_found');
  return {
    success: true,
    goals: goalResult.results.map((row) => ({
      ...(row as unknown as MemberProgressGoal),
      target_value: Number(row.target_value),
      definition_version: Number(row.definition_version),
      is_active: bool(row.is_active),
    })),
    observations: observationResult.results.map((row) => ({
      ...(row as unknown as MemberProgressObservation),
      definition_version: Number(row.definition_version),
      value: row.value === null ? null : Number(row.value),
    })),
    opinions: opinionResult.results.map((row) => row as unknown as MemberProgressOpinion),
  };
}
