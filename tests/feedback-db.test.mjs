import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

let db;
const trainer = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const homework = '00000000-0000-4000-8000-000000000003';
const otherTrainer = '00000000-0000-4000-8000-000000000004';
const otherMember = '00000000-0000-4000-8000-000000000005';
const signature = 'public.submit_homework_feedback(text,text,boolean,text,text)';
const discomfortSignature = 'public.submit_homework_feedback(text,text,integer,text)';

before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  // Minimal Supabase auth scaffolding; all application tables, RLS, and RPCs
  // below come from the actual migrations, not a copied test schema.
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE unprivileged;
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
  ]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
  await db.query('INSERT INTO auth.users (id) VALUES ($1)', [trainer]);
  await db.query(`INSERT INTO public.members (id, trainer_id, name, phone)
    VALUES ($1, $2, 'Test member', '')`, [member, trainer]);
  await db.query('INSERT INTO auth.users (id) VALUES ($1)', [otherTrainer]);
  await db.query(`INSERT INTO public.members (id, trainer_id, name, phone)
    VALUES ($1, $2, 'Other member', '')`, [otherMember, otherTrainer]);
});

beforeEach(async () => {
  await db.exec('TRUNCATE public.homework CASCADE');
  await db.query(`INSERT INTO public.homework
    (id, trainer_id, member_id, token, token_expires_at, why, status, updated_at)
    VALUES ($1, $2, $3, 'active', now() + interval '1 day', '', 'sent', '2026-01-01')`,
  [homework, trainer, member]);
  await db.query(`INSERT INTO public.homework_items (homework_id, name, reps)
    VALUES ($1, 'Bridge', 10)`, [homework]);
});

afterEach(async () => {
  await db.exec(`RESET ROLE;
    SELECT set_config('test.actor', '', false);
    DROP TRIGGER IF EXISTS fail_pain ON public.homework_logs;
    DROP TRIGGER IF EXISTS fail_update ON public.homework;
    DELETE FROM public.member_import_records;
    DELETE FROM public.member_onboarding_requests;
    DELETE FROM public.members
      WHERE id NOT IN (
        '00000000-0000-4000-8000-000000000002'::uuid,
        '00000000-0000-4000-8000-000000000005'::uuid
      );`);
});
after(async () => { await db?.close(); });

async function submit(kind = 'complete', hasPain = false, note = null, painArea = null, token = 'active') {
  const { rows } = await db.query(
    'SELECT public.submit_homework_feedback($1, $2, $3, $4, $5) AS result',
    [token, kind, hasPain, note, painArea]);
  return rows[0].result;
}

async function submitDiscomfort(kind = 'complete', level = 1, note = null, token = 'active') {
  const { rows } = await db.query(
    'SELECT public.submit_homework_feedback($1, $2, $3::integer, $4) AS result',
    [token, kind, level, note]);
  return rows[0].result;
}

async function createHomework(memberId = member, items = [{
  order_index: 1, name: 'Bridge', cue: '', target_sets: 3, target_reps: '10회',
  effort_kind: 'reps', reps: 10, hold_seconds: null, seconds_per_rep: 3, rest_seconds: 20, per_side: false,
}]) {
  const { rows } = await db.query(
    'SELECT public.create_homework($1, $2, $3, $4, $5::jsonb) AS result',
    [memberId, 'Why', 'abcdefghijklmnopqrstuvwxyz_123', new Date(Date.now() + 86400000).toISOString(), JSON.stringify(items)],
  );
  return rows[0].result;
}

async function asTrainer(id = trainer) {
  await db.query("SELECT set_config('test.actor', $1, false)", [id]);
  await db.exec('SET ROLE authenticated');
}

async function registerMember({
  requestId,
  kind = 'new',
  total = 10,
  remaining = 4,
  rawText = null,
  sourceType = null,
  summary = null,
  recordedFrom = null,
  recordedTo = null,
} = {}) {
  const { rows } = await db.query(
    `SELECT public.register_member_with_import(
      $1::uuid, $2, 'Imported member', '010-1111-2222', $3, $4,
      NULL::date, 'Move without discomfort', $5, $6, $7, $8::date, $9::date
    ) AS result`,
    [requestId, kind, total, remaining, sourceType, rawText, summary, recordedFrom, recordedTo],
  );
  return rows[0].result;
}

