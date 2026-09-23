import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

let db;
const trainer = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const exercise = '00000000-0000-4000-8000-000000000010';
before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.actor', true), '')::uuid $$;`);
  for (const file of ['20260415000000_exercise_homework_init.sql', '20260416000000_voice_coach_cadence.sql',
    '20260417000000_atomic_homework_submission.sql', '20260919000000_discomfort_level_feedback.sql',
    '20260919010000_immutable_homework_submission.sql', '20260920000000_trainer_ownership_and_atomic_homework.sql',
    '20260921010000_exercise_catalog.sql', '20260921075052_exercise_catalog_snapshots.sql']) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [trainer]);
  await db.query("INSERT INTO public.members(id,trainer_id,name,phone) VALUES($1,$2,'Synthetic','')", [member, trainer]);
  await db.query(`INSERT INTO public.exercise_catalog(id,name,default_cue,source_note,reviewed_by,reviewed_at,status)
    VALUES($1,'Reviewed bridge','Original cue','Synthetic reviewed source','QA reviewer',now(),'published')`, [exercise]);
  await db.exec("INSERT INTO public.exercise_catalog(name) VALUES('Draft exercise')");
});
after(async () => { await db?.close(); });

async function create(items) {
  await db.query("SELECT set_config('test.actor',$1,false)", [trainer]);
  await db.exec('SET ROLE authenticated');
  try {
    const { rows } = await db.query('SELECT public.create_homework($1,$2,$3,now()+interval \'1 day\',$4::jsonb) AS result',
      [member, 'Practice', `test_token_${crypto.randomUUID().replaceAll('-', '')}`, JSON.stringify(items)]);
    return rows[0].result;
  } finally { await db.exec('RESET ROLE'); }
}
const item = { name: 'Trainer edited bridge', cue: 'Trainer edited cue', order_index: 1, target_sets: 2, target_reps: '10회', effort_kind: 'reps', reps: 10,
  exercise_snapshot: { source: 'database', exercise_id: exercise, content_version: 1, name: 'Forged name', media_url: 'https://forged.invalid' } };

test('publication requires explicit content review and trainers can only read published content', async () => {
  await assert.rejects(db.exec("INSERT INTO public.exercise_catalog(name,status) VALUES('Unreviewed','published')"), /requires source/);
  await db.exec('SET ROLE authenticated');
  try {
    const { rows } = await db.query('SELECT name FROM public.exercise_catalog');
    assert.equal(rows.length, 1);
    await assert.rejects(db.exec("INSERT INTO public.exercise_catalog(name) VALUES('Forbidden')"), /permission denied/);
    await assert.rejects(db.exec("SELECT public.capture_exercise_snapshot('{}')"), /permission denied/);
  } finally { await db.exec('RESET ROLE'); }
  await db.exec('SET ROLE anon');
  try { await assert.rejects(db.query('SELECT * FROM public.exercise_catalog'), /permission denied/); }
  finally { await db.exec('RESET ROLE'); }
});

test('homework captures canonical version metadata, while preserving trainer prescription', async () => {
  const result = await create([item]);
  assert.equal(result.success, true);
  const { rows: [saved] } = await db.query('SELECT * FROM public.homework_items WHERE homework_id=$1', [result.id]);
  assert.equal(saved.name, 'Trainer edited bridge');
  assert.equal(saved.exercise_snapshot.name, 'Reviewed bridge');
  assert.equal(saved.exercise_snapshot.default_cue, 'Original cue');
  assert.equal(saved.exercise_snapshot.media_url, null);
  await assert.rejects(db.query("UPDATE public.exercise_catalog SET default_cue='Changed' WHERE id=$1", [exercise]), /new exercise content version/);
  const { rows: [unchanged] } = await db.query('SELECT exercise_snapshot FROM public.homework_items WHERE homework_id=$1', [result.id]);
  assert.deepEqual(unchanged.exercise_snapshot, saved.exercise_snapshot);
});

test('invalid catalog version rolls back whole homework and legacy items still work', async () => {
  const { rows: [beforeCount] } = await db.query('SELECT count(*)::int AS count FROM public.homework');
  await assert.rejects(create([{ ...item, exercise_snapshot: { ...item.exercise_snapshot, content_version: 99 } }]), /no longer available/);
  const { rows: [afterCount] } = await db.query('SELECT count(*)::int AS count FROM public.homework');
  assert.equal(afterCount.count, beforeCount.count);
  assert.equal((await create([{ ...item, exercise_snapshot: null }])).success, true);
});

test('archiving content cannot rewrite past homework and stops new selections', async () => {
  const result = await create([item]);
  await db.query("UPDATE public.exercise_catalog SET status='archived' WHERE id=$1", [exercise]);
  await assert.rejects(create([item]), /no longer available/);
  const { rows: [saved] } = await db.query('SELECT exercise_snapshot FROM public.homework_items WHERE homework_id=$1', [result.id]);
  assert.equal(saved.exercise_snapshot.name, 'Reviewed bridge');
});

test('additive deployment rollback restores old create function without deleting saved snapshots', async () => {
  const { rows: before } = await db.query('SELECT id,exercise_snapshot FROM public.homework_items ORDER BY id');
  const oldSql = readFileSync(new URL('../supabase/migrations/20260920000000_trainer_ownership_and_atomic_homework.sql', import.meta.url), 'utf8');
  await db.exec(oldSql.slice(oldSql.indexOf('CREATE OR REPLACE FUNCTION public.create_homework(')));
  assert.equal((await create([{ ...item, exercise_snapshot: null }])).success, true);
  const { rows: after } = await db.query('SELECT id,exercise_snapshot FROM public.homework_items WHERE id=ANY($1::uuid[]) ORDER BY id', [before.map((row) => row.id)]);
  assert.deepEqual(after, before);
  const newSql = readFileSync(new URL('../supabase/migrations/20260921075052_exercise_catalog_snapshots.sql', import.meta.url), 'utf8');
  await db.exec(newSql.slice(newSql.indexOf('CREATE OR REPLACE FUNCTION public.create_homework(')));
});
