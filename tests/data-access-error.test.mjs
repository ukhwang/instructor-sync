import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { DataAccessError, asDataAccessError } = loadModule('lib/data-access-error.ts');

test('data access errors expose a retryable user message without backend details', () => {
  const error = asDataAccessError('members.list', { message: 'secret database detail' });
  assert.equal(error instanceof DataAccessError, true);
  assert.equal(error.code, 'data_unavailable');
  assert.equal(error.operation, 'members.list');
  assert.equal(error.message.includes('secret database detail'), false);
});

function loadDb(actions) {
  return loadModule('lib/db.ts', { '@/app/actions/data': actions });
}

test('member list database failure is not converted to an empty list', async () => {
  for (const listMembersAction of [
    async () => ({ ok: false, code: 'DB_UNAVAILABLE', message: 'denied' }),
    async () => { throw new Error('network'); },
  ]) {
    const db = loadDb({ listMembersAction });
    await assert.rejects(db.getMembers(), (error) => error?.code === 'data_unavailable');
  }
});

test('single member distinguishes a missing row from a database failure', async () => {
  const missing = loadDb({ getMemberAction: async () => ({ ok: true, data: null }) });
  assert.equal(await missing.getMemberById('missing'), null);

  const unavailable = loadDb({ getMemberAction: async () => ({ ok: false, code: 'DB_UNAVAILABLE', message: '' }) });
  await assert.rejects(unavailable.getMemberById('member'), (error) => error?.code === 'data_unavailable');
});

test('public homework read reports service unavailability instead of a false not-found', async () => {
  const db = loadModule('lib/db-server.ts', {
    'server-only': {},
    '@/lib/server/auth/session': {},
    '@/lib/server/env': { getServerEnv: async () => ({ DB: {} }) },
    '@/lib/server/db/repositories/members': {},
    '@/lib/server/db/repositories/homeworks': {},
    '@/lib/server/db/repositories/public-homework': { openHomeworkByToken: async () => { throw new Error('D1_ERROR: offline'); } },
    '@/lib/server/db/sql': { isUuid: () => true },
  });
  assert.deepEqual(await db.openHomeworkRpc('opaque-token-opaque-token'), { success: false, reason: 'unavailable' });
  // Exact public demo tokens never touch the database.
  assert.equal((await db.openHomeworkRpc('demo-token')).success, true);
});
