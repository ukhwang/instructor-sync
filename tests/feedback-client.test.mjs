import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

/*
 * Ported from the Supabase-RPC client tests. The browser no longer talks to a
 * database: member registration goes through one Server Action and member
 * feedback through the server submit path (lib/db-server.ts → D1 repository).
 * The removed in-memory "demo mode" submission store is replaced by real-SQL
 * tests in tests/d1-homework.test.mjs (immutability, atomicity, token states).
 */

function serverDb(submitHomeworkByToken) {
  return loadModule('lib/db-server.ts', {
    'server-only': {},
    '@/lib/server/auth/session': { requireTrainer: async () => ({ trainerId: 'trainer' }) },
    '@/lib/server/env': { getServerEnv: async () => ({ DB: {}, BETTER_AUTH_SECRET: 'x'.repeat(32) }) },
    '@/lib/server/db/repositories/members': {},
    '@/lib/server/db/repositories/homeworks': {},
    '@/lib/server/db/repositories/public-homework': { submitHomeworkByToken, openHomeworkByToken: async () => ({ success: false }) },
    '@/lib/server/db/sql': { isUuid: () => true },
  });
}

function clientDb(registerMemberAction) {
  return loadModule('lib/db.ts', { '@/app/actions/data': { registerMemberAction } });
}

test('server submit makes exactly one call with normalized item selection and the stable request id', async () => {
  const calls = [];
  const db = serverDb(async (...args) => {
    calls.push(args);
    return { success: true, result: 'partial', log_id: 'log' };
  });
  assert.deepEqual(await db.submitHomeworkFeedbackV2Server({
    token: 'token',
    completedItemIds: ['item-b', 'item-a', 'item-b'],
    discomfortLevel: 6,
    note: 'difficult',
    requestId: '10000000-0000-4000-8000-000000000111',
  }), { ok: true, result: 'partial' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], {
    token: 'token',
    completedItemIds: ['item-a', 'item-b'],
    discomfortLevel: 6,
    note: 'difficult',
    requestId: '10000000-0000-4000-8000-000000000111',
  });
});

test('server submit preserves a rejection and never falls back to a success', async () => {
  const db = serverDb(async () => ({ success: false, reason: 'expired' }));
  assert.deepEqual(await db.submitHomeworkFeedbackV2Server({
    token: 'token', completedItemIds: [], discomfortLevel: 5, note: null, requestId: '10000000-0000-4000-8000-000000000112',
  }), { ok: false, reason: 'expired' });
});

for (const [name, submit] of [
  ['database exception', async () => { throw new Error('D1_ERROR: offline'); }],
  ['empty response', async () => ({ success: false })],
]) {
  test(`${name} never produces a production success`, async () => {
    const db = serverDb(submit);
    const outcome = await db.submitHomeworkFeedbackV2Server({
      token: 'token', completedItemIds: [], discomfortLevel: 5, note: null, requestId: '10000000-0000-4000-8000-000000000113',
    });
    assert.equal(outcome.ok, false);
  });
}

test('new member client uses one idempotent action and passes the request unchanged', async () => {
  const calls = [];
  const member = {
    id: 'member', trainer_id: 'trainer', name: 'New member', phone: '010-0000-0000',
    package_total: 20, package_remaining: 20, package_expires_on: null,
    end_state: 'Goal', created_at: '2026-09-20', updated_at: '2026-09-20',
  };
  const db = clientDb(async (...args) => {
    calls.push(args);
    return { ok: true, data: member };
  });
  const input = {
    request_id: '10000000-0000-4000-8000-000000000100',
    member_kind: 'new',
    name: 'New member',
    phone: '010-0000-0000',
    package_total: 20,
    end_state: 'Goal',
  };
  assert.equal((await db.createMember(input)).package_remaining, 20);
  assert.deepEqual(calls, [[input]]);
});

test('existing member client sends optional source material in the same action', async () => {
  let submitted;
  const db = clientDb(async (payload) => {
    submitted = payload;
    return { ok: true, data: { id: 'member' } };
  });
  await db.createMember({
    request_id: '10000000-0000-4000-8000-000000000101',
    member_kind: 'existing',
    name: 'Existing member',
    phone: '010-0000-0001',
    package_total: 20,
    package_remaining: 7,
    end_state: 'Goal',
    import_record: { source_type: 'existing_note', raw_text: '  original record  ', summary: 'summary', recorded_from: '2026-08-01', recorded_to: '2026-09-01' },
  });
  assert.equal(submitted.package_remaining, 7);
  assert.equal(submitted.import_record.raw_text, '  original record  ');
  assert.equal(submitted.import_record.summary, 'summary');
});

for (const [name, action, pattern] of [
  ['network exception', async () => { throw new Error('offline'); }, /인터넷 연결/],
  ['server rejection', async () => ({ ok: false, code: 'free_plan_member_limit', message: 'Free 플랜은 최대 5명까지만' }), /Free 플랜/],
  ['database failure', async () => ({ ok: false, code: 'DB_UNAVAILABLE', message: '' }), /회원 등록에 실패/],
]) {
  test(`member registration ${name} never produces a success`, async () => {
    await assert.rejects(clientDb(action).createMember({ request_id: 'r', member_kind: 'new' }), pattern);
  });
}
