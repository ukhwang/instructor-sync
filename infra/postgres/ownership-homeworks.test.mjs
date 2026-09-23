import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPool } from './database.mjs';
import { createMemberRepository } from '../../lib/server/repositories/members.mjs';
import { createHomeworkRepository } from '../../lib/server/repositories/homeworks.mjs';
import { createHomeworkService } from '../../lib/server/services/homeworks.mjs';
import { createTrainerMutationHandler } from '../../lib/server/http/trainer-mutation.mjs';

const ids = {
  A: '00000000-0000-4000-8000-000000000001', B: '00000000-0000-4000-8000-000000000002',
  memberA: '00000000-0000-4000-8000-000000000101', memberB: '00000000-0000-4000-8000-000000000102',
  homeworkA: '00000000-0000-4000-8000-000000000301', homeworkB: '00000000-0000-4000-8000-000000000302',
  itemA: '00000000-0000-4000-8000-000000000401', itemB: '00000000-0000-4000-8000-000000000402',
  tokenB: '00000000-0000-4000-8000-000000000502', submissionA: '00000000-0000-4000-8000-000000000601',
  noteA: '00000000-0000-4000-8000-000000000701',
};
const selected = process.env.HW_PG_DATABASE === 'homework_dev' && process.env.HW_PG_PORT === '55432';
const actorA = Object.freeze({ trainerId: ids.A });
const actorB = Object.freeze({ trainerId: ids.B });
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);

test('P0 OWN-homeworks: bidirectional ownership graph and mutation boundary', {
  skip: selected ? false : 'local homework_dev PostgreSQL target not selected',
}, async t => {
  const pool = createPool();
  const client = await pool.connect();
  await client.query('begin');
  t.after(async () => {
    await client.query('rollback').catch(() => {});
    client.release();
    await pool.end();
  });

  const submissionB = randomUUID();
  const noteB = randomUUID();
  const performedAt = '2026-09-13T01:00:00.000Z';
  await client.query(`insert into app.submissions(id,homework_id,token_id,kind,performed_at,observation_id,version,created_at)
    values($1,$2,$3,'complete',$4,$1,1,$4)`, [submissionB, ids.homeworkB, ids.tokenB, performedAt]);
  await client.query(`insert into app.feedback(submission_id,homework_id,has_pain,note)
    values($1,$2,false,'Synthetic B feedback')`, [submissionB, ids.homeworkB]);
  await client.query(`insert into app.session_notes(id,trainer_id,member_id,note)
    values($1,$2,$3,'Synthetic B note')`, [noteB, ids.B, ids.memberB]);
  await client.query('set local role homework_app');
  assert.equal((await client.query('select current_user')).rows[0].current_user, 'homework_app');

  const memberRepository = createMemberRepository(client);
  const homeworks = createHomeworkService(createHomeworkRepository(client), memberRepository);
  const before = JSON.stringify((await client.query(`select
    (select count(*) from app.homeworks) homeworks,
    (select count(*) from app.homework_exercises) items,
    (select count(*) from app.submissions) submissions,
    (select count(*) from app.feedback) feedback,
    (select count(*) from app.session_notes) notes`)).rows[0]);

  for (const [actor, foreignHomework] of [[actorA, ids.homeworkB], [actorB, ids.homeworkA]]) {
    await rejects(homeworks.get(actor, foreignHomework), 'NOT_FOUND');
    await rejects(homeworks.update(actor, foreignHomework, { why: 'Synthetic forged update' }), 'NOT_FOUND');
    await rejects(homeworks.remove(actor, foreignHomework), 'NOT_FOUND');
  }
  await rejects(homeworks.remove(actorA, ids.homeworkA), 'FORBIDDEN');
  await rejects(homeworks.remove(actorB, ids.homeworkB), 'FORBIDDEN');
  await rejects(homeworks.assertCanCreate(actorA, ids.memberB), 'NOT_FOUND');
  await rejects(homeworks.assertCanCreate(actorB, ids.memberA), 'NOT_FOUND');

  for (const [actor, item, submission, note] of [
    [actorA, ids.itemB, submissionB, noteB],
    [actorB, ids.itemA, ids.submissionA, ids.noteA],
  ]) {
    await rejects(homeworks.getExercise(actor, item), 'NOT_FOUND');
    await rejects(homeworks.updateExercise(actor, item, 'Synthetic forged item'), 'NOT_FOUND');
    await rejects(homeworks.getSubmission(actor, submission), 'NOT_FOUND');
    await rejects(homeworks.getFeedback(actor, submission), 'NOT_FOUND');
    await rejects(homeworks.getSessionNote(actor, note), 'NOT_FOUND');
    await rejects(homeworks.updateSessionNote(actor, note, 'Synthetic forged note'), 'NOT_FOUND');
  }
  assert.equal((await homeworks.get(actorA, ids.homeworkA)).id, ids.homeworkA);
  assert.equal((await homeworks.get(actorB, ids.homeworkB)).id, ids.homeworkB);
  assert.deepEqual((await client.query(`select
    has_table_privilege('homework_app','app.homeworks','DELETE') homework_delete,
    has_table_privilege('homework_app','app.submissions','UPDATE') submission_update,
    has_table_privilege('homework_app','app.feedback','UPDATE') feedback_update`)).rows[0], {
    homework_delete: false, submission_update: false, feedback_update: false,
  });
  assert.equal(JSON.stringify((await client.query(`select
    (select count(*) from app.homeworks) homeworks,
    (select count(*) from app.homework_exercises) items,
    (select count(*) from app.submissions) submissions,
    (select count(*) from app.feedback) feedback,
    (select count(*) from app.session_notes) notes`)).rows[0]), before);

  const request = new Request('http://localhost/api/homeworks/synthetic', { method: 'PATCH' });
  const noSession = createTrainerMutationHandler({ getTrainerAccess: async () => null, mutate: async () => assert.fail('must not mutate') });
  const inactive = createTrainerMutationHandler({ getTrainerAccess: async () => ({ trainerId: ids.A, active: false }), mutate: async () => assert.fail('must not mutate') });
  const missing = createTrainerMutationHandler({ getTrainerAccess: async () => ({ trainerId: ids.A, active: true }), mutate: context => homeworks.get(context, randomUUID()) });
  const outage = createTrainerMutationHandler({ getTrainerAccess: async () => ({ trainerId: ids.A, active: true }), mutate: async () => { throw new Error('synthetic database outage'); } });
  for (const [handler, status, code] of [[noSession, 401, 'AUTH_REQUIRED'], [inactive, 403, 'FORBIDDEN'], [missing, 404, 'NOT_FOUND'], [outage, 503, 'DB_UNAVAILABLE']]) {
    const response = await handler(request);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { code });
  }
});
