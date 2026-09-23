import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../lib/member-progress-state.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
const { seoulToday, parseProgressNumber, measurementPayload, progressSeries } = mod.exports;

test('Seoul midnight date uses the local day and allows zero but rejects blank/fractional difficulty', () => {
  assert.equal(seoulToday(new Date('2026-09-20T14:59:59Z')), '2026-09-20');
  assert.equal(seoulToday(new Date('2026-09-20T15:00:00Z')), '2026-09-21');
  assert.equal(parseProgressNumber('0', 'difficulty'), 0);
  assert.throws(() => parseProgressNumber(' ', 'duration'));
  assert.throws(() => parseProgressNumber('2.5', 'difficulty'));
  assert.throws(() => parseProgressNumber('Infinity', 'duration'));
});

test('measurement keeps source independent of actor and never carries a stale number for unmeasured input', () => {
  const input = { measuredOn: '2026-09-21', measured: false, value: '8', reason: '감기', source: 'member_report', memo: '' };
  const payload = measurementPayload(input, 'difficulty', new Date('2026-09-20T15:00:00Z'));
  assert.equal(payload.value, null);
  assert.equal(payload.actor, 'trainer');
  assert.equal(payload.source, 'member_report');
  assert.throws(() => measurementPayload({ ...input, reason: '' }, 'difficulty'));
  assert.throws(() => measurementPayload({ ...input, measuredOn: '2026-09-22' }, 'difficulty', new Date('2026-09-20T15:00:00Z')));
});

const goal = { id: 'goal', definition_version: 1, metric: 'duration', unit: 'seconds' };
const row = (id, patch = {}) => ({ id, goal_id: 'goal', definition_version: 1, metric: 'duration', unit: 'seconds', measured_on: '2026-09-21', created_at: `2026-09-21T0${id}:00:00Z`, value: 5, source: 'trainer_measurement', supersedes_observation_id: null, ...patch });

test('latest correction replaces the original in its chronological position and sources stay separate', () => {
  const original = row('1');
  const second = row('2', { value: 8 });
  const correction = row('3', { value: 6, supersedes_observation_id: '1' });
  const final = row('4', { value: 7, supersedes_observation_id: '3' });
  const reported = row('5', { source: 'member_report', value: 100 });
  const otherGoal = row('6', { goal_id: 'elsewhere' });
  const otherVersion = row('7', { definition_version: 2 });
  const result = progressSeries(goal, [original, second, correction, final, reported, otherGoal, otherVersion]);
  assert.deepEqual(result.rows.map((entry) => entry.id), ['4', '2', '5']);
  assert.equal(result.comparisons[0].first.value, 7);
  assert.equal(result.comparisons[0].recent.value, 8);
  assert.equal(result.comparisons[1].first.id, result.comparisons[1].recent.id);
});

test('zero and one observation do not fabricate a change; correcting to missing removes it from comparison', () => {
  assert.deepEqual(progressSeries(goal, []).rows, []);
  const result = progressSeries(goal, [row('1'), row('2', { supersedes_observation_id: '1', value: null })]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, '2');
  assert.equal(result.comparisons[0].first, undefined);
});