test('numeric discomfort overload stores levels 1 and 10 while preserving the optional note', async () => {
  for (const level of [1, 10]) {
    await db.exec('TRUNCATE public.homework_submissions, public.homework_logs');
    const result = await submitDiscomfort('complete', level, '  Member note  ');
    assert.equal(result.success, true);
    const { logs } = await snapshot();
    assert.deepEqual(logs.find((log) => log.kind === 'complete').payload, { note: 'Member note' });
    assert.deepEqual(logs.find((log) => log.kind === 'pain').payload, {
      pain_area: '현재 느끼는 불편함', pain_level: level,
    });
  }
});

for (const level of [null, 0, 11]) {
  test(`numeric discomfort overload rejects ${level} without mutation`, async () => {
    const previous = await snapshot();
    assert.deepEqual(await submitDiscomfort('complete', level), {
      success: false, reason: 'invalid_discomfort_level',
    });
    assert.deepEqual(await snapshot(), previous);
  });
}

async function snapshot() {
  const hw = (await db.query('SELECT * FROM public.homework WHERE id = $1', [homework])).rows[0];
  const logs = (await db.query('SELECT * FROM public.homework_logs ORDER BY kind')).rows;
  const submissions = (await db.query('SELECT * FROM public.homework_submissions ORDER BY submitted_at')).rows;
  return { hw, logs, submissions };
}

for (const [name, token, setup, reason] of [
  ['unknown', 'release-missing', '', 'not_found'],
  ['null', null, '', 'not_found'],
  ['expired', 'active', "UPDATE public.homework SET token_expires_at = now() - interval '1 second'", 'expired'],
  ['revoked timestamp', 'active', 'UPDATE public.homework SET revoked_at = now()', 'revoked'],
  ['revoked status', 'active', "UPDATE public.homework SET status = 'revoked'", 'revoked'],
]) {
  test(`public numeric RPC rejects ${name} tokens without mutation as anon`, async () => {
    if (setup) await db.exec(setup);
    const previous = await snapshot();
    await db.exec('SET ROLE anon');
    assert.deepEqual(await submitDiscomfort('complete', 5, null, token), { success: false, reason });
    await db.exec('RESET ROLE');
    assert.deepEqual(await snapshot(), previous);
  });
}

test('anon final submission touches only the token homework and exposes no trainer data', async () => {
  const other = '00000000-0000-4000-8000-000000000004';
  await db.query(`INSERT INTO public.homework
    (id, trainer_id, member_id, token, token_expires_at, why, status)
    VALUES ($1, $2, $3, 'other-active', now() + interval '1 day', '', 'sent')`,
  [other, trainer, member]);
  const previous = (await db.query('SELECT * FROM public.homework WHERE id = $1', [other])).rows;
  await db.exec('SET ROLE anon');
  const result = await submitDiscomfort('cant', 10, 'synthetic note');
  assert.equal(result.success, true);
  assert.deepEqual(Object.keys(result).sort(), [
    'success', 'log_id', 'pain_log_id', 'status', 'opening_line', 'submitted_at', 'snapshot_hash',
  ].sort());
  assert.deepEqual(await submitDiscomfort('complete', 1), { success: false, reason: 'already_submitted' });
  await db.exec('RESET ROLE');
  assert.deepEqual((await db.query('SELECT * FROM public.homework WHERE id = $1', [other])).rows, previous);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.homework_logs WHERE homework_id = $1', [other])).rows[0].n, 0);
});

test('release migrations do not grant anon underlying table reads or writes', async () => {
  for (const table of ['profiles', 'members', 'homework', 'homework_items', 'homework_logs', 'session_notes', 'homework_submissions']) {
    const { rows: [privileges] } = await db.query(`SELECT
      has_table_privilege('anon', $1, 'SELECT') AS read,
      has_table_privilege('anon', $1, 'INSERT') AS insert,
      has_table_privilege('anon', $1, 'UPDATE') AS update,
      has_table_privilege('anon', $1, 'DELETE') AS delete`, [`public.${table}`]);
    assert.deepEqual(privileges, { read: false, insert: false, update: false, delete: false }, table);
  }
});

