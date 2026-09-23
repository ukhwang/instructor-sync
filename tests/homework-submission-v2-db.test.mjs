import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

let db;
const trainer = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const outsider = '00000000-0000-4000-8000-000000000003';
const otherMember = '00000000-0000-4000-8000-000000000004';
const signature = 'public.submit_homework_feedback_v2(text,uuid[],integer,text,uuid)';
const migration = '20260921173014_homework_submission_v2.sql';
const projectionMigration = '20260922100000_homework_public_item_requirements.sql';
let hw, items, otherHw, otherItems, legacyDefinitions, legacySnapshot;
async function role(name, actor, work) {
  await db.query("SELECT set_config('test.actor',$1,false)", [actor ?? '']);
  await db.exec(`SET ROLE ${name}`);
  try { return await work(); } finally { await db.exec('RESET ROLE'); }
}
async function fixture(token, owner = trainer, ownerMember = member) {
  const id = (await db.query(`INSERT INTO public.homework(trainer_id,member_id,token,token_expires_at,why,status)
    VALUES($1,$2,$3,now()+interval '1 day','Synthetic why','sent') RETURNING id`, [owner, ownerMember, token])).rows[0].id;
  const rows = (await db.query(`INSERT INTO public.homework_items(homework_id,order_index,name,reps,requirement)
    VALUES($1,1,'Required one',10,'required'),($1,2,'Required two',10,'required'),($1,3,'Optional',10,'optional') RETURNING id`, [id])).rows;
  return [id, rows.map(row => row.id)];
}
async function submit({ ids = [], level = 1, note = null, request = crypto.randomUUID(), token = 'active' } = {}) {
  return (await db.query('SELECT public.submit_homework_feedback_v2($1,$2::uuid[],$3::integer,$4,$5::uuid) AS result',
    [token, ids, level, note, request])).rows[0].result;
}
const anonSubmit = (input) => role('anon', null, () => submit(input));
const v1 = (token = 'active') => db.query("SELECT public.submit_homework_feedback($1,'complete',1::integer,null) AS result", [token]);
async function state() {
  const result = {};
  for (const table of ['homework', 'homework_submissions', 'homework_item_results', 'homework_logs', 'homework_submission_requests']) {
    result[table] = (await db.query(`SELECT * FROM public.${table} ORDER BY to_jsonb(${table})::text`)).rows;
  }
  return result;
}
async function definitions() {
  return (await db.query(`SELECT oid::regprocedure::text AS signature,pg_get_functiondef(oid) AS definition
    FROM pg_proc WHERE proname IN ('open_homework','submit_homework_feedback') ORDER BY oid`)).rows;
}
before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE unprivileged;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT NULLIF(current_setting('test.actor',true),'')::uuid $$;`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const file of readdirSync(directory).filter(file => file.endsWith('.sql') && file < migration).sort()) {
    await db.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [trainer, outsider]);
  await db.query("INSERT INTO public.members(id,trainer_id,name,phone) VALUES($1,$2,'Synthetic A',''),($3,$4,'Synthetic B','')", [member, trainer, otherMember, outsider]);
  await fixture('legacy');
  await role('anon', null, () => v1('legacy'));
  legacySnapshot = (await db.query('SELECT snapshot,snapshot_hash FROM public.homework_submissions')).rows;
  legacyDefinitions = await definitions();
  await db.exec(readFileSync(new URL(migration, directory), 'utf8'));
  // Supabase's existing application-table read grants are environment defaults;
  // model them explicitly in PGlite so RLS can be exercised for trainer reads.
  await db.exec('GRANT SELECT ON public.homework TO authenticated');
  assert.deepEqual((await db.query('SELECT snapshot,snapshot_hash FROM public.homework_submissions')).rows, legacySnapshot);
});

beforeEach(async () => {
  await db.exec('TRUNCATE public.homework CASCADE');
  [hw, items] = await fixture('active');
  [otherHw, otherItems] = await fixture('other', outsider, otherMember);
});
after(async () => { await db?.close(); });

test('v1 functions and version/hash contract remain unchanged after additive migration', async () => {
  assert.deepEqual(await definitions(), legacyDefinitions);
  assert.equal((await role('anon', null, () => v1())).rows[0].result.success, true);
  const [stored] = (await db.query(`SELECT snapshot,snapshot_hash,
    encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex') AS recomputed FROM public.homework_submissions`)).rows;
  assert.equal(stored.snapshot.version, 1);
  assert.equal(stored.snapshot.result, 'complete');
  assert.equal(stored.snapshot_hash, stored.recomputed);
  assert.equal('requirement' in stored.snapshot.exercises[0], false);
  assert.deepEqual(await anonSubmit({ ids: items }), { success: false, reason: 'already_submitted' });
});

