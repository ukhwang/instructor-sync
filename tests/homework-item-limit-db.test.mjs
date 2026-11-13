import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const trainer = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const limitMigration = '20261115000000_raise_homework_item_limit.sql';
let db;
let beforeGrants;

async function asTrainer(work) {
  await db.query("SELECT set_config('test.actor',$1,false)", [trainer]);
  await db.exec('SET ROLE authenticated');
  try { return await work(); } finally { await db.exec('RESET ROLE'); }
}
const mk = (order_index, requirement = 'required') => ({
  order_index, name: `Move ${order_index}`, cue: '', target_sets: 2, target_reps: '10회', reps: 10, requirement,
});
const items = (n, requirement = 'required') => Array.from({ length: n }, (_, i) => mk(i + 1, requirement));
const create = (list) => asTrainer(async () => (await db.query(
  `SELECT public.create_homework_v2($1,$2,'Practice',$3,$4,$5::jsonb,NULL,NULL,NULL) AS r`,
  [crypto.randomUUID(), member, `synthetic_${crypto.randomUUID().replaceAll('-', '')}`,
    new Date(Date.now() + 86400000).toISOString(), JSON.stringify(list)])).rows[0].r);
const grants = async () => (await db.query(`SELECT p.proname, p.proacl::text AS acl, p.prosecdef, p.proconfig::text AS config
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('create_homework','create_homework_v2') ORDER BY p.proname`)).rows;

before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE unprivileged;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT NULLIF(current_setting('test.actor',true),'')::uuid $$;`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const files = readdirSync(directory).filter((f) => f.endsWith('.sql') && f <= '20260922100000_homework_public_item_requirements.sql').sort();
  for (const file of files) await db.exec(readFileSync(new URL(file, directory), 'utf8'));
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [trainer]);
  await db.query(`INSERT INTO public.members(id,trainer_id,name,phone) VALUES($1,$2,'Synthetic','')`, [member, trainer]);
});
after(async () => { await db?.close(); });

test('상한 변경 전: 4개째는 거부된다 (회귀 기준선)', async () => {
  assert.equal((await create(items(3))).success, true);
  assert.deepEqual(await create(items(4)), { success: false, reason: 'invalid_items' });
  beforeGrants = await grants();
});

test('마이그레이션 후: 20개까지 저장되고 순서·필수/선택이 보존된다', async () => {
  await db.exec(readFileSync(new URL(`../supabase/migrations/${limitMigration}`, import.meta.url), 'utf8'));
  const list = [...items(6), ...items(14).map((it) => ({ ...it, order_index: it.order_index + 6, requirement: 'optional' }))];
  const result = await create(list);
  assert.equal(result.success, true);
  const rows = (await db.query('SELECT order_index, requirement FROM public.homework_items WHERE homework_id=$1 ORDER BY order_index', [result.id])).rows;
  assert.equal(rows.length, 20);
  assert.deepEqual(rows.map((r) => r.order_index), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(rows.filter((r) => r.requirement === 'required').length, 6);
});

test('필수 3개 + 선택 많이 (필수 개수는 자유)', async () => {
  const list = [...items(3), ...items(8).map((it) => ({ ...it, order_index: it.order_index + 3, requirement: 'optional' }))];
  assert.equal((await create(list)).success, true);
});

test('21개, order_index 0/21, 필수 0개는 여전히 거부된다', async () => {
  assert.deepEqual(await create(items(21)), { success: false, reason: 'invalid_items' });
  assert.deepEqual(await create([mk(21)]), { success: false, reason: 'invalid_items' });
  assert.deepEqual(await create([mk(0)]), { success: false, reason: 'invalid_items' });
  assert.deepEqual(await create(items(5, 'optional')), { success: false, reason: 'invalid_items' });
});

test('테이블 CHECK 도 20 까지만 허용 (직접 쓰기 경로 방어)', async () => {
  const hw = (await create(items(1))).id;
  await assert.rejects(db.query(`INSERT INTO public.homework_items(homework_id,order_index,name,target_sets,target_reps)
    VALUES($1,21,'x',1,'1회')`, [hw]));
});

test('함수 권한·SECURITY DEFINER·search_path 가 바뀌지 않는다', async () => {
  assert.deepEqual(await grants(), beforeGrants);
  await db.exec('SET ROLE anon');
  await assert.rejects(db.query(`SELECT public.create_homework_v2(gen_random_uuid(),gen_random_uuid(),'x','tok',now(),'[]'::jsonb,NULL,NULL,NULL)`));
  await db.exec('RESET ROLE');
});
