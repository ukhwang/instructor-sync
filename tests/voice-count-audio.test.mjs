import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const {
  COUNT_CLIP_NUMBERS,
  COUNT_AUDIO_BASE,
  countClipKeys,
  countAudioUrl,
  loadCountAudio,
  playCountAudio,
  stopCountAudio,
} = loadModule('lib/voice-coach/count-audio.ts');

const buffer = (duration) => ({ duration });

function audioCtx(state = 'running') {
  return {
    state,
    currentTime: 12.5,
    createBufferSource() {
      return { buffer: null, connect() {}, start(at) { this.startedAt = at; }, stop() { this.stopped = true; } };
    },
    decodeAudioData(_bytes, onDone) {
      onDone(buffer(0.5));
    },
  };
}

test('카운트 파일은 1~20, 30, 40, 50 으로 배치되어 있다', () => {
  assert.equal(COUNT_AUDIO_BASE, '/audio/counts');
  assert.deepEqual([...COUNT_CLIP_NUMBERS].slice(0, 3), [1, 2, 3]);
  assert.equal(COUNT_CLIP_NUMBERS.length, 23);
  assert.equal(countAudioUrl(7), '/audio/counts/07.wav');
  assert.equal(countAudioUrl(50), '/audio/counts/50.wav');
});

test('21 이상은 십 단위 + 일 단위 클립으로 나눈다', () => {
  assert.deepEqual(countClipKeys(1), ['01']);
  assert.deepEqual(countClipKeys(20), ['20']);
  assert.deepEqual(countClipKeys(21), ['20', '01']);
  assert.deepEqual(countClipKeys(24), ['20', '04']);
  assert.deepEqual(countClipKeys(30), ['30']);
  assert.deepEqual(countClipKeys(45), ['40', '05']);
  for (const unsupported of [0, -1, 2.5, 60, 99, Number.NaN]) {
    assert.equal(countClipKeys(unsupported), null, `${unsupported} 는 폴백`);
  }
});

test('모든 클립을 받아 디코딩해 메모리에 담는다', async () => {
  const requested = [];
  const bank = await loadCountAudio(audioCtx(), {
    fetchImpl: async (url) => {
      requested.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });
  assert.equal(bank.size, COUNT_CLIP_NUMBERS.length);
  assert.equal(requested.length, COUNT_CLIP_NUMBERS.length);
  assert.ok(bank.has('01') && bank.has('20') && bank.has('50'));
  assert.equal(bank.get('07').duration, 0.5);
});

test('오프라인·미지원이면 조용히 빈 은행을 돌려준다', async () => {
  const offline = await loadCountAudio(audioCtx(), { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(offline.size, 0);
  const notFound = await loadCountAudio(audioCtx(), { fetchImpl: async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(1) }) });
  assert.equal(notFound.size, 0);
  assert.equal((await loadCountAudio(null)).size, 0);
  assert.equal((await loadCountAudio({ state: 'running' })).size, 0);
});

test('카운트는 오디오 클록 현재 시각에 즉시 재생한다', () => {
  const ctx = audioCtx();
  const bank = new Map([['20', buffer(0.5)], ['03', buffer(0.4)]]);
  const sources = playCountAudio(ctx, bank, 23);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].startedAt, 12.5);
  assert.ok(Math.abs(sources[1].startedAt - (12.5 + 0.5 * 0.94)) < 1e-9);
  assert.deepEqual(stopCountAudio(sources), undefined);
  assert.equal(sources.length, 0);
});

test('준비되지 않은 카운트는 null 로 돌려 폴백을 알린다', () => {
  const ctx = audioCtx();
  assert.equal(playCountAudio(ctx, new Map(), 3), null);
  assert.equal(playCountAudio(ctx, new Map([['03', buffer(0.4)]]), 60), null);
  assert.equal(playCountAudio(ctx, new Map([['20', buffer(0.5)]]), 23), null);
  assert.equal(playCountAudio(null, new Map([['03', buffer(0.4)]]), 3), null);
});
