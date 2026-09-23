import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

let db;
const trainer = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const otherTrainer = '00000000-0000-4000-8000-000000000003';
const otherMember = '00000000-0000-4000-8000-000000000004';
const secondMember = '00000000-0000-4000-8000-000000000005';
const exercise = '00000000-0000-4000-8000-000000000006';
const migration = '20260921171403_homework_assignment_v2.sql';
const signature = 'public.create_homework_v2(uuid,uuid,text,text,timestamptz,jsonb,text,integer,uuid)';
const item = { order_index: 1, name: 'Bridge', cue: '', target_sets: 2, target_reps: '10회', reps: 10 };
let legacyHomework;
let legacyDefinition;
let publicDefinitions;

async function asRole(role, actor, work) {
  await db.query("SELECT set_config('test.actor',$1,false)", [actor ?? '']);
  await db.exec(`SET ROLE ${role}`);
  try { return await work(); } finally { await db.exec('RESET ROLE'); }
}
function request(overrides = {}) {
  return { requestId: crypto.randomUUID(), memberId: member, why: 'Practice',
    token: `synthetic_${crypto.randomUUID().replaceAll('-', '')}`,
    expires: new Date(Date.now() + 86400000).toISOString(), items: [item],
    purpose: null, budget: null, source: null, ...overrides };
}
async function create(input) {
  const { rows } = await db.query(`SELECT public.create_homework_v2(
    $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) AS result`,
  [input.requestId, input.memberId, input.why, input.token, input.expires,
    JSON.stringify(input.items), input.purpose, input.budget, input.source]);
  return rows[0].result;
}
const assign = (input, actor = trainer) => asRole('authenticated', actor, () => create(input));
async function legacy() {
  const input = request();
  return asRole('authenticated', trainer, async () => (await db.query(
    'SELECT public.create_homework($1,$2,$3,$4,$5::jsonb) AS result',
    [member, input.why, input.token, input.expires, JSON.stringify(input.items)],
  )).rows[0].result);
}
async function counts() {
  return (await db.query(`SELECT
    (SELECT count(*)::int FROM public.homework) AS homework,
    (SELECT count(*)::int FROM public.homework_items) AS items,
    (SELECT count(*)::int FROM public.homework_assignment_requests) AS requests`)).rows[0];
}
async function definitions() {
  return (await db.query(`SELECT oid::regprocedure::text AS signature, pg_get_functiondef(oid) AS definition
    FROM pg_proc WHERE proname IN ('open_homework','submit_homework_feedback') ORDER BY oid`)).rows;
}

