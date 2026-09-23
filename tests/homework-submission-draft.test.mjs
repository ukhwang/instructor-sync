import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const {
  canSubmitHomework,
  clearSubmissionDraft,
  createSubmissionFingerprint,
  loadSubmissionDraft,
  prepareSubmissionDraft,
  saveSubmissionDraft,
} = loadModule('lib/homework-submission-draft.ts');

function withSessionStorage(run) {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try { return run(values); } finally { globalThis.window = previousWindow; }
}

test('submit is enabled by performed items or an explicit unable-to-do choice', () => {
  assert.equal(canSubmitHomework([], false), false);
  assert.equal(canSubmitHomework(['item-1'], false), true);
  assert.equal(canSubmitHomework([], true), true);
});

test('fingerprint is stable across item ordering and includes the homework and choice', () => {
  const base = { homeworkId: 'hw-1', completedItemIds: ['b', 'a'], discomfortLevel: 3, note: ' ok ', explicitlyCant: false };
  assert.equal(createSubmissionFingerprint(base), createSubmissionFingerprint({ ...base, completedItemIds: ['a', 'b', 'a'], note: 'ok' }));
  assert.notEqual(createSubmissionFingerprint(base), createSubmissionFingerprint({ ...base, homeworkId: 'hw-2' }));
  assert.notEqual(createSubmissionFingerprint(base), createSubmissionFingerprint({ ...base, explicitlyCant: true }));
});

test('same payload reuses its request id while an edited payload gets a new id', () => withSessionStorage(() => {
  const input = { homeworkId: 'hw-1', completedItemIds: ['item-1'], discomfortLevel: 4, note: '', explicitlyCant: false };
  const first = prepareSubmissionDraft(input);
  saveSubmissionDraft(first);
  const retry = prepareSubmissionDraft(input);
  assert.equal(retry.requestId, first.requestId);
  const edited = prepareSubmissionDraft({ ...input, discomfortLevel: 5 });
  assert.notEqual(edited.requestId, first.requestId);
}));

test('failed-attempt draft restores without storing a public token and clears after success', () => withSessionStorage((values) => {
  const draft = prepareSubmissionDraft({ homeworkId: 'hw-1', completedItemIds: [], discomfortLevel: 7, note: '시간이 없었어요', explicitlyCant: true });
  saveSubmissionDraft(draft);
  assert.deepEqual(loadSubmissionDraft('hw-1'), draft);
  assert.equal([...values.values()].some((value) => value.includes('public-token')), false);
  assert.equal(loadSubmissionDraft('another-homework'), null);
  clearSubmissionDraft('hw-1');
  assert.equal(loadSubmissionDraft('hw-1'), null);
}));

test('a storage failure does not invalidate the caller-held retry identity', () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    },
  };
  try {
    const input = { homeworkId: 'hw-blocked', completedItemIds: ['item-1'], discomfortLevel: 2, note: '', explicitlyCant: false };
    const first = prepareSubmissionDraft(input);
    const retry = prepareSubmissionDraft(input, first);
    assert.equal(retry.requestId, first.requestId);
  } finally {
    globalThis.window = previousWindow;
  }
});
