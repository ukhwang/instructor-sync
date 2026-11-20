import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './load-module.mjs';

// The browser calls Server Actions now; `rpc(name, input)` stands in for the action transport.
function client(rpc) {
  const action = (name) => async (input) => {
    const response = await rpc(name, input);
    if (response.error) return { ok: false, code: 'DB_UNAVAILABLE', message: response.error.message };
    return { ok: true, data: response.data };
  };
  return loadModule('lib/member-progress-data.ts', {
    '@/app/actions/data': {
      createProgressGoalAction: action('create_member_progress_goal'),
      recordProgressObservationAction: action('record_member_progress_observation'),
      getMemberProgressAction: action('get_member_progress'),
    },
  });
}

test('response loss remains retryable and the same observation request preserves zero and exact payload', async () => {
  const calls = [];
  const db = client(async (name, params) => {
    calls.push([name, params]);
    if (calls.length === 1) throw new Error('response lost');
    return { data: { success: true, observation_id: 'saved' }, error: null };
  });
  const input = { request_id: 'same-request', goal_id: 'goal', definition_version: 1, metric: 'duration', unit: 'seconds', measured_on: '2026-09-21', value: 0, source: 'member_report', actor: 'trainer' };
  assert.equal((await db.recordMemberProgressObservation(input)).retryable, true);
  assert.equal((await db.recordMemberProgressObservation(input)).success, true);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[1][1].value, 0);
  assert.equal(calls[1][1].actor, 'trainer');
});

test('confirmed validation rejection is distinct from an unknown transport outcome', async () => {
  const rejected = client(async () => ({ data: { success: false, reason: 'invalid_value' }, error: null }));
  assert.equal((await rejected.recordMemberProgressObservation({})).retryable, undefined);
  for (const response of [{ data: null, error: null }, { data: null, error: { message: 'fetch failed' } }]) {
    const db = client(async () => response);
    assert.equal((await db.createMemberProgressGoal({})).retryable, true);
    assert.equal((await db.getMemberProgress('member')).success, false);
  }
});
