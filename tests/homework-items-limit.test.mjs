import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { MAX_HOMEWORK_ITEMS, assignHomeworkInputSchema } = loadModule('lib/homework-schemas.ts');

const card = (index) => ({ name: `동작 ${index}`, sets: 3, reps: '10회', cue: '천천히' });
const input = (count) => ({ memberId: 'member-1', why: '숙제', customItems: Array.from({ length: count }, (_, i) => card(i + 1)) });

test('숙제 상한은 20개다', () => {
  assert.equal(MAX_HOMEWORK_ITEMS, 20);
});

test('4~20개 출제를 허용한다', () => {
  for (const count of [3, 4, 12, 20]) {
    const parsed = assignHomeworkInputSchema.safeParse(input(count));
    assert.equal(parsed.success, true, `${count}개는 통과해야 한다`);
    assert.equal(parsed.data.customItems.length, count);
  }
});

test('21개는 막고 상한을 문구로 알린다', () => {
  const parsed = assignHomeworkInputSchema.safeParse(input(21));
  assert.equal(parsed.success, false);
  assert.match(parsed.error.issues[0].message, /최대 20개/);
});

test('출제 화면이 상한을 상수로만 참조한다', () => {
  const source = readFileSync(new URL('../components/homework/QuickAssignDrawer.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('MAX_HOMEWORK_ITEMS'));
  assert.ok(!source.includes('/3<'), '하드코딩된 /3 카운터가 없어야 한다');
  assert.ok(!source.includes('최대 3개'));
  assert.ok(!/selectedCards\.length < 3\b/.test(source));
});
