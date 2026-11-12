import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

let db;
const trainer = '00000000-0000-4000-8000-000000000101';
const otherTrainer = '00000000-0000-4000-8000-000000000102';
const member = '00000000-0000-4000-8000-000000000103';
const otherMember = '00000000-0000-4000-8000-000000000104';
const secondMember = '00000000-0000-4000-8000-000000000105';
const migration = '20261114000000_lessons_scheduler.sql';

async function asRole(role, actor, work) {
  await db.query("SELECT set_config('test.actor',$1,false)", [actor ?? '']);
  await db.exec(`SET ROLE ${role}`);
  try { return await work(); } finally { await db.exec('RESET ROLE'); }
}
const rpc = (actor, sql, params) =>
  asRole('authenticated', actor, async () => (await db.query(sql, params)).rows[0].result);

const createLessons = (actor, { series = crypto.randomUUID(), memberId = member, startsAt, duration = 50, repeat = 0 }) =>
  rpc(actor, 'SELECT public.create_lessons($1,$2,$3,$4,$5) AS result', [series, memberId, startsAt, duration, repeat]);
const complete = (actor, id) => rpc(actor, 'SELECT public.complete_lesson($1) AS result', [id]);
const revert = (actor, id) => rpc(actor, 'SELECT public.revert_lesson_completion($1) AS result', [id]);
const setStatus = (actor, id, status) => rpc(actor, 'SELECT public.set_lesson_status($1,$2) AS result', [id, status]);
const reschedule = (actor, id, startsAt, duration = 50) =>
  rpc(actor, 'SELECT public.reschedule_lesson($1,$2,$3) AS result', [id, startsAt, duration]);
const remaining = async (id = member) =>
  (await db.query('SELECT package_remaining FROM public.members WHERE id=$1', [id])).rows[0].package_remaining;
const lessonCount = async () => (await db.query('SELECT count(*)::int AS n FROM public.lessons')).rows[0].n;

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
  await db.query(`INSERT INTO public.members(id,trainer_id,name,phone,package_total,package_remaining)
    VALUES($1,$2,'Synthetic A','',10,10),($3,$4,'Synthetic B','',10,10),($5,$2,'Synthetic C','',10,10)`,
  [member, trainer, otherMember, otherTrainer, secondMember]);
});
after(async () => { await db?.close(); });

test('반복 예약은 원자적으로 생성되고 같은 series 재전송은 멱등이다', async () => {
  const series = crypto.randomUUID();
  const first = await createLessons(trainer, { series, startsAt: '2026-11-16T10:00:00+09:00', repeat: 3 });
  assert.equal(first.success, true);
  assert.equal(first.lessons.length, 4);
  const replay = await createLessons(trainer, { series, startsAt: '2026-11-16T10:00:00+09:00', repeat: 3 });
  assert.equal(replay.success, true);
  assert.equal(replay.lessons.length, 4);
  assert.equal(await lessonCount(), 4);
});

test('같은 강사의 겹치는 시간은 거부되고 반복 예약 전체가 롤백된다', async () => {
  const before = await lessonCount();
  const overlap = await createLessons(trainer, {
    memberId: secondMember, startsAt: '2026-11-09T10:30:00+09:00', repeat: 2,
  });
  assert.deepEqual(overlap, { success: false, reason: 'time_conflict' });
  assert.equal(await lessonCount(), before, '앞선 주차(겹치지 않는 11/9)도 함께 롤백되어야 한다');

  const adjacent = await createLessons(trainer, { memberId: secondMember, startsAt: '2026-11-16T10:50:00+09:00' });
  assert.equal(adjacent.success, true, '끝나는 시각에 바로 시작하는 수업은 허용');
});

test('다른 강사의 회원으로는 예약할 수 없고, 다른 강사는 서로의 수업을 보지 못한다', async () => {
  const foreign = await createLessons(trainer, { memberId: otherMember, startsAt: '2026-11-20T10:00:00+09:00' });
  assert.deepEqual(foreign, { success: false, reason: 'member_not_found' });

  const otherBooking = await createLessons(otherTrainer, { memberId: otherMember, startsAt: '2026-11-16T10:00:00+09:00' });
  assert.equal(otherBooking.success, true, '겹침 금지는 강사별로만 적용된다');

  const visible = await asRole('authenticated', otherTrainer, async () =>
    (await db.query('SELECT count(*)::int AS n FROM public.lessons')).rows[0].n);
  assert.equal(visible, 1);
});

test('테이블 직접 쓰기는 막혀 있다', async () => {
  await assert.rejects(asRole('authenticated', trainer, () => db.query(
    `INSERT INTO public.lessons(trainer_id,member_id,series_id,starts_at,ends_at)
     VALUES($1,$2,gen_random_uuid(),'2026-12-01T10:00:00+09:00','2026-12-01T11:00:00+09:00')`, [trainer, member])));
  await assert.rejects(asRole('anon', null, () => db.query('SELECT * FROM public.lessons')));
});

