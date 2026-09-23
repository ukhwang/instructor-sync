import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { calculateHomeworkVolume } = loadModule('lib/homework-volume.ts');

test('calculates total prescribed reps and sets for multiple exercises', () => {
  const result = calculateHomeworkVolume([
    { name: 'Bridge', target_sets: 3, target_reps: '12회', effort_kind: 'reps', reps: 12 },
    { name: 'Squat', target_sets: 2, target_reps: '10회', effort_kind: 'reps', reps: 10 },
  ]);
  assert.equal(result.totalSets, 5);
  assert.equal(result.totalReps, 56);
  assert.equal(result.totalHoldSeconds, 0);
});

test('calculates hold time and doubles per-side work without changing stored fields', () => {
  const result = calculateHomeworkVolume([
    { name: 'Stretch', target_sets: 2, target_reps: '30초 (각)', effort_kind: 'hold', hold_seconds: 30, per_side: true },
  ]);
  assert.equal(result.totalSets, 2);
  assert.equal(result.totalReps, 0);
  assert.equal(result.totalHoldSeconds, 120);
  assert.equal(result.perItem[0].perSide, true);
});

test('ignores empty draft rows and uses safe defaults for incomplete input', () => {
  const result = calculateHomeworkVolume([
    { name: '  ', target_sets: 0, target_reps: '' },
    { name: 'Bridge', target_sets: Number.NaN, target_reps: '' },
  ]);
  assert.equal(result.exerciseCount, 1);
  assert.equal(result.totalSets, 3);
  assert.equal(result.totalReps, 30);
});
