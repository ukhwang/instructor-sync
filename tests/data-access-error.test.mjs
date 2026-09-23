import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { DataAccessError, asDataAccessError, isNotFoundDatabaseError } = loadModule('lib/data-access-error.ts');

test('data access errors expose a retryable user message without backend details', () => {
  const error = asDataAccessError('members.list', { message: 'secret database detail' });
  assert.equal(error instanceof DataAccessError, true);
  assert.equal(error.code, 'data_unavailable');
  assert.equal(error.operation, 'members.list');
  assert.equal(error.message.includes('secret database detail'), false);
});

test('only PostgREST no-row errors are treated as not found', () => {
  assert.equal(isNotFoundDatabaseError({ code: 'PGRST116' }), true);
  assert.equal(isNotFoundDatabaseError({ code: '42501' }), false);
  assert.equal(isNotFoundDatabaseError(new Error('offline')), false);
});

function loadDb(client) {
  return loadModule('lib/db.ts', {
    '@/lib/supabase/client': { createClient: () => client },
    './demo': { isDemoMode: () => false, withCoachFields: (item) => item },
    './template': { generateOpeningLine: () => '' },
  });
}

test('member list database failure is not converted to an empty list', async () => {
  const db = loadDb({
    from: () => ({
      select: () => ({ order: async () => ({ data: null, error: { code: '42501', message: 'denied' } }) }),
    }),
  });
  await assert.rejects(db.getMembers(), (error) => error?.code === 'data_unavailable');
});

test('single member distinguishes a missing row from a database failure', async () => {
  const missing = loadDb({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { code: 'PGRST116' } }) }) }),
    }),
  });
  assert.equal(await missing.getMemberById('missing'), null);

  const unavailable = loadDb({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { code: '42501' } }) }) }),
    }),
  });
  await assert.rejects(unavailable.getMemberById('member'), (error) => error?.code === 'data_unavailable');
});

test('public homework RPC reports service unavailability instead of a false not-found', async () => {
  const db = loadDb({ rpc: async () => ({ data: null, error: { message: 'offline' } }) });
  assert.deepEqual(await db.openHomeworkRpc('opaque-token'), { success: false, reason: 'unavailable' });
});
