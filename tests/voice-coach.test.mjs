import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const source = 'app/h/[token]/VoiceCoachSession.tsx';
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const text = (node) => Array.isArray(node) ? node.map(text).join('')
  : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
function find(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
}

// Exercise the actual component handlers/effects with deterministic hook commits,
// browser events, and time. Speech and audio remain explicit browser mocks.
function session(t, overrides = {}, audioCtx = null, autoStart = true) {
  let now = 0, nextTimer = 0, cursor = 0, dirty = true, tree, finished = 0, closed = 0;
  const timers = new Map(), slots = [], effects = [], speech = [], listeners = new Map();
  let cancels = 0;
  const browser = {
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    speechSynthesis: { cancel: () => { cancels++; }, speak: (u) => speech.push(u.text) },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const doc = {
    visibilityState: 'visible',
    addEventListener: browser.addEventListener,
    removeEventListener: browser.removeEventListener,
  };
  const restoreGlobals = [];
  for (const [key, value] of Object.entries({
    window: browser, document: doc,
    SpeechSynthesisUtterance: class { constructor(value) { this.text = value; } },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    restoreGlobals.push(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  const hooks = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value) => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { value: factory(), deps };
      return slots[index].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    },
  };
  const { VoiceCoachSession, unlockAudioFromGesture } = loadModule(source, { react: hooks });
  const props = {
    items: [{ id: 'item', name: 'Bridge', cue: 'Breathe', target_sets: 2,
      target_reps: '2회', seconds_per_rep: 1, rest_seconds: 0, ...overrides }],
    audioCtx, onFinished: () => finished++, onClose: () => closed++,
  };
  function flush() {
    let limit = 30;
    while (dirty) {
      assert.ok(limit-- > 0, 'render must settle');
      dirty = false; cursor = 0;
      tree = VoiceCoachSession(props);
      effects.splice(0).forEach((effect) => effect());
    }
  }
  function unmount() { slots.forEach((slot) => slot?.cleanup?.()); }
  t.after(() => { unmount(); restoreGlobals.forEach((restore) => restore()); });
  flush();
  if (autoStart) {
    const start = find(tree, (n) => n.type === 'button' && text(n) === '1세트 시작')[0];
    assert.ok(start, 'initial set start button exists');
    start.props.onClick();
    flush();
  }
  return {
    browser, doc, speech, timers, unlockAudioFromGesture,
    get cancels() { return cancels; }, get finished() { return finished; }, get closed() { return closed; },
    get text() { return text(tree); },
    get count() { return text(find(tree, (n) => n.props?.className?.includes('text-7xl'))[0]); },
    click(label) {
      const button = find(tree, (n) => n.type === 'button' && text(n) === label)[0];
      assert.ok(button, `button ${label} exists`);
      if (!button.props.disabled) button.props.onClick();
      flush();
    },
    event(name, visibility = doc.visibilityState) {
      doc.visibilityState = visibility;
      listeners.get(name)?.({ type: name });
      flush();
    },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [id, timer] = entry;
        now = timer.at; timers.delete(id); timer.fn(); flush();
      }
      now = end;
    },
    async settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); flush(); } },
    unmount,
  };
}

function audio(state = 'suspended', resume = async () => {}) {
  return { state, resume, currentTime: 0,
    createOscillator: () => ({ frequency: {}, connect() {}, start() {}, stop() {} }),
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
  };
}

test('pause immediately cancels queued speech and freezes the count, including navigation', async (t) => {
  const s = session(t);
  const before = s.cancels;
  s.click('일시정지');
  assert.equal(s.cancels, before + 1);
  s.advance(10000);
  assert.equal(s.count, '1 / 2');
  const spoken = s.speech.length;
  s.click('다음 동작');
  assert.equal(s.speech.length, spoken);
  s.click('이어서'); await s.settle();
  assert.equal(s.count, '준비');
  s.click('2세트 시작');
  s.advance(1000);
  assert.equal(s.count, '2 / 2');
});

test('a completed zero-rest set waits for the member to start the next set', (t) => {
  const s = session(t);
  s.advance(2000);
  assert.ok(s.text.includes('세트 2 / 2'));
  assert.equal(s.count, '준비');
  s.click('2세트 시작');
  assert.equal(s.count, '1 / 2');
  assert.ok(!s.speech.some((cue) => cue.includes('휴식')));
});
for (const [rest, expected] of [[2, 2], [undefined, 20]]) {
  test(`rest ${rest} retains its configured/default duration before the next set is manually started`, (t) => {
    const s = session(t, { rest_seconds: rest });
    s.advance(2000);
    assert.equal(s.count, String(expected));
    s.advance(expected * 1000);
    assert.ok(s.text.includes('세트 2 / 2'));
    assert.equal(s.count, '준비');
    s.click('2세트 시작');
    assert.equal(s.count, '1 / 2');
  });
}

