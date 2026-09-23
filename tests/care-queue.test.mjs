import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const {
  buildCareQueue,
  CARE_QUEUE_WINDOW_DAYS,
  CONSULTATION_REMAINING_SESSIONS,
} = loadModule('lib/care-queue.ts');

const now = new Date('2026-09-19T00:00:00.000Z');
const member = (id, remaining = 10) => ({
  id,
  trainer_id: 'trainer-1',
  name: id,
  phone: '010-0000-0000',
  package_total: 10,
  package_remaining: remaining,
  package_expires_on: null,
  end_state: '',
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
});
const homework = (id, memberId, daysAgo, kind = null) => ({
  id,
  trainer_id: 'trainer-1',
  member_id: memberId,
  token: id,
  token_expires_at: now.toISOString(),
  revoked_at: null,
  why: '',
  status: kind ? 'logged' : 'opened',
  opening_line: null,
  created_at: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  updated_at: now.toISOString(),
  logs: kind
    ? [{ id: `log-${id}`, homework_id: id, kind, payload: {}, created_at: now.toISOString() }]
    : [],
});

test('care queue uses clear MVP thresholds', () => {
  assert.equal(CARE_QUEUE_WINDOW_DAYS, 14);
  assert.equal(CONSULTATION_REMAINING_SESSIONS, 4);
});

test('remaining sessions create a consultation item without homework data', () => {
  const [entry] = buildCareQueue([member('m1', 4)], [], now);
  assert.deepEqual(entry.reasons, ['consultation']);
  assert.equal(entry.completionRate, null);
});

test('two recent assignments below 50 percent completion need a performance check', () => {
  const [entry] = buildCareQueue(
    [member('m1')],
    [homework('h1', 'm1', 2), homework('h2', 'm1', 3)],
    now
  );
  assert.deepEqual(entry.reasons, ['low_completion']);
  assert.equal(entry.completionRate, 0);
});

test('a recent cant submission creates a next-session check and records the rate', () => {
  const [entry] = buildCareQueue(
    [member('m1')],
    [homework('h1', 'm1', 2, 'cant'), homework('h2', 'm1', 3, 'complete')],
    now
  );
  assert.deepEqual(entry.reasons, ['needs_session_check']);
  assert.equal(entry.completionRate, 50);
  assert.equal(entry.latestSubmissionAt, now.toISOString());
});

test('old and revoked homework do not affect recent completion metrics', () => {
  const old = homework('old', 'm1', 15, 'cant');
  const revoked = { ...homework('revoked', 'm1', 1, 'cant'), status: 'revoked' };
  assert.deepEqual(buildCareQueue([member('m1')], [old, revoked], now), []);
});

test('partial submission remains incomplete and prompts a next-session check', () => {
  const [entry] = buildCareQueue([member('m1')], [homework('h1', 'm1', 2, 'partial')], now);
  assert.deepEqual(entry.reasons, ['needs_session_check']);
  assert.equal(entry.completedCount, 0);
  assert.equal(entry.completionRate, 0);
  assert.equal(entry.latestSubmissionAt, now.toISOString());
});
