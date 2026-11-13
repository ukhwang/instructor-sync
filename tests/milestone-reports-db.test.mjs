import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

let db;
const trainer = '00000000-0000-4000-8000-000000000201';
const otherTrainer = '00000000-0000-4000-8000-000000000202';
const member = '00000000-0000-4000-8000-000000000203';
const otherMember = '00000000-0000-4000-8000-000000000204';
const migration = '20261114010000_milestone_reports.sql';

async function asRole(role, actor, work) {
  await db.query("SELECT set_config('test.actor',$1,false)", [actor ?? '']);
  await db.exec(`SET ROLE ${role}`);
  try { return await work(); } finally { await db.exec('RESET ROLE'); }
}
const call = (role, actor, sql, params) =>
  asRole(role, actor, async () => (await db.query(sql, params)).rows[0].result);
const hex24 = () => crypto.randomUUID().replaceAll('-', '').slice(0, 24);

async function createHomeworkFor(memberId, actor) {
  const token = `synthetic_${crypto.randomUUID().replaceAll('-', '')}`;
  const created = await call('authenticated', actor, 'SELECT public.create_homework($1,$2,$3,$4,$5::jsonb) AS result', [
    memberId, 'Practice', token, new Date(Date.now() + 86400000).toISOString(),
    JSON.stringify([{ order_index: 1, name: 'Bridge', cue: '', target_sets: 2, target_reps: '10회', reps: 10 }]),
  ]);
  assert.equal(created.success, true);
  const items = (await db.query('SELECT id FROM public.homework_items WHERE homework_id=$1', [created.id])).rows;
  return { id: created.id, token, itemIds: items.map((row) => row.id) };
}

async function submit(hw, discomfort, note) {
  return call('anon', null, 'SELECT public.submit_homework_feedback_v2($1,$2::uuid[],$3,$4,$5) AS result', [
    hw.token, hw.itemIds, discomfort, note, crypto.randomUUID(),
  ]);
}

before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto, btree_gist } });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT NULLIF(current_setting('test.actor',true),'')::uuid $$;`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const file of readdirSync(directory).filter((f) => f.endsWith('.sql') && f <= migration).sort()) {
    await db.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [trainer, otherTrainer]);
  await db.query(`INSERT INTO public.profiles(id,name) VALUES($1,'Synthetic Studio') ON CONFLICT (id) DO UPDATE SET name=excluded.name`, [trainer]);
  await db.query(`INSERT INTO public.members(id,trainer_id,name,phone,package_total,package_remaining,end_state)
    VALUES($1,$2,'Synthetic A','010-0000-0000',10,0,'private goal'),($3,$4,'Synthetic B','',10,10,'')`,
  [member, trainer, otherMember, otherTrainer]);
});
after(async () => { await db?.close(); });

test('리포트는 실제 제출 기록만 돌려주고 연락처·목표는 노출하지 않는다', async () => {
  const hw1 = await createHomeworkFor(member, trainer);
  const hw2 = await createHomeworkFor(member, trainer);
  await createHomeworkFor(member, trainer); // 미제출 숙제
  assert.equal((await submit(hw1, 7, '기분: 아픔 | 부위: 허리 | 통증: 7/10 | 세트: 2/2')).success, true);
  assert.equal((await submit(hw2, 3, '기분: 좋음 | 부위: 허리 | 통증: 3/10 | 세트: 2/2')).success, true);

  const token = hex24();
  const created = await call('authenticated', trainer, 'SELECT public.create_milestone_report($1,$2) AS result', [member, token]);
  assert.equal(created.success, true);
  assert.equal(created.session_number, 10);

  const opened = await call('anon', null, 'SELECT public.open_milestone_report($1) AS result', [token]);
  assert.equal(opened.success, true);
  assert.equal(opened.member_name, 'Synthetic A');
  assert.equal(opened.studio_name, 'Synthetic Studio');
  assert.equal(opened.homeworks.length, 3);
  assert.equal(opened.submissions.length, 2);
  assert.deepEqual(opened.submissions.map((s) => s.discomfort_level), [7, 3]);
  const serialized = JSON.stringify(opened);
  assert.ok(!serialized.includes('010-0000-0000'), '연락처 미노출');
  assert.ok(!serialized.includes('private goal'), '목표 미노출');
});

test('다른 강사의 회원으로는 리포트를 만들 수 없다', async () => {
  const foreign = await call('authenticated', trainer, 'SELECT public.create_milestone_report($1,$2) AS result', [otherMember, hex24()]);
  assert.deepEqual(foreign, { success: false, reason: 'member_not_found' });
  const anon = await call('anon', null, 'SELECT public.open_milestone_report($1) AS result', ['not-a-token']);
  assert.deepEqual(anon, { success: false, reason: 'not_found' });
  await assert.rejects(asRole('anon', null, () =>
    db.query('SELECT public.create_milestone_report($1,$2)', [member, hex24()])));
});

test('회수·만료된 리포트는 열리지 않는다', async () => {
  const token = hex24();
  await call('authenticated', trainer, 'SELECT public.create_milestone_report($1,$2) AS result', [member, token]);
  const intruder = await call('authenticated', otherTrainer, 'SELECT public.revoke_milestone_report($1) AS result', [token]);
  assert.deepEqual(intruder, { success: false, reason: 'not_found' });
  assert.deepEqual(await call('authenticated', trainer, 'SELECT public.revoke_milestone_report($1) AS result', [token]), { success: true });
  assert.deepEqual(await call('anon', null, 'SELECT public.open_milestone_report($1) AS result', [token]),
    { success: false, reason: 'revoked' });

  const expiring = hex24();
  await call('authenticated', trainer, 'SELECT public.create_milestone_report($1,$2) AS result', [member, expiring]);
  await db.query(`UPDATE public.milestone_reports SET created_at = now() - interval '31 days',
    expires_at = now() - interval '1 day' WHERE token=$1`, [expiring]);
  assert.deepEqual(await call('anon', null, 'SELECT public.open_milestone_report($1) AS result', [expiring]),
    { success: false, reason: 'expired' });
});

test('리포트 테이블은 직접 쓰거나 익명으로 읽을 수 없다', async () => {
  await assert.rejects(asRole('authenticated', trainer, () => db.query(
    `INSERT INTO public.milestone_reports(trainer_id,member_id,token,session_number,expires_at)
     VALUES($1,$2,$3,1,now()+interval '1 day')`, [trainer, member, hex24()])));
  await assert.rejects(asRole('anon', null, () => db.query('SELECT * FROM public.milestone_reports')));
});
