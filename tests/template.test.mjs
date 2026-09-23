import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { generateRenewalScript } = loadModule('lib/template.ts');

test('renewal script uses only known remaining sessions and member goal', () => {
  const { text } = generateRenewalScript('김회원', '오래 앉은 뒤 허리 불편함 줄이기', 3, 20);

  assert.match(text, /남은 수업은 3회입니다/);
  assert.match(text, /오래 앉은 뒤 허리 불편함 줄이기/);
  assert.doesNotMatch(text, /지금까지/);
  assert.doesNotMatch(text, /함께 진행했습니다/);
  assert.doesNotMatch(text, /된 것|아직|다음/);
});

test('renewal script remains natural without a recorded goal', () => {
  const { text } = generateRenewalScript('김회원', '', 0, 10);

  assert.equal(
    text,
    '김회원님, 남은 수업은 0회입니다. 요즘 몸 상태와 운동하면서 느낀 점을 먼저 듣고, 남은 수업에서 어떤 부분을 더 살펴볼지 함께 정해보겠습니다.'
  );
});