test('trainer cannot create homework or session notes for another trainer member', async () => {
  await db.exec('GRANT INSERT ON public.homework, public.session_notes TO authenticated');
  await asTrainer();
  await assert.rejects(db.query(`INSERT INTO public.homework
    (trainer_id, member_id, token, token_expires_at, why, status)
    VALUES ($1, $2, 'forged-token-abcdefghijklmnopqrstuvwxyz', now() + interval '1 day', 'Why', 'sent')`,
  [trainer, otherMember]));
  await assert.rejects(db.query(`INSERT INTO public.session_notes (trainer_id, member_id, note)
    VALUES ($1, $2, 'forged')`, [trainer, otherMember]));
});

test('authenticated create_homework is owner-scoped and atomic', async () => {
  const before = await db.query("SELECT count(*)::int AS n FROM public.homework WHERE token = 'abcdefghijklmnopqrstuvwxyz_123'");
  await asTrainer();
  assert.deepEqual(await createHomework(otherMember), { success: false, reason: 'member_not_found' });
  assert.deepEqual(await createHomework(member, []), { success: false, reason: 'invalid_items' });
  const result = await createHomework();
  assert.equal(result.success, true);
  await db.exec('RESET ROLE');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.homework WHERE token = 'abcdefghijklmnopqrstuvwxyz_123'")).rows[0].n, before.rows[0].n + 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.homework_items WHERE homework_id = $1', [result.id])).rows[0].n, 1);
});

test('create_homework is not executable by anon or PUBLIC', async () => {
  const signature = 'public.create_homework(uuid,text,text,timestamp with time zone,jsonb)';
  const { rows: [privileges] } = await db.query(`SELECT
    has_function_privilege('anon', $1::regprocedure, 'EXECUTE') AS anon_execute,
    has_function_privilege('unprivileged', $1::regprocedure, 'EXECUTE') AS public_execute`, [signature]);
  assert.deepEqual(privileges, { anon_execute: false, public_execute: false });
});

test('public token reader and authenticated writer use an empty definer search path', async () => {
  for (const signature of [
    'public.open_homework(text)',
    'public.create_homework(uuid,text,text,timestamp with time zone,jsonb)',
  ]) {
    const { rows: [functionConfig] } = await db.query(
      'SELECT proconfig FROM pg_proc WHERE oid = $1::regprocedure', [signature]
    );
    assert.ok(functionConfig.proconfig.some((config) => config === 'search_path=""'), signature);
  }
});

test('new member onboarding derives remaining sessions and replays one atomic result', async () => {
  const requestId = '10000000-0000-4000-8000-000000000001';
  await asTrainer();
  const first = await registerMember({ requestId, kind: 'new', total: 20, remaining: 2 });
  const replay = await registerMember({ requestId, kind: 'new', total: 20, remaining: 2 });
  await db.exec('RESET ROLE');

  assert.equal(first.success, true);
  assert.equal(first.member.package_total, 20);
  assert.equal(first.member.package_remaining, 20);
  assert.equal(first.import_record, null);
  assert.equal(replay.member.id, first.member.id);
  assert.equal(replay.replayed, true);

  const count = await db.query(
    `SELECT count(*)::int AS count FROM public.members WHERE name = 'Imported member'`,
  );
  assert.equal(count.rows[0].count, 1);
});

test('existing member onboarding stores source material separately from session notes', async () => {
  const requestId = '10000000-0000-4000-8000-000000000002';
  const beforeNotes = (await db.query('SELECT count(*)::int AS count FROM public.session_notes')).rows[0].count;
  await asTrainer();
  const result = await registerMember({
    requestId,
    kind: 'existing',
    total: 20,
    remaining: 7,
    sourceType: 'existing_note',
    rawText: '  스쿼트 30kg, 왼쪽 무릎 상태 확인  ',
    summary: '다음 수업에서 무릎 확인',
    recordedFrom: '2026-08-01',
    recordedTo: '2026-09-01',
  });
  await db.exec('RESET ROLE');

  assert.equal(result.member.package_remaining, 7);
  assert.equal(result.import_record.raw_text, '스쿼트 30kg, 왼쪽 무릎 상태 확인');
  assert.equal(result.import_record.summary, '다음 수업에서 무릎 확인');
  const afterNotes = (await db.query('SELECT count(*)::int AS count FROM public.session_notes')).rows[0].count;
  assert.equal(afterNotes, beforeNotes);
});