test('public homework projection includes item requirement without private fields', async () => {
  await db.exec(readFileSync(new URL(projectionMigration, new URL('../supabase/migrations/', import.meta.url)), 'utf8'));
  const result = (await db.query("SELECT public.open_homework('active') AS result")).rows[0].result;
  assert.equal(result.success, true);
  assert.equal(result.items[0].requirement, 'required');
  assert.equal(result.items[2].requirement, 'optional');
  assert.equal(result.member.name, 'Synthetic A');
  assert.equal(result.homework.token, undefined);
});

for (const [label, indices, expected] of [
  ['none', [], 'cant'], ['optional only', [2], 'partial'], ['one required', [0], 'partial'],
  ['required and optional but missing required', [0,2], 'partial'],
  ['all required but no optional', [0,1], 'complete'], ['all', [0,1,2], 'complete'],
]) test(`${label} computes ${expected} with immutable per-item evidence and hash`, async () => {
  const result = await anonSubmit({ ids: indices.map(index => items[index]), level: 10, note: '  member note  ' });
  assert.equal(result.success, true);
  assert.equal(result.result, expected);
  const rows = (await db.query(`SELECT *,encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex') AS recomputed
    FROM public.homework_submissions WHERE homework_id=$1`, [hw])).rows;
  const stored = rows[0];
  assert.equal(stored.snapshot_hash, stored.recomputed);
  assert.equal(result.snapshot_hash, stored.snapshot_hash);
  assert.equal(stored.snapshot.version, 2);
  assert.equal(stored.snapshot.note, 'member note');
  assert.equal(stored.snapshot.discomfort_level, 10);
  assert.equal(stored.snapshot.result, expected);
  assert.deepEqual(stored.snapshot.exercises.map(item => item.completed), [0,1,2].map(index => indices.includes(index)));
  assert.deepEqual(stored.snapshot.exercises.map(item => item.requirement), ['required','required','optional']);
  assert.equal((await db.query('SELECT * FROM public.homework_item_results WHERE homework_id=$1', [hw])).rows.length, 3);
  assert.deepEqual((await db.query('SELECT kind FROM public.homework_logs WHERE homework_id=$1 ORDER BY kind', [hw])).rows.map(r => r.kind).sort(), [expected,'pain'].sort());
  assert.equal((await db.query('SELECT status FROM public.homework WHERE id=$1', [otherHw])).rows[0].status, 'sent');
  assert.equal(JSON.stringify(result).includes('trainer'), false);
  await db.query("UPDATE public.homework_items SET name='Later edit',requirement='optional' WHERE id=$1", [items[0]]);
  assert.deepEqual((await db.query('SELECT snapshot FROM public.homework_submissions WHERE homework_id=$1', [hw])).rows[0].snapshot, stored.snapshot);
  assert.equal((await role('anon', null, () => v1())).rows[0].result.reason, 'already_submitted');
});