before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE unprivileged;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT NULLIF(current_setting('test.actor',true),'')::uuid $$;`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const file of readdirSync(directory).filter((file) => file.endsWith('.sql') && file < migration).sort()) {
    await db.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [trainer, otherTrainer]);
  await db.query(`INSERT INTO public.members(id,trainer_id,name,phone)
    VALUES($1,$2,'Synthetic A',''),($3,$4,'Synthetic B',''),($5,$2,'Synthetic A2','')`,
  [member, trainer, otherMember, otherTrainer, secondMember]);
  legacyHomework = (await legacy()).id;
  legacyDefinition = (await db.query("SELECT pg_get_functiondef('public.create_homework(uuid,text,text,timestamptz,jsonb)'::regprocedure) AS definition")).rows[0].definition;
  publicDefinitions = await definitions();
  await db.exec(readFileSync(new URL(migration, directory), 'utf8'));
  await db.query(`INSERT INTO public.exercise_catalog(id,name,default_cue,source_note,reviewed_by,reviewed_at,status)
    VALUES($1,'Reviewed bridge','Reviewed cue','Synthetic source','QA',now(),'published')`, [exercise]);
});
after(async () => { await db?.close(); });

test('existing rows and unchanged legacy/public RPCs remain compatible', async () => {
  for (const id of [legacyHomework, (await legacy()).id]) {
    const row = (await db.query(`SELECT h.assignment_purpose,h.burden_budget_seconds,h.source_homework_id,i.requirement
      FROM public.homework h JOIN public.homework_items i ON i.homework_id=h.id WHERE h.id=$1`, [id])).rows[0];
    assert.deepEqual(row, { assignment_purpose: null, burden_budget_seconds: null, source_homework_id: null, requirement: 'required' });
  }
  assert.equal((await db.query("SELECT pg_get_functiondef('public.create_homework(uuid,text,text,timestamptz,jsonb)'::regprocedure) AS definition")).rows[0].definition, legacyDefinition);
  assert.deepEqual(await definitions(), publicDefinitions);
});

test('v2 saves nullable metadata, purpose variants, valid same-member lineage and item requirements', async () => {
  for (const purpose of [null, 'routine', 'focus', 'review']) {
    const input = request({ purpose, budget: purpose ? 300 : null, source: legacyHomework,
      items: [item, { ...item, order_index: 2, requirement: 'optional' }] });
    const result = await assign(input);
    assert.equal(result.success, true);
    assert.equal(result.replayed, false);
    const saved = (await db.query('SELECT assignment_purpose,burden_budget_seconds,source_homework_id FROM public.homework WHERE id=$1', [result.id])).rows[0];
    assert.deepEqual(saved, { assignment_purpose: purpose, burden_budget_seconds: input.budget, source_homework_id: legacyHomework });
    assert.deepEqual((await db.query('SELECT requirement FROM public.homework_items WHERE homework_id=$1 ORDER BY order_index', [result.id])).rows.map((row) => row.requirement), ['required', 'optional']);
  }
});

test('owner checks reject unauthorized/member/source probes before writes', async () => {
  const foreign = await assign(request({ memberId: otherMember }), otherTrainer);
  const second = await assign(request({ memberId: secondMember }));
  const before = await counts();
  assert.deepEqual(await assign(request(), null), { success: false, reason: 'unauthorized' });
  for (const memberId of [otherMember, crypto.randomUUID()]) {
    assert.deepEqual(await assign(request({ memberId })), { success: false, reason: 'member_not_found' });
  }
  for (const source of [foreign.id, second.id, crypto.randomUUID()]) {
    assert.deepEqual(await assign(request({ source })), { success: false, reason: 'source_homework_not_found' });
  }
  assert.deepEqual(await counts(), before);
});

test('invalid inputs never leave a reservation, homework or item', async () => {
  const before = await counts();
  for (const [change, reason] of [
    [{ requestId: null }, 'invalid_request_id'], [{ purpose: 'unknown' }, 'invalid_assignment_purpose'],
    [{ budget: 0 }, 'invalid_burden_budget'], [{ budget: -1 }, 'invalid_burden_budget'],
    [{ items: null }, 'invalid_items'], [{ items: [] }, 'invalid_items'],
    [{ items: [item, item] }, 'invalid_items'], [{ items: [null] }, 'invalid_items'],
    [{ items: [{ ...item, requirement: null }] }, 'invalid_items'],
    [{ items: [{ ...item, requirement: 'maybe' }] }, 'invalid_items'],
    [{ items: [{ ...item, requirement: 'optional' }] }, 'invalid_items'],
    [{ items: [1, 2, 3].map((order_index) => ({ ...item, order_index, requirement: 'optional' })) }, 'invalid_items'],
    [{ items: [{ ...item, target_sets: null }] }, 'invalid_items'],
    [{ items: [{ ...item, name: '' }] }, 'invalid_items'],
    [{ why: ' ' }, 'invalid_why'], [{ token: 'short' }, 'invalid_token'],
    [{ expires: '2020-01-01T00:00:00Z' }, 'invalid_expiry'],
  ]) {
    assert.deepEqual(await assign(request(change)), { success: false, reason });
    assert.deepEqual(await counts(), before);
  }
});

test('identical retries return one id; changed payloads conflict and tokens are not cached', async () => {
  const input = request({ purpose: 'focus', budget: 200 });
  const before = await counts();
  const first = await assign(input);
  assert.deepEqual(await assign(input), { ...first, replayed: true });
  await db.exec("SET TIME ZONE 'Asia/Seoul'");
  try { assert.deepEqual(await assign(input), { ...first, replayed: true }); }
  finally { await db.exec("SET TIME ZONE 'UTC'"); }
  for (const change of [{ why: 'Different' }, { purpose: 'review' }, { budget: 201 },
    { token: request().token }, { source: legacyHomework }, { items: [item, { ...item, order_index: 2, requirement: 'optional' }] }]) {
    assert.deepEqual(await assign({ ...input, ...change }), { success: false, reason: 'request_payload_conflict' });
  }
  const after = await counts();
  assert.deepEqual(after, { homework: before.homework + 1, items: before.items + 1, requests: before.requests + 1 });
  const payload = (await db.query('SELECT request_payload FROM public.homework_assignment_requests WHERE request_id=$1', [input.requestId])).rows[0].request_payload;
  assert.equal(JSON.stringify(payload).includes(input.token), false);
  assert.match(payload.token_sha256, /^[a-f0-9]{64}$/);
  // The same UUID in a different trainer scope is an independent assignment.
  assert.equal((await assign(request({ requestId: input.requestId, memberId: otherMember }), otherTrainer)).success, true);
});

test('queued same-key retries converge on one result in PGlite', async () => {
  const input = request();
  const before = await counts();
  // PGlite serializes its single connection. A live Postgres multi-session race
  // remains a deployment check; the PK/ON CONFLICT is the serialization boundary.
  const results = await asRole('authenticated', trainer, () => Promise.all([create(input), create(input)]));
  assert.equal(results[0].id, results[1].id);
  assert.equal(results.filter((result) => result.replayed).length, 1);
  assert.deepEqual(await counts(), { homework: before.homework + 1, items: before.items + 1, requests: before.requests + 1 });
});

test('replay rechecks current member, source and resulting homework ownership', async () => {
  const input = request({ source: legacyHomework });
  const result = await assign(input);
  await db.query('UPDATE public.members SET trainer_id=$1 WHERE id=$2', [otherTrainer, member]);
  try { assert.equal((await assign(input)).reason, 'member_not_found'); }
  finally { await db.query('UPDATE public.members SET trainer_id=$1 WHERE id=$2', [trainer, member]); }
  for (const id of [legacyHomework, result.id]) {
    await db.query('UPDATE public.homework SET trainer_id=$1 WHERE id=$2', [otherTrainer, id]);
    try { assert.equal((await assign(input)).reason, id === legacyHomework ? 'source_homework_not_found' : 'homework_not_found'); }
    finally { await db.query('UPDATE public.homework SET trainer_id=$1 WHERE id=$2', [trainer, id]); }
  }
  await db.query('DELETE FROM public.homework WHERE id=$1', [result.id]);
  const before = await counts();
  assert.equal((await assign(input)).reason, 'homework_not_found');
  assert.deepEqual(await counts(), before);
});

test('v2 reuses canonical snapshots, rejects unavailable versions, and replays archived snapshots', async () => {
  const catalogItem = { ...item, exercise_snapshot: { source: 'database', exercise_id: exercise,
    content_version: 1, name: 'Forged', media_url: 'https://forged.invalid' } };
  const input = request({ items: [catalogItem] });
  const result = await assign(input);
  const saved = (await db.query('SELECT exercise_snapshot FROM public.homework_items WHERE homework_id=$1', [result.id])).rows[0].exercise_snapshot;
  assert.equal(saved.name, 'Reviewed bridge');
  assert.equal(saved.media_url, null);
  const before = await counts();
  for (const invalid of [{ source: 'bogus' }, { ...catalogItem.exercise_snapshot, content_version: 99 }]) {
    await assert.rejects(assign(request({ items: [item, { ...item, order_index: 2, exercise_snapshot: invalid }] })), /Invalid exercise snapshot|no longer available/);
    assert.deepEqual(await counts(), before);
  }
  await db.query("UPDATE public.exercise_catalog SET status='archived' WHERE id=$1", [exercise]);
  try {
    assert.deepEqual(await assign(input), { ...result, replayed: true });
    await assert.rejects(assign(request({ items: [catalogItem] })), /no longer available/);
    assert.deepEqual(await counts(), before);
  } finally { await db.query("UPDATE public.exercise_catalog SET status='published' WHERE id=$1", [exercise]); }
});

test('item constraint and metadata write failures roll back all writes and allow retry', async () => {
  const before = await counts();
  const input = request({ items: [item, { ...item, order_index: 2, reps: 0 }] });
  await assert.rejects(assign(input), /homework_items_effort_shape/);
  assert.deepEqual(await counts(), before);
  await db.exec(`CREATE FUNCTION public.fail_assignment_metadata() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'injected metadata failure'; END $$;
    CREATE TRIGGER fail_assignment BEFORE UPDATE OF requirement ON public.homework_items
    FOR EACH ROW EXECUTE FUNCTION public.fail_assignment_metadata();`);
  const retry = request();
  try {
    await assert.rejects(assign(retry), /injected metadata failure/);
    assert.deepEqual(await counts(), before);
  } finally { await db.exec('DROP TRIGGER fail_assignment ON public.homework_items; DROP FUNCTION public.fail_assignment_metadata()'); }
  assert.equal((await assign(retry)).success, true);
});

test('table checks protect direct metadata writes and internal ledger has default-deny RLS', async () => {
  for (const sql of ["UPDATE public.homework SET assignment_purpose='invalid'", 'UPDATE public.homework SET burden_budget_seconds=0',
    "UPDATE public.homework_items SET requirement='invalid'", 'UPDATE public.homework_items SET requirement=NULL']) {
    await assert.rejects(db.exec(sql), /check constraint|not-null constraint/);
  }
  const proc = (await db.query('SELECT prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure', [signature])).rows[0];
  assert.equal(proc.prosecdef, true);
  assert.ok(proc.proconfig.includes('search_path=""'));
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.homework_assignment_requests'::regclass")).rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated', 'unprivileged']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      assert.equal((await db.query("SELECT has_table_privilege($1,'public.homework_assignment_requests',$2) AS allowed", [role, privilege])).rows[0].allowed, false);
    }
    assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', [role, signature])).rows[0].allowed, role === 'authenticated');
    await asRole(role, trainer, () => assert.rejects(db.query('SELECT * FROM public.homework_assignment_requests'), /permission denied/));
  }
  await asRole('anon', null, async () => {
    await assert.rejects(create(request()), /permission denied/);
    for (const table of ['homework', 'homework_items']) {
      await assert.rejects(db.query(`SELECT * FROM public.${table}`), /permission denied/);
    }
  });
  // Defense in depth: even an accidental later table grant does not expose rows.
  await db.exec('GRANT SELECT ON public.homework_assignment_requests TO authenticated');
  try { await asRole('authenticated', trainer, async () => assert.equal((await db.query('SELECT * FROM public.homework_assignment_requests')).rows.length, 0)); }
  finally { await db.exec('REVOKE SELECT ON public.homework_assignment_requests FROM authenticated'); }
});

test('additive rollback disables v2 while retaining data and working legacy creation', async () => {
  const before = await counts();
  await db.exec(`REVOKE EXECUTE ON FUNCTION ${signature} FROM authenticated`);
  try {
    await assert.rejects(assign(request()), /permission denied/);
    assert.equal((await legacy()).success, true);
    const after = await counts();
    assert.equal(after.requests, before.requests);
    assert.equal(after.homework, before.homework + 1);
  } finally { await db.exec(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`); }
});