test('invalid existing package state rolls back onboarding request and member', async () => {
  const requestId = '10000000-0000-4000-8000-000000000003';
  await asTrainer();
  await assert.rejects(
    registerMember({ requestId, kind: 'existing', total: 10, remaining: 11 }),
    /invalid_package_remaining/,
  );
  await db.exec('RESET ROLE');
  const requests = await db.query(
    'SELECT count(*)::int AS count FROM public.member_onboarding_requests WHERE request_id = $1',
    [requestId],
  );
  assert.equal(requests.rows[0].count, 0);
});

test('import record RPC enforces ownership and idempotent payloads', async () => {
  const requestId = '10000000-0000-4000-8000-000000000004';
  await asTrainer();
  await assert.rejects(
    db.query(
      `SELECT public.add_member_import_record($1, $2, 'existing_note', 'record', NULL, NULL, NULL)`,
      [requestId, otherMember],
    ),
    /member_not_found/,
  );
  const first = await db.query(
    `SELECT public.add_member_import_record($1, $2, 'existing_note', 'record', 'summary', NULL, NULL) AS result`,
    [requestId, member],
  );
  const replay = await db.query(
    `SELECT public.add_member_import_record($1, $2, 'existing_note', 'record', 'summary', NULL, NULL) AS result`,
    [requestId, member],
  );
  assert.equal(replay.rows[0].result.import_record.id, first.rows[0].result.import_record.id);
  await assert.rejects(
    db.query(
      `SELECT public.add_member_import_record($1, $2, 'existing_note', 'changed', 'summary', NULL, NULL)`,
      [requestId, member],
    ),
    /request_payload_conflict/,
  );
});

test('import records are trainer-only and onboarding RPCs are authenticated-only', async () => {
  const requestSignature = 'public.register_member_with_import(uuid,text,text,text,integer,integer,date,text,text,text,text,date,date)';
  const addSignature = 'public.add_member_import_record(uuid,uuid,text,text,text,date,date)';
  for (const role of ['anon', 'unprivileged']) {
    const privileges = await db.query(
      `SELECT
        has_function_privilege($1, $2::regprocedure, 'EXECUTE') AS can_register,
        has_function_privilege($1, $3::regprocedure, 'EXECUTE') AS can_add`,
      [role, requestSignature, addSignature],
    );
    assert.equal(privileges.rows[0].can_register, false);
    assert.equal(privileges.rows[0].can_add, false);
  }
  const functions = await db.query(
    `SELECT oid::regprocedure::text AS signature, prosecdef, proconfig
     FROM pg_proc WHERE oid IN ($1::regprocedure, $2::regprocedure)`,
    [requestSignature, addSignature],
  );
  assert.equal(functions.rows.length, 2);
  for (const fn of functions.rows) {
    assert.equal(fn.prosecdef, true);
    assert.ok(fn.proconfig.some((config) => config === 'search_path=""'));
  }

  await asTrainer();
  await db.query(
    `SELECT public.add_member_import_record(
      '10000000-0000-4000-8000-000000000005', $1, 'existing_note', 'private record', NULL, NULL, NULL
    )`,
    [member],
  );
  const own = await db.query('SELECT raw_text FROM public.member_import_records');
  assert.deepEqual(own.rows.map((row) => row.raw_text), ['private record']);
  await db.exec('RESET ROLE');

  await asTrainer(otherTrainer);
  const other = await db.query('SELECT raw_text FROM public.member_import_records');
  assert.deepEqual(other.rows, []);
});

test('legacy trainer RPCs are not anonymously executable and Pro cannot be self-toggled', async () => {
  const { rows: [privileges] } = await db.query(`SELECT
    has_function_privilege('anon', 'public.revoke_homework(uuid)'::regprocedure, 'EXECUTE') AS anon_revoke,
    has_function_privilege('authenticated', 'public.revoke_homework(uuid)'::regprocedure, 'EXECUTE') AS trainer_revoke,
    has_function_privilege('anon', 'public.toggle_pro_status()'::regprocedure, 'EXECUTE') AS anon_toggle,
    has_function_privilege('authenticated', 'public.toggle_pro_status()'::regprocedure, 'EXECUTE') AS trainer_toggle`);
  assert.deepEqual(privileges, {
    anon_revoke: false,
    trainer_revoke: true,
    anon_toggle: false,
    trainer_toggle: false,
  });
  for (const signature of ['public.revoke_homework(uuid)', 'public.toggle_pro_status()']) {
    const { rows: [config] } = await db.query(
      'SELECT proconfig FROM pg_proc WHERE oid = $1::regprocedure',
      [signature],
    );
    assert.ok(config.proconfig.some((value) => value === 'search_path=""'));
  }
});