test('replay normalizes item order and whitespace and returns the exact original response', async () => {
  const request = crypto.randomUUID();
  const first = await anonSubmit({ ids: [items[1],items[0]], note: ' note ', request });
  const previous = await state();
  assert.deepEqual(await anonSubmit({ ids: [items[0],items[1]], note: 'note', request }), first);
  assert.deepEqual(await state(), previous);
  for (const input of [{ ids: [items[0]] }, { level: 2 }, { note: 'other' }]) {
    assert.deepEqual(await anonSubmit({ ids: [items[0],items[1]], note: 'note', request, ...input }), { success: false, reason: 'request_payload_conflict' });
  }
  assert.deepEqual(await state(), previous);
  const ledger = JSON.stringify(previous.homework_submission_requests);
  assert.equal(ledger.includes('active'), false);
  assert.equal(ledger.includes('token'), false);
});

test('request IDs are scoped per homework; queued retries yield one immutable result', async () => {
  const request = crypto.randomUUID();
  await db.exec('SET ROLE anon');
  let results;
  try { results = await Promise.all(Array.from({ length: 4 }, () => submit({ ids: [items[0]], request }))); }
  finally { await db.exec('RESET ROLE'); }
  results.forEach(result => assert.deepEqual(result, results[0]));
  assert.equal((await db.query('SELECT * FROM public.homework_submissions')).rows.length, 1);
  assert.equal((await db.query('SELECT * FROM public.homework_logs')).rows.length, 2);
  assert.equal((await anonSubmit({ token: 'other', ids: [], request })).success, true);
  // PGlite serializes its single connection; a real multi-session lock race is
  // a separate staging check, not a claim made by this queued retry test.
});

for (const [label, setup, token, reason] of [
  ['unknown', '', 'unknown', 'not_found'], ['null', '', null, 'not_found'],
  ['expired', "UPDATE public.homework SET token_expires_at=now()-interval '1 second' WHERE token='active'", 'active', 'expired'],
  ['revoked timestamp', "UPDATE public.homework SET revoked_at=now() WHERE token='active'", 'active', 'revoked'],
  ['revoked status', "UPDATE public.homework SET status='revoked' WHERE token='active'", 'active', 'revoked'],
]) test(`${label} token is denied before fresh write and replay`, async () => {
  const request = crypto.randomUUID();
  if (setup) {
    assert.equal((await anonSubmit({ request })).success, true);
    await db.exec(setup);
  }
  const previous = await state();
  assert.deepEqual(await anonSubmit({ token, request }), { success: false, reason });
  assert.deepEqual(await anonSubmit({ token }), { success: false, reason });
  assert.deepEqual(await state(), previous);
});

test('invalid selections, range and request IDs leave all state untouched', async () => {
  const previous = await state();
  for (const [input, reason] of [
    [{ ids: [otherItems[0]] }, 'invalid_completed_item_ids'],
    [{ ids: [crypto.randomUUID()] }, 'invalid_completed_item_ids'],
    [{ ids: [items[0],items[0]] }, 'invalid_completed_item_ids'],
    [{ ids: [null] }, 'invalid_completed_item_ids'], [{ ids: null }, 'invalid_completed_item_ids'],
    [{ request: null }, 'invalid_request_id'], ...[null,0,11].map(level => [{ level }, 'invalid_discomfort_level']),
  ]) assert.deepEqual(await anonSubmit(input), { success: false, reason });
  await role('anon', null, async () => {
    const multidimensional = (await db.query(`SELECT public.submit_homework_feedback_v2(
      'active', ARRAY[ARRAY[$1::uuid],ARRAY[$2::uuid]], 1, null, $3::uuid) AS result`,
    [items[0], items[1], crypto.randomUUID()])).rows[0].result;
    assert.deepEqual(multidimensional, { success: false, reason: 'invalid_completed_item_ids' });
  });
  assert.deepEqual(await state(), previous);
  await db.query("UPDATE public.homework_items SET requirement='optional' WHERE homework_id=$1", [hw]);
  assert.deepEqual(await anonSubmit(), { success: false, reason: 'invalid_homework_items' });
});