test('수업 완료는 패키지를 정확히 1회만 차감하고 되돌리기는 1회만 복원한다', async () => {
  const created = await createLessons(trainer, { memberId: secondMember, startsAt: '2026-11-18T19:00:00+09:00' });
  const id = created.lessons[0].id;
  assert.equal(await remaining(secondMember), 10);

  const done = await complete(trainer, id);
  assert.equal(done.success, true);
  assert.equal(done.package_remaining, 9);
  const replay = await complete(trainer, id);
  assert.equal(replay.replayed, true);
  assert.equal(await remaining(secondMember), 9, '재시도는 이중 차감하지 않는다');

  const intruder = await complete(otherTrainer, id);
  assert.deepEqual(intruder, { success: false, reason: 'lesson_not_found' });

  const blocked = await setStatus(trainer, id, 'cancelled');
  assert.deepEqual(blocked, { success: false, reason: 'invalid_status' });

  const undone = await revert(trainer, id);
  assert.equal(undone.success, true);
  assert.equal(undone.package_remaining, 10);
  const undoReplay = await revert(trainer, id);
  assert.equal(undoReplay.replayed, true);
  assert.equal(await remaining(secondMember), 10);
});

test('취소된 수업 자리는 다시 예약할 수 있고, 취소 복원은 충돌 시 거부된다', async () => {
  const a = await createLessons(trainer, { memberId: member, startsAt: '2026-11-19T09:00:00+09:00' });
  const cancelled = await setStatus(trainer, a.lessons[0].id, 'cancelled');
  assert.equal(cancelled.success, true);
  const b = await createLessons(trainer, { memberId: secondMember, startsAt: '2026-11-19T09:00:00+09:00' });
  assert.equal(b.success, true);
  const restore = await setStatus(trainer, a.lessons[0].id, 'scheduled');
  assert.deepEqual(restore, { success: false, reason: 'time_conflict' });
});

test('시간 변경은 겹침과 상태를 검사한다', async () => {
  const a = await createLessons(trainer, { memberId: member, startsAt: '2026-11-21T09:00:00+09:00' });
  const b = await createLessons(trainer, { memberId: secondMember, startsAt: '2026-11-21T11:00:00+09:00' });
  const conflict = await reschedule(trainer, a.lessons[0].id, '2026-11-21T10:30:00+09:00');
  assert.deepEqual(conflict, { success: false, reason: 'time_conflict' });
  const moved = await reschedule(trainer, a.lessons[0].id, '2026-11-21T13:00:00+09:00', 60);
  assert.equal(moved.success, true);
  assert.equal(new Date(moved.lesson.ends_at).toISOString(), '2026-11-21T05:00:00.000Z');
  await setStatus(trainer, b.lessons[0].id, 'no_show');
  const notScheduled = await reschedule(trainer, b.lessons[0].id, '2026-11-21T15:00:00+09:00');
  assert.deepEqual(notScheduled, { success: false, reason: 'invalid_status' });
});

test('입력 범위 검사', async () => {
  assert.deepEqual(await createLessons(trainer, { startsAt: '2026-11-22T09:00:00+09:00', duration: 5 }),
    { success: false, reason: 'invalid_input' });
  assert.deepEqual(await createLessons(trainer, { startsAt: '2026-11-22T09:00:00+09:00', repeat: 13 }),
    { success: false, reason: 'invalid_input' });
  assert.deepEqual(await createLessons(null, { startsAt: '2026-11-22T09:00:00+09:00' }),
    { success: false, reason: 'unauthorized' });
});

test('숙제는 같은 강사·같은 회원의 수업에만 연결된다', async () => {
  const lesson = (await createLessons(trainer, { memberId: member, startsAt: '2026-11-23T09:00:00+09:00' })).lessons[0];
  const token = `synthetic_${crypto.randomUUID().replaceAll('-', '')}`;
  const hw = await rpc(trainer, 'SELECT public.create_homework($1,$2,$3,$4,$5::jsonb) AS result', [
    member, 'Practice', token, new Date(Date.now() + 86400000).toISOString(),
    JSON.stringify([{ order_index: 1, name: 'Bridge', cue: '', target_sets: 2, target_reps: '10회', reps: 10 }]),
  ]);
  assert.equal(hw.success, true);

  const intruder = await rpc(otherTrainer, 'SELECT public.link_homework_to_lesson($1,$2) AS result', [hw.id, lesson.id]);
  assert.deepEqual(intruder, { success: false, reason: 'not_found' });

  const otherLesson = (await createLessons(trainer, { memberId: secondMember, startsAt: '2026-11-23T11:00:00+09:00' })).lessons[0];
  const mismatched = await rpc(trainer, 'SELECT public.link_homework_to_lesson($1,$2) AS result', [hw.id, otherLesson.id]);
  assert.deepEqual(mismatched, { success: false, reason: 'not_found' });

  const linked = await rpc(trainer, 'SELECT public.link_homework_to_lesson($1,$2) AS result', [hw.id, lesson.id]);
  assert.deepEqual(linked, { success: true });
  const stored = (await db.query('SELECT lesson_id FROM public.homework WHERE id=$1', [hw.id])).rows[0].lesson_id;
  assert.equal(stored, lesson.id);
});