for (const kind of ['complete', 'cant']) {
  for (const hasPain of [false, true]) {
    test(`SQL commits ${kind}, pain=${hasPain}, and its summary together`, async () => {
      const result = await submit(kind, hasPain, hasPain ? null : '  My note  ', '  Right knee  ');
      assert.equal(result.success, true);
      const { hw, logs } = await snapshot();
      assert.equal(logs.length, hasPain ? 2 : 1);
      assert.equal(logs.find((log) => log.kind === kind).id, result.log_id);
      assert.deepEqual(logs.find((log) => log.kind === kind).payload, hasPain ? {} : { note: 'My note' });
      if (hasPain) {
        const pain = logs.find((log) => log.kind === 'pain');
        assert.equal(pain.id, result.pain_log_id);
        assert.deepEqual(pain.payload, { pain_area: 'Right knee' });
      } else {
        assert.equal(result.pain_log_id, null);
      }
      assert.equal(hw.status, 'logged');
      assert.equal(hw.opening_line, result.opening_line);
      assert.ok(hw.opening_line.includes(hasPain ? 'Right knee' : 'My note'));
      assert.ok(hw.updated_at > new Date('2026-01-01'));
    });
  }
}

test('SQL supplies a pain description for empty input and retains both independent notes', async () => {
  const result = await submit('complete', true, 'note', '  ');
  assert.ok(result.opening_line.includes('note'));
  assert.ok(result.opening_line.includes('동작 중 불편함'));
});

for (const [name, args, setup, reason] of [
  ['unknown token', ['complete', true, null, 'pain', 'missing'], '', 'not_found'],
  ['null token', ['complete', true, null, 'pain', null], '', 'not_found'],
  ['expired token', [], "UPDATE public.homework SET token_expires_at = now() - interval '1 second'", 'expired'],
  ['revoked timestamp', [], 'UPDATE public.homework SET revoked_at = now()', 'revoked'],
  ['revoked status', [], "UPDATE public.homework SET status = 'revoked'", 'revoked'],
  ['invalid kind', ['pain', true], '', 'invalid_kind'],
  ['null kind', [null, true], '', 'invalid_kind'],
  ['null pain flag', ['complete', null], '', 'invalid_pain_flag'],
]) {
  test(`SQL rejects ${name} without any mutation`, async () => {
    if (setup) await db.exec(setup);
    const previous = await snapshot();
    assert.deepEqual(await submit(...args), { success: false, reason });
    assert.deepEqual(await snapshot(), previous);
  });
}

