import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const demoToken = 'sample-token-demo-open-2026';
const demoModule = loadModule('lib/demo.ts');
function client(demo, rpc = async () => { throw new Error('offline'); }, mocks = {}) {
  return loadModule('lib/db.ts', {
    '@/lib/supabase/client': { createClient: () => ({ rpc }) },
    './demo': { ...demoModule, isDemoMode: () => demo },
    ...mocks,
  });
}

test('client makes exactly one RPC with completion and discomfort parameters', async () => {
  const calls = [];
  const response = { success: true, log_id: 'complete-id', pain_log_id: 'pain-id' };
  const db = client(false, async (...args) => {
    calls.push(args);
    return { data: response, error: null };
  });
  assert.deepEqual(await db.submitHomeworkFeedbackRpc('token', 'cant', {
    discomfort_level: 8, note: '  note  ',
  }), response);
  assert.deepEqual(calls, [['submit_homework_feedback', {
    p_token: 'token', p_kind: 'cant', p_discomfort_level: 8, p_note: 'note',
  }]]);
});

test('client sends explicit nulls for omitted optional RPC arguments', async () => {
  const db = client(false, async (name, args) => {
    assert.equal(name, 'submit_homework_feedback');
    assert.equal(args.p_note, null);
    assert.equal(args.p_discomfort_level, 1);
    return { data: { success: true }, error: null };
  });
  assert.equal((await db.submitHomeworkFeedbackRpc('token', 'complete', { discomfort_level: 1 })).success, true);
});

test('v2 client sends normalized item selection and stable request id', async () => {
  const calls = [];
  const db = client(false, async (...args) => {
    calls.push(args);
    return { data: { success: true, result: 'partial', log_id: 'log' }, error: null };
  });
  const result = await db.submitHomeworkFeedbackV2Rpc(
    'token',
    ['item-b', 'item-a', 'item-b'],
    { discomfort_level: 6, note: '  difficult  ' },
    '10000000-0000-4000-8000-000000000111',
  );
  assert.equal(result.result, 'partial');
  assert.deepEqual(calls, [['submit_homework_feedback_v2', {
    p_token: 'token',
    p_completed_item_ids: ['item-a', 'item-b'],
    p_discomfort_level: 6,
    p_note: 'difficult',
    p_request_id: '10000000-0000-4000-8000-000000000111',
  }]]);
});

test('v2 client preserves RPC rejection and never falls back to a success', async () => {
  const db = client(false, async () => ({ data: null, error: { message: 'expired' } }));
  assert.deepEqual(await db.submitHomeworkFeedbackV2Rpc(
    'token', [], { discomfort_level: 5 }, '10000000-0000-4000-8000-000000000112',
  ), { success: false, reason: 'expired' });
});

test('new member client uses one idempotent RPC and does not send a manual remaining count', async () => {
  const calls = [];
  const member = {
    id: 'member', trainer_id: 'trainer', name: 'New member', phone: '010-0000-0000',
    package_total: 20, package_remaining: 20, package_expires_on: null,
    end_state: 'Goal', created_at: '2026-09-20', updated_at: '2026-09-20',
  };
  const db = client(false, async (...args) => {
    calls.push(args);
    return { data: { success: true, member }, error: null };
  });
  assert.equal((await db.createMember({
    request_id: '10000000-0000-4000-8000-000000000100',
    member_kind: 'new',
    name: 'New member',
    phone: '010-0000-0000',
    package_total: 20,
    end_state: 'Goal',
  })).package_remaining, 20);
  assert.deepEqual(calls, [['register_member_with_import', {
    p_request_id: '10000000-0000-4000-8000-000000000100',
    p_member_kind: 'new',
    p_name: 'New member',
    p_phone: '010-0000-0000',
    p_package_total: 20,
    p_package_remaining: null,
    p_package_expires_on: null,
    p_end_state: 'Goal',
    p_import_source_type: null,
    p_import_raw_text: null,
    p_import_summary: null,
    p_import_recorded_from: null,
    p_import_recorded_to: null,
  }]]);
});

test('existing member client sends optional source material in the same RPC', async () => {
  let submitted;
  const member = {
    id: 'member', trainer_id: 'trainer', name: 'Existing member', phone: '010-0000-0001',
    package_total: 20, package_remaining: 7, package_expires_on: null,
    end_state: 'Goal', created_at: '2026-09-20', updated_at: '2026-09-20',
  };
  const db = client(false, async (name, args) => {
    assert.equal(name, 'register_member_with_import');
    submitted = args;
    return { data: { success: true, member }, error: null };
  });
  await db.createMember({
    request_id: '10000000-0000-4000-8000-000000000101',
    member_kind: 'existing',
    name: 'Existing member',
    phone: '010-0000-0001',
    package_total: 20,
    package_remaining: 7,
    end_state: 'Goal',
    import_record: {
      source_type: 'existing_note',
      raw_text: '  original record  ',
      summary: 'summary',
      recorded_from: '2026-08-01',
      recorded_to: '2026-09-01',
    },
  });
  assert.equal(submitted.p_package_remaining, 7);
  assert.equal(submitted.p_import_raw_text, '  original record  ');
  assert.equal(submitted.p_import_summary, 'summary');
});