test('least privilege, cross-owner reads and immutable feedback tables', async () => {
  const settings = (await db.query('SELECT prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure', [signature])).rows[0];
  assert.equal(settings.prosecdef, true);
  assert.ok(settings.proconfig.includes('search_path=""'));
  const result = await role('authenticated', outsider, () => submit({ ids: [items[0]] }));
  assert.equal(result.success, true); // Valid token is the only public capability.
  for (const roleName of ['anon', 'authenticated', 'unprivileged']) {
    const allowed = (await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', [roleName, signature])).rows[0].allowed;
    assert.equal(allowed, roleName !== 'unprivileged');
  }
  for (const table of ['homework_item_results','homework_submission_requests','homework_submissions','homework','homework_items','homework_logs']) {
    await role('anon', null, () => assert.rejects(db.query(`SELECT * FROM public.${table}`), /permission denied/));
  }
  for (const table of ['homework_item_results','homework_submissions']) {
    for (const privilege of ['INSERT','UPDATE','DELETE']) {
      assert.equal((await db.query('SELECT has_table_privilege(\'authenticated\',$1,$2) AS allowed', [`public.${table}`, privilege])).rows[0].allowed, false);
    }
    await role('authenticated', outsider, async () => assert.deepEqual((await db.query(`SELECT * FROM public.${table}`)).rows, []));
    await role('authenticated', trainer, async () => {
      assert.ok((await db.query(`SELECT * FROM public.${table}`)).rows.length);
      await assert.rejects(db.query(`DELETE FROM public.${table}`), /permission denied/);
    });
  }
  await role('authenticated', trainer, () => assert.rejects(db.query('SELECT * FROM public.homework_submission_requests'), /permission denied/));
  await assert.rejects(db.query('UPDATE public.homework_item_results SET homework_item_id=$1 WHERE homework_item_id=$2', [otherItems[0], items[0]]), /foreign key/);
  await assert.rejects(db.query('UPDATE public.homework_item_results SET homework_id=$1 WHERE homework_id=$2', [otherHw, hw]), /foreign key/);
});

for (const table of ['homework_submissions','homework_item_results','homework_logs','homework','homework_submission_requests']) {
  test(`failure in ${table} rolls back snapshot, items, logs, status and replay ledger`, async () => {
    const previous = await state();
    await db.exec(`CREATE OR REPLACE FUNCTION public.fail_v2_test() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
      CREATE TRIGGER fail_v2 BEFORE ${table === 'homework' ? 'UPDATE' : 'INSERT'} ON public.${table}
      FOR EACH ROW EXECUTE FUNCTION public.fail_v2_test();`);
    try { await assert.rejects(anonSubmit({ ids: items }), /injected failure/); }
    finally { await db.exec(`DROP TRIGGER fail_v2 ON public.${table}`); }
    assert.deepEqual(await state(), previous);
  });
}

for (const [table, condition] of [
  ['homework_logs', "NEW.kind = 'pain'"],
  ['homework_item_results', "NEW.requirement = 'optional'"],
]) test(`late ${table} failure undoes preceding inserts and allows the same-key retry`, async () => {
  const previous = await state();
  const request = crypto.randomUUID();
  await db.exec(`CREATE OR REPLACE FUNCTION public.fail_v2_late_test() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'late injected failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_v2_late BEFORE INSERT ON public.${table}
    FOR EACH ROW EXECUTE FUNCTION public.fail_v2_late_test();`);
  try { await assert.rejects(anonSubmit({ ids: items, request }), /late injected failure/); }
  finally { await db.exec(`DROP TRIGGER fail_v2_late ON public.${table}`); }
  assert.deepEqual(await state(), previous);
  assert.equal((await anonSubmit({ ids: items, request })).success, true);
});

test('operational rollback revokes v2 while retaining evidence and v1 availability', async () => {
  await anonSubmit({ ids: [items[0]] });
  const previous = await state();
  await db.exec(`REVOKE EXECUTE ON FUNCTION ${signature} FROM anon,authenticated`);
  try {
    await assert.rejects(anonSubmit(), /permission denied/);
    assert.deepEqual(await state(), previous);
    assert.equal((await role('anon', null, () => v1('other'))).rows[0].result.success, true);
  } finally { await db.exec(`GRANT EXECUTE ON FUNCTION ${signature} TO anon,authenticated`); }
});
