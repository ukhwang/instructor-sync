import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { normalizeCoachItem } = loadModule('lib/coach.ts');
const { useHomeworkDraftStore: store } = loadModule('stores/homework-draft-store.ts');
const manualItem = { name: 'Manual', cue: '', target_sets: 3, target_reps: '12회' };

test('editing a preset from 15 reps to 5 updates the draft and voice count', () => {
  store.getState().resetDraft();
  store.getState().addSeedItem({
    name: 'Bridge', default_cue: '', default_sets: 3, default_reps: '15회',
    default_effort_kind: 'reps', default_rep_count: 15, default_hold_seconds: null,
    default_seconds_per_rep: 4, default_rest_seconds: 25, default_per_side: false,
  });
  store.getState().updateItem(0, { target_reps: '5회' });
  const item = store.getState().items[0];
  assert.equal(item.reps, 5);
  assert.equal(normalizeCoachItem(item).reps, 5);
  assert.equal(item.effort_kind, 'reps');
  assert.equal(item.hold_seconds, null);
  assert.equal(item.seconds_per_rep, 4);
  assert.equal(item.rest_seconds, 25);
});

test('switching between reps and holds clears the obsolete count', () => {
  store.getState().resetDraft();
  store.getState().updateItem(0, { target_reps: '30초' });
  assert.equal(store.getState().items[0].effort_kind, 'hold');
  assert.equal(store.getState().items[0].hold_seconds, 30);
  assert.equal(store.getState().items[0].reps, null);
  store.getState().updateItem(0, { target_reps: '5회' });
  assert.equal(store.getState().items[0].effort_kind, 'reps');
  assert.equal(store.getState().items[0].reps, 5);
  assert.equal(store.getState().items[0].hold_seconds, null);
  const before = store.getState().items[0];
  store.getState().updateItem(0, { cue: 'Keep breathing' });
  assert.deepEqual(store.getState().items[0], { ...before, cue: 'Keep breathing' });
});

test('initial, added, cleared, and reset manual items have structured counts', () => {
  store.getState().resetDraft();
  assert.equal(store.getState().items[0].reps, 12);
  assert.equal(store.getState().addItem({ ...manualItem, target_reps: '20초' }), true);
  assert.equal(store.getState().items[1].hold_seconds, 20);
  assert.equal(store.getState().items[1].reps, null);
  store.getState().removeItem(1);
  store.getState().removeItem(0);
  assert.equal(store.getState().items[0].reps, 10);
  store.getState().resetDraft();
  assert.equal(store.getState().items[0].reps, 12);
});

test('normalization repairs stale saved fields and enforces effort limits', () => {
  for (const [label, kind, reps, hold] of [
    ['5회', 'reps', 5, null], ['30초 (각)', 'hold', null, 30],
    ['0회', 'reps', 1, null], ['999회', 'reps', 50, null],
    ['999초', 'hold', null, 300], ['', 'reps', 10, null],
  ]) {
    const input = { ...manualItem, target_reps: label, effort_kind: 'reps', reps: 15, hold_seconds: 99 };
    const result = normalizeCoachItem(input);
    assert.equal(result.effort_kind, kind);
    assert.equal(result.reps, reps);
    assert.equal(result.hold_seconds, hold);
    assert.deepEqual(normalizeCoachItem(result), result);
    assert.equal(input.reps, 15);
  }
});

test('createHomework normalizes every atomic RPC item without synthetic DB fields', async () => {
  let submittedItems;
  let requestId;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'trainer' } } }) },
    rpc: async (name, args) => {
      assert.equal(name, 'create_homework_v2');
      submittedItems = args.p_items;
      requestId = args.p_request_id;
      return { data: { success: true, id: 'homework' }, error: null };
    },
    from(table) {
      assert.equal(table, 'homework');
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => ({ data: { id: 'homework' }, error: null }),
      };
      return query;
    },
  };
  const { createHomework } = loadModule('lib/db.ts', {
    '@/lib/supabase/client': { createClient: () => supabase },
  });
  await createHomework({
    member_id: 'member', why: '', token: 'test-token', token_expires_at: '2026-10-01',
    items: [
      { ...manualItem, order_index: 1 },
      { ...manualItem, order_index: 2, target_reps: '30초' },
      { ...manualItem, order_index: 3, target_reps: '5회', reps: 15 },
    ],
  });
  assert.equal(submittedItems.length, 3);
  assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(submittedItems.map(({ reps }) => reps), [12, null, 5]);
  assert.equal(submittedItems[1].hold_seconds, 30);
  for (const row of submittedItems) {
    assert.equal(Object.hasOwn(row, 'id'), false);
    assert.equal(Object.hasOwn(row, 'homework_id'), false);
    assert.equal(Object.hasOwn(row, 'created_at'), false);
    assert.ok(row.effort_kind === 'reps'
      ? Number.isInteger(row.reps) && row.reps >= 1 && row.reps <= 50 && row.hold_seconds === null
      : Number.isInteger(row.hold_seconds) && row.hold_seconds >= 1 && row.hold_seconds <= 300 && row.reps === null);
  }
});