for (const [name, rpc] of [
  ['network exception', async () => { throw new Error('offline'); }],
  ['RPC error', async () => ({ data: null, error: { message: 'write failed' } })],
  ['empty response', async () => ({ data: null, error: null })],
]) {
  test(`${name} never produces a production success`, async () => {
    const db = client(false, rpc);
    assert.deepEqual(await db.submitHomeworkFeedbackRpc(demoToken, 'complete', { discomfort_level: 5 }),
      { success: false, reason: 'rpc_failed' });
  });
}

test('server rejection is preserved even in demo mode', async () => {
  const db = client(true, async () => ({ data: { success: false, reason: 'expired' }, error: null }));
  assert.deepEqual(await db.submitHomeworkFeedbackRpc(demoToken, 'complete', { discomfort_level: 5 }),
    { success: false, reason: 'expired' });
  assert.equal((await db.getHomeworkById('hw-open')).logs.length, 0);
});

test('demo final confirmation is immutable after the first successful submit', async () => {
  const db = client(true);
  assert.equal((await db.submitHomeworkFeedbackRpc(demoToken, 'complete', {
    discomfort_level: 3, note: 'first',
  })).success, true);
  const confirmed = structuredClone(await db.getHomeworkById('hw-open'));
  assert.deepEqual(await db.submitHomeworkFeedbackRpc(demoToken, 'cant', {
    discomfort_level: 10, note: 'replacement',
  }), { success: false, reason: 'already_submitted' });
  assert.deepEqual(await db.getHomeworkById('hw-open'), confirmed);
});

for (const kind of ['complete', 'cant']) {
  for (const discomfortLevel of [1, 10]) {
    test(`demo commits ${kind}, discomfort=${discomfortLevel}, and summary together`, async () => {
      const db = client(true);
      const result = await db.submitHomeworkFeedbackRpc(demoToken, kind, {
        discomfort_level: discomfortLevel, note: 'note',
      });
      const hw = await db.getHomeworkById('hw-open');
      assert.equal(result.success, true);
      assert.deepEqual(hw.logs.map((log) => log.kind), [kind, 'pain']);
      assert.equal(hw.logs[0].id, result.log_id);
      assert.equal(hw.logs[1].id, result.pain_log_id);
      assert.equal(hw.logs[1].payload.pain_level, discomfortLevel);
      assert.equal(hw.status, 'logged');
      assert.equal(hw.opening_line, result.opening_line);
      assert.ok(hw.opening_line.includes('note'));
      assert.equal(hw.updated_at, hw.logs[0].created_at);
    });
  }
}

test('demo generation failure leaves both logs and homework unchanged', async () => {
  const db = client(true, undefined, {
    './template': { generateOpeningLine: () => { throw new Error('summary failed'); } },
  });
  const previous = structuredClone(await db.getHomeworkById('hw-open'));
  await assert.rejects(db.submitHomeworkFeedbackRpc(demoToken, 'complete', { discomfort_level: 5 }), /summary failed/);
  assert.deepEqual(await db.getHomeworkById('hw-open'), previous);
});

test('demo rejects unknown, expired, revoked and invalid submissions without logs', async () => {
  const db = client(true);
  assert.equal((await db.submitHomeworkFeedbackRpc('unknown', 'complete', { discomfort_level: 5 })).reason, 'not_found');
  assert.equal((await db.submitHomeworkFeedbackRpc(demoToken, 'pain', { discomfort_level: 5 })).reason, 'invalid_kind');
  assert.equal((await db.submitHomeworkFeedbackRpc(demoToken, 'complete', { discomfort_level: 0 })).reason, 'invalid_discomfort_level');
  const expired = await db.createHomework({
    member_id: 'mem-1', why: '', token: 'expired', token_expires_at: '2020-01-01', items: [],
  });
  assert.equal((await db.submitHomeworkFeedbackRpc('expired', 'complete', { discomfort_level: 5 })).reason, 'expired');
  assert.equal(expired.logs.length, 0);
  await db.revokeHomework('hw-open');
  assert.equal((await db.submitHomeworkFeedbackRpc(demoToken, 'complete', { discomfort_level: 5 })).reason, 'revoked');
  assert.equal((await db.getHomeworkById('hw-open')).logs.length, 0);
});
