import test from 'node:test';
import assert from 'node:assert/strict';
import { METRIC_UNITS, validateGoalInput, validateObservationInput } from '../contracts/member-progress-contract.mjs';

const now = new Date('2026-09-21T12:00:00+09:00');

test('accepts a functional goal and matching unit', () => {
  assert.deepEqual(validateGoalInput({
    member_id: 'member-123', name: '평지에서 10분 걷기',
    condition: '보조기 없이, 통증을 참지 않는 속도', metric: 'duration',
    direction: 'increase', unit: METRIC_UNITS.duration, target_value: 600,
    definition_version: 1,
  }), []);
});

test('rejects missing condition and mismatched unit', () => {
  const errors = validateGoalInput({
    member_id: 'member-123', name: '걷기', condition: '', metric: 'duration',
    direction: 'increase', unit: 'count', target_value: 10, definition_version: 1,
  });
  assert.ok(errors.includes('condition_required'));
  assert.ok(errors.includes('unit_invalid'));
});

test('accepts a numeric observation and an explicit unmeasured observation', () => {
  assert.deepEqual(validateObservationInput({
    goal_id: 'goal-123', definition_version: 1, measured_on: '2026-09-21',
    metric: 'duration', unit: 'seconds', value: 300, unmeasured_reason: null, source: 'member_report', actor: 'member', memo: null,
  }, now), []);
  assert.deepEqual(validateObservationInput({
    goal_id: 'goal-123', definition_version: 1, measured_on: '2026-09-21',
    metric: 'duration', unit: 'seconds', value: null, unmeasured_reason: '감기', source: 'member_report', actor: 'member', memo: null,
  }, now), []);
});

test('rejects future dates, out-of-range values, and missing reasons', () => {
  const future = validateObservationInput({
    goal_id: 'goal-123', definition_version: 1, measured_on: '2026-09-22',
    metric: 'difficulty', unit: 'score_0_10', value: 11, source: 'member_report', actor: 'member', memo: null,
  }, now);
  assert.ok(future.includes('measured_on_future'));
  assert.ok(future.includes('value_invalid'));
  const missingReason = validateObservationInput({
    goal_id: 'goal-123', definition_version: 1, measured_on: '2026-09-21',
    metric: 'difficulty', unit: 'score_0_10', value: null,
    source: 'member_report', actor: 'member', memo: null,
  }, now);
  assert.ok(missingReason.includes('unmeasured_reason_required'));
});

test('contract accepts Seoul midnight and rejects fractional difficulty and a value/reason conflict', () => {
  const input = { goal_id: 'goal', definition_version: 1, measured_on: '2026-09-21', metric: 'difficulty', unit: 'score_0_10', value: 0, source: 'member_report', actor: 'trainer' };
  assert.deepEqual(validateObservationInput(input, new Date('2026-09-20T15:00:00Z')), []);
  assert.ok(validateObservationInput({ ...input, value: 0.5 }, now).includes('value_invalid'));
  assert.ok(validateObservationInput({ ...input, unmeasured_reason: '측정 안 함' }, now).includes('value_reason_conflict'));
});
