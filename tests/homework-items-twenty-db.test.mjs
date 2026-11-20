import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

// 숙제 동작 상한 3 → 20 (20261120120000_homework_items_twenty.sql).
// 전체 마이그레이션을 순서대로 적용해 운영과 같은 최종 정의를 검사한다.
let db;
const trainer = '00000000-0000-4000-8000-000000000011';
const member = '00000000-0000-4000-8000-000000000012';
const item = { name: 'Bridge', cue: '', target_sets: 2, target_reps: '10회', reps: 10 };

async function asRole(role, actor, work) {
  await db.query("SELECT set_config('test.actor',$1,false)", [actor ?? '']);
  await db.exec(`SET ROLE ${role}`);
  try { return await work(); } finally { await db.exec('RESET ROLE'); }
}
function request(items) {
  return {
    requestId: crypto.randomUUID(), memberId: member, why: 'Practice',
    token: `synthetic_${crypto.randomUUID().replaceAll('-', '')}`,
    expires: new Date(Date.now() + 86400000).toISOString(), items,
  };
}
function items(count) {
  return Array.from({ length: count }, (_, index) => ({ ...item, order_index: index + 1 }));
}
async function createV2(input) {
  const { rows } = await db.query(`SELECT public.create_homework_v2(
    $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) AS result`,
  [input.requestId, input.memberId, input.why, input.token, input.expires,
    JSON.stringify(input.items), null, null, null]);
  return rows[0].result;
}
async function createLegacy(input) {
  const { rows } = await db.query(
    'SELECT public.create_homework($1,$2,$3,$4,$5::jsonb) AS result',
    [member, input.why, input.token, input.expires, JSON.stringify(input.items)],
  );
  return rows[0].result;
}
const assign = (count, actor = trainer) =>
  asRole('authenticated', actor, () => createV2(request(items(count))));
const legacy = (count) =>
  asRole('authenticated', trainer, () => createLegacy(request(items(count))));

before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto, btree_gist } });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE unprivileged;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT NULLIF(current_setting('test.actor',true),'')::uuid $$;`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const file of readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [trainer]);
  await db.query("INSERT INTO public.members(id,trainer_id,name,phone) VALUES($1,$2,'Synthetic A','')", [member, trainer]);
});
after(async () => { await db?.close(); });

test('the homework_items order_index check now allows 1..20', async () => {
  const { rows } = await db.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.homework_items'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%order_index%'`);
  assert.deepEqual(rows.map((row) => row.definition), ['CHECK (((order_index >= 1) AND (order_index <= 20)))']);
});

test('create_homework_v2 accepts 4..20 items and blocks 21', async () => {
  for (const count of [4, 5, 12, 19, 20]) {
    const result = await assign(count);
    assert.equal(result.success, true, `${count}개는 저장되어야 한다`);
    const saved = (await db.query(
      'SELECT count(*)::int AS total, max(order_index)::int AS last FROM public.homework_items WHERE homework_id=$1',
      [result.id],
    )).rows[0];
    assert.deepEqual(saved, { total: count, last: count });
  }
  const before = (await db.query('SELECT count(*)::int AS total FROM public.homework')).rows[0].total;
  assert.deepEqual(await assign(21), { success: false, reason: 'invalid_items' });
  assert.deepEqual(await assign(0), { success: false, reason: 'invalid_items' });
  assert.equal((await db.query('SELECT count(*)::int AS total FROM public.homework')).rows[0].total, before);
});

test('legacy create_homework accepts 20 items and blocks 21', async () => {
  const ok = await legacy(20);
  assert.equal(ok.success, true);
  assert.equal((await db.query(
    'SELECT count(*)::int AS total FROM public.homework_items WHERE homework_id=$1', [ok.id],
  )).rows[0].total, 20);
  assert.deepEqual(await legacy(21), { success: false, reason: 'invalid_items' });
});

test('order_index above 20 is rejected even inside a valid item list', async () => {
  await asRole('authenticated', trainer, async () => {
    const input = request([{ ...item, order_index: 21 }]);
    assert.deepEqual(await createV2(input), { success: false, reason: 'invalid_items' });
    const legacyInput = request([{ ...item, order_index: 21 }]);
    assert.deepEqual(await createLegacy(legacyInput), { success: false, reason: 'invalid_items' });
  });
});

test('the check constraint still blocks a direct order_index beyond 20', async () => {
  const created = await assign(1);
  await assert.rejects(
    () => db.query(`INSERT INTO public.homework_items(homework_id, order_index, name, target_sets, target_reps)
      VALUES($1, 21, 'Bridge', 1, '10회')`, [created.id]),
    /check constraint|order_index/i,
  );
});
