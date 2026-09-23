import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { randomUUID } from 'node:crypto';

let db;
const trainer = '00000000-0000-4000-8000-000000000101';
const otherTrainer = '00000000-0000-4000-8000-000000000102';
const member = '00000000-0000-4000-8000-000000000111';
const otherMember = '00000000-0000-4000-8000-000000000112';

before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT NULLIF(current_setting('test.actor', true), '')::uuid $$;
  `);
  for (const file of [
    '20260415000000_exercise_homework_init.sql',
    '20260416000000_voice_coach_cadence.sql',
    '20260417000000_atomic_homework_submission.sql',
    '20260919000000_discomfort_level_feedback.sql',
    '20260919010000_immutable_homework_submission.sql',
    '20260920000000_trainer_ownership_and_atomic_homework.sql',
    '20260920115204_member_onboarding_imports.sql',
    '20260921000000_member_progress_measurements.sql',
    '20260921010000_exercise_catalog.sql',
    '20260921074826_member_progress_correctness.sql',
  ]) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  await db.query('INSERT INTO auth.users (id) VALUES ($1), ($2)', [trainer, otherTrainer]);
  await db.query('INSERT INTO public.members (id, trainer_id, name, phone) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)',
    [member, trainer, 'Member', '', otherMember, otherTrainer, 'Other', '']);
});

after(async () => { await db?.close(); });

async function as(role, actor = trainer) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('test.actor', $1, false)", [actor]);
  await db.exec(`SET ROLE ${role}`);
}

async function createGoal(requestId, memberId = member, overrides = {}) {
  const values = [requestId, memberId, overrides.name ?? '10분 걷기', overrides.condition ?? '평지, 보조기 없이', overrides.metric ?? 'duration', overrides.direction ?? 'increase', overrides.unit ?? 'seconds', overrides.target ?? 600, overrides.version ?? 1, overrides.due ?? '2026-10-05', overrides.measured ?? '2026-09-21', overrides.value ?? 300, overrides.reason ?? null, overrides.source ?? 'member_report', overrides.actor ?? 'member', overrides.memo ?? '기준선', overrides.opinion ?? 'same'];
  const { rows } = await db.query(`SELECT public.create_member_progress_goal($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8::numeric,$9::int,$10::date,$11::date,$12::numeric,$13,$14,$15,$16,$17) AS result`, values);
  return rows[0].result;
}

test('creates an owned goal and baseline atomically, then replays the same request', async () => {
  await as('authenticated');
  const first = await createGoal('00000000-0000-4000-8000-000000000201');
  assert.equal(first.success, true);
  const replay = await createGoal('00000000-0000-4000-8000-000000000201');
  assert.deepEqual(replay, first);
  const { rows } = await db.query('SELECT public.get_member_progress($1) AS result', [member]);
  assert.equal(rows[0].result.goals.length, 1);
  assert.equal(rows[0].result.observations.length, 1);
  assert.equal(rows[0].result.opinions[0].opinion, 'same');
});

test('rejects cross-trainer members and request payload conflicts', async () => {
  await as('authenticated');
  assert.equal((await createGoal('00000000-0000-4000-8000-000000000202', otherMember)).reason, 'member_not_found');
  assert.equal((await createGoal('00000000-0000-4000-8000-000000000203')).success, true);
  assert.equal((await createGoal('00000000-0000-4000-8000-000000000203', member, { name: '다른 목표' })).reason, 'request_conflict');
});

test('rejects future dates and invalid difficulty values', async () => {
  await as('authenticated');
  assert.equal((await createGoal('00000000-0000-4000-8000-000000000204', member, { measured: '2999-01-01' })).reason, 'measured_on_future');
  assert.equal((await createGoal('00000000-0000-4000-8000-000000000205', member, { metric: 'difficulty', unit: 'score_0_10', target: 11, value: 4 })).reason, 'invalid_target_value');
});

test('only the owner can read progress and anonymous execution is denied', async () => {
  await as('authenticated', otherTrainer);
  assert.equal((await db.query('SELECT public.get_member_progress($1) AS result', [member])).rows[0].result.reason, 'member_not_found');
  await as('anon', '');
  await assert.rejects(db.query('SELECT public.get_member_progress($1)', [member]), /permission denied/);
});

async function freshGoal(overrides = {}) {
  await db.exec('RESET ROLE');
  const memberId = randomUUID();
  await db.query('INSERT INTO public.members (id, trainer_id, name, phone) VALUES ($1,$2,$3,$4)', [memberId, trainer, 'Synthetic progress test', '']);
  await as('authenticated');
  const goal = await createGoal(randomUUID(), memberId, overrides);
  assert.equal(goal.success, true);
  return { ...goal, memberId };
}

async function observe(goalId, overrides = {}) {
  const input = { request: randomUUID(), version: 1, metric: 'duration', unit: 'seconds', measured: '2026-09-21', value: 0, reason: null, source: 'member_report', actor: 'member', memo: null, opinion: null, supersedes: null, correction: null, ...overrides };
  return (await db.query('SELECT public.record_member_progress_observation($1::uuid,$2::uuid,$3::int,$4,$5,$6::date,$7::numeric,$8,$9,$10,$11,$12,$13::uuid,$14) AS result', [input.request, goalId, input.version, input.metric, input.unit, input.measured, input.value, input.reason, input.source, input.actor, input.memo, input.opinion, input.supersedes, input.correction])).rows[0].result;
}

async function progress(memberId) {
  return (await db.query('SELECT public.get_member_progress($1) AS result', [memberId])).rows[0].result;
}

test('member-reported values retain their source while authenticated trainer is the actor', async () => {
  const goal = await freshGoal();
  const added = await observe(goal.goal_id, { opinion: 'better' });
  assert.equal(added.success, true);
  const result = await progress(goal.memberId);
  assert.ok(result.observations.every((row) => row.source === 'member_report' && row.actor === 'trainer' && row.trainer_id === trainer));
  assert.ok(result.opinions.every((row) => row.actor === 'trainer'));
});

test('zero, missing values and explicit missing reasons are distinct; difficulty must be integer', async () => {
  const goal = await freshGoal();
  assert.equal((await observe(goal.goal_id, { value: 0 })).success, true);
  assert.equal((await observe(goal.goal_id, { value: null })).reason, 'unmeasured_reason_required');
  assert.equal((await observe(goal.goal_id, { value: null, reason: '측정하지 못함' })).success, true);
  assert.equal((await observe(goal.goal_id, { value: 0, reason: '모순' })).reason, 'value_reason_conflict');
  assert.equal((await observe(goal.goal_id, { value: 'NaN' })).reason, 'invalid_value');
  const difficulty = await freshGoal({ metric: 'difficulty', unit: 'score_0_10', target: 2, value: 8 });
  assert.equal((await observe(difficulty.goal_id, { metric: 'difficulty', unit: 'score_0_10', value: 1.5 })).reason, 'invalid_value');
  assert.equal((await createGoal(randomUUID(), difficulty.memberId, { metric: 'difficulty', unit: 'score_0_10', target: 2.5, value: 8 })).reason, 'invalid_target_value');
});

test('correction chains retain originals, reject another goal and cannot branch', async () => {
  const goal = await freshGoal();
  const second = await freshGoal();
  const payload = { value: 310, supersedes: goal.observation_id, correction: '입력 정정' };
  assert.equal((await observe(second.goal_id, payload)).reason, 'superseded_observation_not_found');
  assert.equal((await observe(goal.goal_id, { ...payload, source: 'trainer_measurement' })).reason, 'correction_context_mismatch');
  assert.equal((await observe(goal.goal_id, { ...payload, measured: '2026-09-20' })).reason, 'correction_context_mismatch');
  const correction = await observe(goal.goal_id, payload);
  assert.equal(correction.success, true);
  assert.equal((await observe(goal.goal_id, payload)).reason, 'observation_already_corrected');
  const final = await observe(goal.goal_id, { ...payload, value: 320, supersedes: correction.observation_id });
  assert.equal(final.success, true);
  const result = await progress(goal.memberId);
  assert.equal(result.observations.length, 3);
  assert.equal(result.observations.find((row) => row.id === goal.observation_id).value, 300);
  assert.equal(result.observations.find((row) => row.id === final.observation_id).supersedes_observation_id, correction.observation_id);
});

test('observation response-loss replay returns one row, changed payload conflicts', async () => {
  const goal = await freshGoal();
  const payload = { request: randomUUID(), value: 1 };
  const first = await observe(goal.goal_id, payload);
  assert.deepEqual(await observe(goal.goal_id, payload), first);
  assert.equal((await observe(goal.goal_id, { ...payload, value: 2 })).reason, 'request_conflict');
  assert.equal((await progress(goal.memberId)).observations.length, 2);
});

test('request replay rechecks current parent ownership', async () => {
  const goal = await freshGoal();
  const payload = { request: randomUUID(), value: 1 };
  assert.equal((await observe(goal.goal_id, payload)).success, true);
  await db.exec('RESET ROLE');
  await db.query('UPDATE public.members SET trainer_id=$1 WHERE id=$2', [otherTrainer, goal.memberId]);
  await as('authenticated');
  assert.equal((await observe(goal.goal_id, payload)).reason, 'goal_not_found');
});

test('write failure rolls back baseline, goal and request atomically', async () => {
  const goal = await freshGoal();
  await db.exec('RESET ROLE');
  await db.exec(`CREATE FUNCTION public.test_progress_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test injected'; END $$;
    CREATE TRIGGER test_progress_fail BEFORE INSERT ON public.member_progress_observations FOR EACH ROW EXECUTE FUNCTION public.test_progress_fail();`);
  await as('authenticated');
  const request = randomUUID();
  await assert.rejects(createGoal(request, goal.memberId), /test injected/);
  await db.exec('RESET ROLE');
  await db.exec('DROP TRIGGER test_progress_fail ON public.member_progress_observations; DROP FUNCTION public.test_progress_fail();');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.member_progress_requests WHERE request_id=$1', [request])).rows[0].count, 0);
  await as('authenticated');
  assert.equal((await progress(goal.memberId)).goals.length, 1);
  assert.equal((await createGoal(request, goal.memberId)).success, true);
});

test('additive function migration can roll back without changing stored rows, then reapply', async () => {
  await db.exec('RESET ROLE');
  const before = (await db.query('SELECT count(*)::int AS count FROM public.member_progress_observations')).rows[0].count;
  const original = readFileSync(new URL('../supabase/migrations/20260921000000_member_progress_measurements.sql', import.meta.url), 'utf8');
  await db.exec(original.slice(original.indexOf('CREATE OR REPLACE FUNCTION public.create_member_progress_goal('), original.indexOf('CREATE OR REPLACE FUNCTION public.get_member_progress(')));
  await db.exec(readFileSync(new URL('../supabase/migrations/20260921074826_member_progress_correctness.sql', import.meta.url), 'utf8'));
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.member_progress_observations')).rows[0].count, before);
});