for (const label of ['1회', '1초']) {
  test(`${label} per-side work waits three seconds before the same set on the right`, (t) => {
    const s = session(t, { target_reps: label, per_side: true });
    s.advance(1000);
    assert.equal(s.count, '3');
    assert.equal(s.speech.at(-1), '반대쪽(오른쪽) 준비하세요');
    const cancels = s.cancels;
    s.advance(2000);
    assert.equal(s.count, '1');
    assert.equal(s.cancels, cancels, 'preparation ticks must not cancel the instruction');
    assert.ok(s.text.includes('오른쪽 준비'));
    s.advance(999);
    assert.ok(s.text.includes('오른쪽 준비'));
    s.advance(1);
    assert.ok(!s.text.includes('오른쪽 준비'));
    assert.ok(s.text.includes('세트 1 / 2 · 오른쪽'));
    s.advance(1000);
    assert.ok(s.text.includes('2세트 시작'));
    s.click('2세트 시작');
    assert.ok(s.text.includes('세트 2 / 2 · 왼쪽'));
  });
}

test('the first set does not tick until the member presses the start control', (t) => {
  const s = session(t, {}, null, false);
  assert.ok(s.text.includes('세트 1 / 2'));
  assert.equal(s.count, '준비');
  s.advance(5000);
  assert.equal(s.count, '준비');
  s.click('1세트 시작');
  assert.equal(s.count, '1 / 2');
});

test('pausing during preparation preserves the remaining countdown', async (t) => {
  const s = session(t, { target_reps: '1회', per_side: true });
  s.advance(2000); s.click('일시정지'); s.advance(10000);
  assert.equal(s.count, '2');
  s.click('이어서'); await s.settle(); s.advance(2000);
  assert.equal(s.count, '1 / 1');
  assert.ok(s.text.includes('오른쪽'));
});

test('resume waits for audio success and blocks duplicate clicks', async (t) => {
  let resolve, calls = 0;
  const ctx = audio('suspended', () => { calls++; return new Promise((r) => { resolve = r; }); });
  const s = session(t, {}, ctx);
  s.event('visibilitychange', 'hidden'); s.event('visibilitychange', 'visible');
  s.click('이어서'); s.click('재개 중…');
  assert.equal(calls, 1);
  s.advance(1000); assert.equal(s.count, '1 / 2');
  ctx.state = 'running'; resolve(); await s.settle();
  assert.ok(!s.text.includes('소리를 재개하지 못했습니다'));
  s.advance(1000); assert.equal(s.count, '2 / 2');
});

for (const failure of ['reject', 'blocked', 'closed', 'missing', 'pending']) {
  test(`audio ${failure} falls back to a visual timer that can finish`, async (t) => {
    const ctx = failure === 'missing' ? null : audio(failure === 'closed' ? 'closed' : 'suspended',
      failure === 'reject' ? async () => { throw new Error('blocked'); }
        : failure === 'pending' ? () => new Promise(() => {}) : async () => {});
    const s = session(t, { target_sets: 1 }, ctx);
    // pagehide must pause even when visibilityState has not changed yet.
    s.event('pagehide'); s.advance(3000); assert.equal(s.count, '1 / 2');
    s.click('이어서');
    if (failure === 'pending') s.advance(2000);
    await s.settle();
    assert.ok(s.text.includes('화면 타이머를 보며 계속 진행하세요'));
    s.advance(2000); assert.equal(s.finished, 1);
  });
}

test('a late audio result cannot resume after another hide or close', async (t) => {
  let resolve;
  const ctx = audio('suspended', () => new Promise((r) => { resolve = r; }));
  const s = session(t, {}, ctx);
  s.event('pagehide'); s.click('이어서');
  s.event('pagehide'); ctx.state = 'running'; resolve(); await s.settle();
  s.advance(5000); assert.equal(s.count, '1 / 2');
  assert.ok(s.text.includes('이어서'));
  ctx.state = 'suspended'; s.click('이어서'); s.click('닫기');
  ctx.state = 'running'; resolve(); await s.settle();
  s.advance(5000); assert.equal(s.count, '1 / 2'); assert.equal(s.closed, 1);
});

test('audio construction failure still allows the coach to open without sound', async (t) => {
  const s = session(t);
  s.browser.AudioContext = class { constructor() { throw new Error('not allowed'); } };
  assert.equal(await s.unlockAudioFromGesture(), null);
});
