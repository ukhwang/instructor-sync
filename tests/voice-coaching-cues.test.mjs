import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { parseCoachingCues, resolveCoachingCues, isCoachingBeat, DEFAULT_COACHING_CUES } =
  loadModule('lib/voice-coach/coaching-cues.ts');

test('원장님이 고른 코칭 태그를 그대로 쓴다', () => {
  assert.deepEqual(parseCoachingCues('코어 잡기, 허리 바닥에 붙이기'), ['코어 잡기', '허리 바닥에 붙이기']);
  assert.deepEqual(parseCoachingCues('#골반 중립 · #복압 유지'), ['골반 중립', '복압 유지']);
  assert.deepEqual(parseCoachingCues('  호흡  ,호흡 , 무릎 정렬 '), ['호흡', '무릎 정렬']);
});

test('설명문은 태그로 쓰지 않는다', () => {
  assert.deepEqual(parseCoachingCues('골반을 말아올리며 엉덩이에 힘을 꽉 주고 1초 정지합니다.'), []);
  assert.deepEqual(parseCoachingCues('허리가 바닥에서 뜨지 않게 하세요'), []);
  assert.deepEqual(parseCoachingCues(''), []);
  assert.deepEqual(parseCoachingCues(null), []);
});

test('태그가 없으면 운동 DB 기본 코칭 태그로 넘어간다', () => {
  assert.deepEqual(
    resolveCoachingCues('골반을 말아올리며 엉덩이에 힘을 주고 1초 정지합니다.', ['척추 중립', '복압 유지']),
    ['척추 중립', '복압 유지'],
  );
  assert.deepEqual(resolveCoachingCues('코어 잡기', ['척추 중립']), ['코어 잡기']);
  assert.deepEqual(resolveCoachingCues('설명만 있는 문장입니다.', []), [...DEFAULT_COACHING_CUES]);
  assert.deepEqual(resolveCoachingCues(null, null), [...DEFAULT_COACHING_CUES]);
});

test('코칭 멘트는 절반 지점과 3회마다 띄운다', () => {
  assert.equal(isCoachingBeat(3, 10), true);
  assert.equal(isCoachingBeat(6, 10), true);
  assert.equal(isCoachingBeat(5, 10), true); // 절반 지점
  assert.equal(isCoachingBeat(1, 10), false);
  assert.equal(isCoachingBeat(4, 10), false);
  assert.equal(isCoachingBeat(10, 10), false); // 마지막 회차는 세트 종료로 넘어간다
  assert.equal(isCoachingBeat(2, 4), true); // 4회면 절반(2)과 3회
  assert.equal(isCoachingBeat(3, 4), true);
});