test('failure during the pain insert rolls back the canonical snapshot, logs, and homework', async () => {
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.test_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected write failure'; END; $$;
    CREATE TRIGGER fail_pain AFTER INSERT ON public.homework_logs
      FOR EACH ROW WHEN (NEW.kind = 'pain') EXECUTE FUNCTION public.test_fail_write();
  `);
  const previous = await snapshot();
  await assert.rejects(submitDiscomfort('complete', 5, 'note'), /injected write failure/);
  assert.deepEqual(await snapshot(), previous);
});

test('final submission stores the canonical exercise snapshot and a reproducible SHA-256 hash', async () => {
  const result = await submitDiscomfort('cant', 8, '  어려웠어요  ');
  assert.equal(result.success, true);
  assert.match(result.snapshot_hash, /^[0-9a-f]{64}$/);

  const { rows: [submission] } = await db.query(
    `SELECT snapshot, snapshot_hash, submitted_at,
      encode(extensions.digest(convert_to(snapshot::text, 'UTF8'), 'sha256'), 'hex') AS recomputed_hash
     FROM public.homework_submissions WHERE homework_id = $1`,
    [homework]);
  assert.equal(submission.snapshot_hash, result.snapshot_hash);
  assert.equal(submission.recomputed_hash, submission.snapshot_hash);
  assert.equal(submission.snapshot.version, 1);
  assert.equal(submission.snapshot.homework_id, homework);
  assert.equal(submission.snapshot.result, 'cant');
  assert.equal(submission.snapshot.discomfort_level, 8);
  assert.equal(submission.snapshot.note, '어려웠어요');
  assert.equal(Date.parse(submission.snapshot.submitted_at), submission.submitted_at.getTime());
  assert.deepEqual(submission.snapshot.exercises.map((item) => ({ name: item.name, reps: item.reps })), [
    { name: 'Bridge', reps: 10 },
  ]);
});

test('a confirmed submission cannot be rewritten and leaves the original snapshot unchanged', async () => {
  assert.equal((await submitDiscomfort('complete', 2, 'first')).success, true);
  const confirmed = await snapshot();
  assert.deepEqual(await submitDiscomfort('cant', 10, 'replacement'), {
    success: false, reason: 'already_submitted',
  });
  assert.deepEqual(await snapshot(), confirmed);
});

test('concurrent final submissions serialize to exactly one immutable winner', async () => {
  const results = await Promise.all([
    submitDiscomfort('complete', 3, 'first'),
    submitDiscomfort('cant', 9, 'second'),
  ]);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(results.filter((result) => result.reason === 'already_submitted').length, 1);
  const state = await snapshot();
  assert.equal(state.submissions.length, 1);
  assert.equal(state.logs.filter((log) => log.kind === 'complete' || log.kind === 'cant').length, 1);
});

test('legacy stored logs survive and are not rewritten by the canonical submission', async () => {
  await db.query(
    `INSERT INTO public.homework_logs (homework_id, kind, payload)
     VALUES ($1, 'note', '{"note":"legacy"}'::jsonb)`,
    [homework]);
  assert.equal((await submitDiscomfort('complete', 4)).success, true);
  const state = await snapshot();
  assert.equal(state.logs.find((log) => log.kind === 'note').payload.note, 'legacy');
  assert.equal(state.submissions.length, 1);
});

test('failure during the homework update rolls back the canonical snapshot and both logs', async () => {
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.test_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected write failure'; END; $$;
    CREATE TRIGGER fail_update AFTER UPDATE ON public.homework
      FOR EACH ROW EXECUTE FUNCTION public.test_fail_write();
  `);
  const previous = await snapshot();
  await assert.rejects(submitDiscomfort('cant', 7, 'note'), /injected write failure/);
  assert.deepEqual(await snapshot(), previous);
});

test('only the numeric final RPC is public; legacy mutation paths cannot bypass it', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    const result = await submitDiscomfort('complete', 5);
    assert.ok(result.success || result.reason === 'already_submitted');
    await assert.rejects(submit('complete', true), /permission denied/);
    await assert.rejects(
      db.query(`SELECT public.log_homework('active', 'complete', '{}'::jsonb)`),
      /permission denied/);
    await assert.rejects(db.query('SELECT * FROM public.homework_logs'), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM public.homework_submissions'), /permission denied/);
    await db.exec('RESET ROLE');
  }
  const { rows } = await db.query(`SELECT prosecdef, proconfig,
    has_function_privilege('unprivileged', oid, 'EXECUTE') AS public_execute
    FROM pg_proc WHERE oid = $1::regprocedure`, [signature]);
  assert.equal(rows[0].prosecdef, true);
  assert.ok(rows[0].proconfig.some((config) => config === 'search_path=""'));
  assert.equal(rows[0].public_execute, false);
  const legacyRoles = await db.query(`SELECT
    has_function_privilege('anon', $1::regprocedure, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') AS authenticated_execute`,
  [signature]);
  assert.equal(legacyRoles.rows[0].anon_execute, false);
  assert.equal(legacyRoles.rows[0].authenticated_execute, false);

  const discomfortPrivileges = await db.query(`SELECT prosecdef, proconfig,
    has_function_privilege('unprivileged', oid, 'EXECUTE') AS public_execute
    FROM pg_proc WHERE oid = $1::regprocedure`, [discomfortSignature]);
  assert.equal(discomfortPrivileges.rows[0].prosecdef, true);
  assert.ok(discomfortPrivileges.rows[0].proconfig.some((config) => config === 'search_path=""'));
  assert.equal(discomfortPrivileges.rows[0].public_execute, false);
});
