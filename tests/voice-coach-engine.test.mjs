import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const phrases = loadModule('lib/voice-coach/phrases.ts');
const timeline = loadModule('lib/voice-coach/timeline.ts');
const { createRunner } = loadModule('lib/voice-coach/runner.ts');

test('고유어 숫자 구령', () => {
  const said = [1, 2, 3, 4, 5, 9, 10, 11, 12, 20, 21, 30, 45].map(phrases.nativeCount);
  assert.deepEqual(said, ['하나', '둘', '셋', '넷', '다섯', '아홉', '열', '열하나', '열둘', '스물', '스물하나', '서른', '마흔다섯']);
  assert.equal(phrases.nativeCount(0), '0');
});

test('N번째 세트 시작! / 마지막 세트', () => {
  assert.equal(phrases.setStartPhrase(1, 3), '첫 번째 세트 시작!');
  assert.equal(phrases.setStartPhrase(2, 3), '두 번째 세트 시작!');
  assert.equal(phrases.setStartPhrase(3, 3), '마지막, 세 번째 세트 시작!');
  assert.equal(phrases.setStartPhrase(1, 1), '첫 번째 세트 시작!');
});

const repsPlan = { kind: 'reps', reps: 5, holdSeconds: 30, secondsPerRep: 2, perSide: false, restSec: 30, totalSets: 3 };

test('횟수 운동 타임라인: 시작 구령 → 하나~다섯 → 끝', () => {
  const ev = timeline.buildSetTimeline(repsPlan, 2);
  assert.equal(ev[0].speech, '두 번째 세트 시작!');
  const counts = ev.filter((e) => e.kind === 'count');
  assert.deepEqual(counts.map((e) => e.speech), ['하나', '둘', '셋', '넷', '다섯']);
  assert.equal(counts[1].atMs - counts[0].atMs, 2000);
  assert.equal(counts[0].atMs, timeline.START_LEAD_MS);
  assert.equal(ev.at(-1).kind, 'end');
  assert.equal(ev.at(-1).atMs, timeline.START_LEAD_MS + 5 * 2000);
});

test('첫 세트에는 동작 소개가 구령 앞에 붙고 대기시간이 늘어난다', () => {
  const ev = timeline.buildSetTimeline(repsPlan, 1, { intro: '버드독. 5번, 3세트예요.' });
  assert.equal(ev[0].speech, '버드독. 5번, 3세트예요. 첫 번째 세트 시작!');
  assert.equal(ev.find((e) => e.kind === 'count').atMs, timeline.START_LEAD_MS + timeline.INTRO_EXTRA_MS);
});

test('좌우 운동: 왼쪽 → 오른쪽 안내 → 오른쪽 카운트', () => {
  const ev = timeline.buildSetTimeline({ ...repsPlan, reps: 3, perSide: true }, 1);
  assert.deepEqual(ev.filter((e) => e.kind === 'count').map((e) => e.side), ['left', 'left', 'left', 'right', 'right', 'right']);
  assert.equal(ev.filter((e) => e.kind === 'side-switch').length, 1);
});

test('버티기 운동: 마지막 3초만 숫자를 읽는다', () => {
  const ev = timeline.buildSetTimeline({ ...repsPlan, kind: 'hold', holdSeconds: 12 }, 1);
  const ticks = ev.filter((e) => e.kind === 'hold-tick');
  assert.equal(ticks.length, 12);
  assert.deepEqual(ticks.filter((e) => e.speech).map((e) => e.speech), ['10초 남았어요', '셋', '둘', '하나']);
});

test('toSetPlan: 라벨에서 횟수·좌우·간격을 읽고 간격은 범위로 제한', () => {
  const plan = timeline.toSetPlan({ id: 'a', exerciseName: 'x', target_reps: '각 8회', target_sets: 2, restSec: 25, seconds_per_rep: 99 });
  assert.equal(plan.reps, 8);
  assert.equal(plan.perSide, true);
  assert.equal(plan.secondsPerRep, timeline.MAX_SECONDS_PER_REP);
  assert.equal(plan.restSec, 25);
  assert.equal(plan.totalSets, 2);
});

function fakeClock() {
  let now = 0, id = 0; const timers = new Map();
  return {
    clock: { now: () => now, setTimeout: (fn, ms) => { timers.set(++id, { fn, at: now + ms }); return id; }, clearTimeout: (i) => timers.delete(i) },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); due[1].fn();
      }
      now = target;
    },
  };
}

test('재생기: 시간 흐름대로 발화하고 끝나면 onEnd 한 번', () => {
  const ev = timeline.buildSetTimeline({ ...repsPlan, reps: 3 }, 1);
  const f = fakeClock(); const said = []; let ended = 0;
  const r = createRunner(ev, { onEvent: (e) => e.speech && said.push(e.speech), onEnd: () => { ended++; } }, f.clock);
  r.start();
  f.advance(0); assert.deepEqual(said, ['첫 번째 세트 시작!']);
  f.advance(timeline.START_LEAD_MS); assert.equal(said.at(-1), '하나');
  f.advance(2000); assert.equal(said.at(-1), '둘');
  f.advance(10000);
  assert.deepEqual(said.slice(1, 4), ['하나', '둘', '셋']);
  assert.equal(said.at(-1), '좋아요, 한 세트 끝!');
  assert.equal(ended, 1);
  f.advance(60000); assert.equal(ended, 1);
});

test('재생기: 일시정지 중에는 멈추고 재개하면 남은 시간만큼 이어간다', () => {
  const ev = timeline.buildSetTimeline({ ...repsPlan, reps: 3 }, 1);
  const f = fakeClock(); const said = [];
  const r = createRunner(ev, { onEvent: (e) => e.speech && said.push(e.speech), onEnd: () => {} }, f.clock);
  r.start();
  f.advance(timeline.START_LEAD_MS + 500); // '하나' 발화, 둘까지 1500ms 남음
  r.pause();
  f.advance(30000);
  assert.equal(said.at(-1), '하나');
  r.resume();
  f.advance(1499); assert.equal(said.at(-1), '하나');
  f.advance(1); assert.equal(said.at(-1), '둘');
});

test('재생기: stop 하면 더는 발화하지 않는다', () => {
  const ev = timeline.buildSetTimeline(repsPlan, 1);
  const f = fakeClock(); const said = []; let ended = 0;
  const r = createRunner(ev, { onEvent: (e) => said.push(e), onEnd: () => { ended++; } }, f.clock);
  r.start(); f.advance(0); r.stop(); f.advance(60000);
  assert.equal(said.length, 1);
  assert.equal(ended, 0);
});
