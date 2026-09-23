// Run explicitly: node --test contracts/legacy-p0.mjs
// These assertions describe the DESIRED invariant. Expected legacy failures
// stay red; they are not inverted into "pass because vulnerable" checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { loadModule } from '../tests/load-module.mjs';

let sql;
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const member = '00000000-0000-4000-8000-000000000003';
const homework = '00000000-0000-4000-8000-000000000004';
before(async () => {
  sql = await PGlite.create();
  await sql.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('test.actor', true), '')::uuid $$;`);
  for (const name of ['20260415000000_exercise_homework_init.sql', '20260416000000_voice_coach_cadence.sql', '20260417000000_atomic_homework_submission.sql']) {
    await sql.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  }
  await sql.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [A, B]);
  await sql.query("INSERT INTO public.members(id,trainer_id,name,phone) VALUES($1,$2,'Synthetic B','')", [member, B]);
  await sql.query(`INSERT INTO public.homework(id,trainer_id,member_id,token,token_expires_at,why,status)
    VALUES($1,$2,$3,'synthetic-active',now()+interval '1 day','Synthetic','sent')`, [homework, B, member]);
  // Supabase's managed default grants are not supplied by PGlite. Explicitly
  // emulate authenticated table grants so these tests exercise the actual RLS,
  // not the unrelated absence of table access. This is not production evidence.
  await sql.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;');
});
beforeEach(async () => { await sql.exec('BEGIN'); });
afterEach(async () => { await sql.exec('ROLLBACK; RESET ROLE'); });
after(async () => { await sql?.close(); });

test('LEGACY-OWN-parent: forged parent must fail; risk: cross-trainer graph', async () => {
  await sql.query("SELECT set_config('test.actor',$1,true)", [A]);
  await sql.exec('SET LOCAL ROLE authenticated');
  await assert.rejects(sql.query(`INSERT INTO public.homework(trainer_id,member_id,token,token_expires_at,why)
    VALUES($1,$2,'synthetic-forged',now()+interval '1 day','Synthetic')`, [A, member]));
});
test('LEGACY-PRIV: self Pro update must fail; risk: privilege escalation', async () => {
  await sql.query("SELECT set_config('test.actor',$1,true)", [A]);
  await sql.exec('SET LOCAL ROLE authenticated');
  await sql.query('UPDATE public.profiles SET is_pro=true WHERE id=$1', [A]);
  assert.equal((await sql.query('SELECT is_pro FROM public.profiles WHERE id=$1', [A])).rows[0].is_pro, false);
});
test('LEGACY-IDEM: same submission key must yield one bundle; risk: duplicate records', async () => {
  const body = { requestId: '00000000-0000-4000-8000-000000000005', performedAt: '2026-09-12T00:00:00Z' };
  const api = loadModule('lib/db.ts', {
    '@/lib/supabase/client': { createClient: () => ({ rpc: async (_name, args) => ({ data: (await sql.query('SELECT public.submit_homework_feedback($1,$2,$3,$4,$5) result', [args.p_token, args.p_kind, args.p_has_pain, args.p_note, args.p_pain_area])).rows[0].result, error: null }) }) },
    './demo': { ...loadModule('lib/demo.ts'), isDemoMode: () => false },
  });
  await api.submitHomeworkFeedbackRpc('synthetic-active', 'complete', { has_pain: false, ...body });
  await api.submitHomeworkFeedbackRpc('synthetic-active', 'complete', { has_pain: false, ...body });
  assert.equal((await sql.query("SELECT count(*)::int count FROM public.homework_logs WHERE kind='complete'")).rows[0].count, 1);
});
test('LEGACY-INPUT-name: blank member name must fail; risk: unidentifiable member', async () => {
  await assert.rejects(sql.query("UPDATE public.members SET name='  ' WHERE id=$1", [member]));
});
test('LEGACY-INPUT-remaining: negative remaining must fail; risk: invalid renewal state', async () => {
  await assert.rejects(sql.query('UPDATE public.members SET package_remaining=-1 WHERE id=$1', [member]));
});
test('LEGACY-INPUT-order: duplicate order must fail; risk: ambiguous homework order', async () => {
  await sql.query("INSERT INTO public.homework_items(homework_id,order_index,name,reps) VALUES($1,1,'Synthetic',10)", [homework]);
  await assert.rejects(sql.query("INSERT INTO public.homework_items(homework_id,order_index,name,reps) VALUES($1,1,'Synthetic',10)", [homework]));
});
test('LEGACY-ATOMIC: failed item insert must remove body; risk: partial assignment', async () => {
  let bodies = 0;
  const failure = new Error('injected item failure');
  const api = loadModule('lib/db.ts', {
    '@/lib/supabase/client': { createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: A } } }) },
      from: table => ({ insert: () => {
        if (table === 'homework_items') return Promise.resolve({ error: failure });
        bodies++;
        return { select: () => ({ single: async () => ({ data: { id: homework }, error: null }) }) };
      } }),
    }) },
    './demo': { ...loadModule('lib/demo.ts'), isDemoMode: () => false },
  });
  await assert.rejects(api.createHomework({ member_id: member, why: 'Synthetic', token: 'synthetic', token_expires_at: '2026-09-15', items: [{ name: 'Synthetic', order_index: 1, target_sets: 1, target_reps: '10', reps: 10 }] }), /injected item failure/);
  assert.equal(bodies, 0);
});
test('LEGACY-OUTAGE: database outage must reject, not empty list; risk: hidden failure', async () => {
  const api = loadModule('lib/db.ts', {
    '@/lib/supabase/client': { createClient: () => { throw new Error('injected database unavailable'); } },
    './demo': { ...loadModule('lib/demo.ts'), isDemoMode: () => false },
  });
  await assert.rejects(api.getMembers(), /unavailable/);
});
