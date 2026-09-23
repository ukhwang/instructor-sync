import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { burdenMinutesToSeconds, hasRequiredItem, createRequestId, isRequestId, loadInFlightAssignment, saveInFlightAssignment, clearInFlightAssignment } = loadModule('lib/homework-assignment.ts');

test('assignment budget converts only positive minute values to integer seconds', () => {
  assert.equal(burdenMinutesToSeconds('15'), 900);
  assert.equal(burdenMinutesToSeconds(1.5), 90);
  assert.equal(burdenMinutesToSeconds(''), null);
  assert.equal(burdenMinutesToSeconds(0), null);
  assert.equal(burdenMinutesToSeconds('-2'), null);
});

test('assignment requires at least one required item', () => {
  assert.equal(hasRequiredItem([{ requirement: 'optional' }]), false);
  assert.equal(hasRequiredItem([{ requirement: 'optional' }, { requirement: 'required' }]), true);
  assert.equal(hasRequiredItem([{ }]), true);
});

test('request id fallback is a UUID v4 and in-flight assignment is replayable then removable', () => {
  assert.equal(isRequestId(createRequestId()), true);
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) } };
  const assignment = { fingerprint: 'same-payload', request_id: createRequestId(), token: 't'.repeat(24), token_expires_at: '2026-10-01T00:00:00.000Z' };
  saveInFlightAssignment(assignment);
  assert.deepEqual(loadInFlightAssignment('same-payload'), assignment);
  clearInFlightAssignment('same-payload');
  assert.equal(loadInFlightAssignment('same-payload'), null);
  globalThis.window = previousWindow;
});

test('in-flight storage only reuses a complete matching assignment', () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) } };
  const assignment = { fingerprint: 'draft-a', request_id: createRequestId(), token: 'a'.repeat(24), token_expires_at: '2026-10-01T00:00:00.000Z' };
  saveInFlightAssignment(assignment);
  assert.deepEqual(loadInFlightAssignment('draft-a'), assignment);
  assert.equal(loadInFlightAssignment('draft-b'), null);

  values.set('homework-assignment-in-flight-v1', JSON.stringify({ ...assignment, request_id: 'not-a-uuid' }));
  assert.equal(loadInFlightAssignment('draft-a'), null);
  globalThis.window = previousWindow;
});
