import assert from 'node:assert/strict';
import { createPool } from '../infra/postgres/database.mjs';
import { createMemberRepository } from '../lib/server/repositories/members.mjs';
import { createHomeworkRepository } from '../lib/server/repositories/homeworks.mjs';
import { createMemberService } from '../lib/server/services/members.mjs';
import { createHomeworkService } from '../lib/server/services/homeworks.mjs';

const trainerA = '00000000-0000-4000-8000-000000000001';
const trainerB = '00000000-0000-4000-8000-000000000002';
const memberB = '00000000-0000-4000-8000-000000000102';
const homeworkB = '00000000-0000-4000-8000-000000000302';
const databaseSelected = process.env.HW_PG_DATABASE === 'homework_dev' && process.env.HW_PG_PORT === '55432';

export const supports = id => databaseSelected && ['OWN-members', 'OWN-homeworks'].includes(id);

export async function createFixture(_layer, id) {
  assert.equal(supports(id), true, `unsupported P0 fixture: ${id}`);
  const pool = createPool();
  const client = await pool.connect();
  await client.query('begin');
  await client.query('set local role homework_app');
  assert.equal((await client.query('select current_user')).rows[0].current_user, 'homework_app');

  const memberRepository = createMemberRepository(client);
  const members = createMemberService(memberRepository);
  const homeworks = createHomeworkService(createHomeworkRepository(client), memberRepository);
  let closed = false;
  return {
    A: Object.freeze({ trainerId: trainerA }),
    B: Object.freeze({ trainerId: trainerB }),
    ids: { B: { members: memberB, homeworks: homeworkB } },
    async read(actor, resource, resourceId) {
      if (resource === 'members') return members.get(actor, resourceId);
      if (resource === 'homeworks') return homeworks.get(actor, resourceId);
      assert.fail(`unsupported resource: ${resource}`);
    },
    async update(actor, resource, resourceId, patch) {
      if (resource === 'members') return members.update(actor, resourceId, patch);
      if (resource === 'homeworks') return homeworks.update(actor, resourceId, patch);
      assert.fail(`unsupported resource: ${resource}`);
    },
    validPatch(resource) {
      if (resource === 'members') return { name: 'Synthetic changed name' };
      if (resource === 'homeworks') return { why: 'Synthetic changed reason' };
      assert.fail(`unsupported resource: ${resource}`);
    },
    async snapshot() {
      const membersSnapshot = await client.query(`select id, trainer_id, name, phone, package_total, remaining,
        expires_on, end_state, version, created_at, updated_at from app.members order by id`);
      const homeworksSnapshot = await client.query(`select id, trainer_id, member_id, why, status, version,
        created_at, updated_at from app.homeworks order by id`);
      return JSON.parse(JSON.stringify({ members: membersSnapshot.rows, homeworks: homeworksSnapshot.rows }));
    },
    async close() {
      if (closed) return;
      closed = true;
      await client.query('rollback').catch(() => {});
      client.release();
      await pool.end();
    },
  };
}
