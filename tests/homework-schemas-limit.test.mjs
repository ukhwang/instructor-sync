import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { assignHomeworkInputSchema, MAX_HOMEWORK_ITEMS, submitFeedbackInputSchema } = loadModule('lib/homework-schemas.ts');
const item = (i, extra = {}) => ({ name: `m${i}`, sets: 3, reps: '10회', cue: '', restSec: 30, ...extra });
const input = (customItems) => ({ memberId: 'm1', customItems });

test('상한은 20개, 필수(★) 개수는 제한이 없다', () => {
  assert.equal(MAX_HOMEWORK_ITEMS, 20);
  const eight = Array.from({ length: 8 }, (_, i) => item(i, { required: i < 3 }));
  assert.equal(assignHomeworkInputSchema.safeParse(input(eight)).success, true);
  assert.equal(assignHomeworkInputSchema.safeParse(input(Array.from({ length: 20 }, (_, i) => item(i)))).success, true);
  assert.equal(assignHomeworkInputSchema.safeParse(input(Array.from({ length: 21 }, (_, i) => item(i)))).success, false);
});

test('required 를 생략하면 필수, 필수가 하나도 없으면 거부', () => {
  const ok = assignHomeworkInputSchema.safeParse(input([item(1)]));
  assert.equal(ok.success, true);
  assert.equal(ok.data.customItems[0].required, true);
  const none = assignHomeworkInputSchema.safeParse(input([item(1, { required: false }), item(2, { required: false })]));
  assert.equal(none.success, false);
  assert.match(none.error.issues[0].message, /필수/);
});

test('제출: 완료 동작 id 는 상한(20)까지', () => {
  const base = { token: 't', homeworkId: 'h', requestId: crypto.randomUUID(), mood: 'good', painAreas: [], painScore: null, completedSets: 1, totalSets: 1, submittedAt: new Date().toISOString() };
  const ids = (n) => Array.from({ length: n }, (_, i) => `id${i}`);
  assert.equal(submitFeedbackInputSchema.safeParse({ ...base, completedItemIds: ids(20) }).success, true);
  assert.equal(submitFeedbackInputSchema.safeParse({ ...base, completedItemIds: ids(21) }).success, false);
});
