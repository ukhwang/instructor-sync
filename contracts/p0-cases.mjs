import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Executable acceptance contracts, NOT a second implementation of the service.
// A future adapter must invoke real validation/services/HTTP and inspect the real
// disposable PostgreSQL database. Never satisfy these with an in-memory model.
const cases = [];
const add = (id, layer, invariant, risk, run) => cases.push({ id, layer, invariant, risk, run });
const denied = (promise, code) => assert.rejects(promise, error => error.code === code);
const newKey = () => randomUUID();

for (const resource of ['members', 'homeworks', 'submissions', 'feedback']) {
  add(`OWN-${resource}`, 'integration', `A cannot read or change B ${resource}`, 'Cross-trainer disclosure or corruption', async f => {
    const id = f.ids.B[resource];
    const before = await f.snapshot();
    await denied(f.read(f.A, resource, id), 'NOT_FOUND');
    await denied(f.update(f.A, resource, id, f.validPatch(resource)), 'NOT_FOUND');
    assert.deepEqual(await f.snapshot(), before);
    assert.equal((await f.read(f.B, resource, id)).id, id); // positive control
  });
}
add('OWN-parent', 'integration', 'A cannot assign homework to B member', 'Forged ownership path', async f => {
  const before = await f.snapshot();
  await denied(f.createHomework(f.A, { ...f.validHomework(), memberId: f.ids.B.members }), 'NOT_FOUND');
  assert.deepEqual(await f.snapshot(), before);
});
for (const point of ['homework_insert', 'exercise_insert_2']) {
  add(`ATOMIC-${point}`, 'integration', 'Homework and all items commit together', 'Partial homework published', async f => {
    const before = await f.snapshot();
    await f.injectFailure(point);
    await denied(f.createHomework(f.A, f.validHomework(3)), 'DB_UNAVAILABLE');
    assert.deepEqual(await f.snapshot(), before);
  });
}
add('ATOMIC-feedback', 'integration', 'Submission, feedback, summary and receipt commit together', 'Lost pain feedback or false receipt', async f => {
  const before = await f.snapshot();
  await f.injectFailure('feedback_insert');
  await denied(f.submit(f.token, f.validSubmission()), 'DB_UNAVAILABLE');
  assert.deepEqual(await f.snapshot(), before);
});
add('IDEM-retry', 'integration', 'Sequential and concurrent same-key retry is one bundle', 'Duplicate completion and pain records', async f => {
  const body = f.validSubmission();
  const first = await f.submit(f.token, body);
  const results = await Promise.all([f.submit(f.token, body), f.submit(f.token, body)]);
  for (const result of results) assert.deepEqual(result, first);
  assert.deepEqual(await f.bundleCounts(), { submissions: 1, feedback: 1, receipts: 1 });
  await denied(f.submit(f.token, { ...body, kind: 'cant' }), 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await f.bundleCounts(), { submissions: 1, feedback: 1, receipts: 1 });
});
add('IDEM-followup', 'integration', 'New key and performed time is a separate observation', 'Legitimate later activity overwritten', async f => {
  const body = f.validSubmission();
  const first = await f.submit(f.token, body);
  const next = await f.submit(f.token, { ...body, requestId: newKey(), performedAt: f.nextPerformedAt });
  assert.notEqual(next.id, first.id);
  const rows = await f.submissions();
  assert.equal(rows.length, 2);
  assert.equal(rows[1].supersedesId, null);
  assert.notEqual(rows[0].observationId, rows[1].observationId);
});
add('HISTORY-correction', 'integration', 'Correction appends and retains original observation', 'Original evidence erased', async f => {
  const original = await f.submit(f.token, f.validSubmission());
  const before = await f.readSubmission(original.id);
  const corrected = await f.correct(f.token, original.id, { requestId: newKey(), expectedVersion: 1, kind: 'cant', note: 'synthetic correction' });
  assert.deepEqual(await f.readSubmission(original.id), before);
  assert.equal(corrected.supersedesId, original.id);
  assert.equal(corrected.observationId, before.observationId);
  assert.equal(corrected.performedAt, before.performedAt);
  assert.equal(corrected.version, 2);
  await denied(f.correct(f.token, original.id, { requestId: newKey(), expectedVersion: 1, kind: 'complete' }), 'VERSION_CONFLICT');
});
for (const [name, value] of [['normal', 'active'], ['missing', null], ['tampered', 'tampered'], ['expired', 'expired'], ['revoked', 'revoked']]) {
  add(`TOKEN-${name}`, 'integration', `Token state ${name} has an explicit internal result`, 'Capability bypass or ambiguous diagnosis', async f => {
    const expected = { normal: 'VALID', missing: 'TOKEN_MISSING', tampered: 'TOKEN_INVALID', expired: 'TOKEN_EXPIRED', revoked: 'TOKEN_REVOKED' }[name];
    assert.equal((await f.resolveToken(value === null ? null : f.tokens[value])).code, expected);
    if (name !== 'normal') {
      const before = await f.snapshot();
      await denied(f.submit(value === null ? null : f.tokens[value], f.validSubmission()), expected);
      assert.deepEqual(await f.snapshot(), before);
    }
  });
}
add('TOKEN-replay-after-revoke', 'integration', 'Revoked token cannot replay a successful receipt', 'Revocation bypass through cache', async f => {
  const body = f.validSubmission();
  await f.submit(f.token, body);
  await f.revoke(f.A);
  const before = await f.snapshot();
  await denied(f.submit(f.token, body), 'TOKEN_REVOKED');
  assert.deepEqual(await f.snapshot(), before);
});
for (const name of ['blank-name', 'long-name', 'zero-items', 'four-items', 'duplicate-order', 'gap-order', 'negative-remaining', 'remaining-over-total']) {
  add(`INPUT-${name}`, 'unit', `Reject ${name} at the actual input boundary`, 'Invalid records enter persistence', async f => {
    assert.equal(await f.validate(name), false);
    assert.equal(await f.validate('valid'), true);
  });
}
add('DB-constraints', 'integration', 'SQL bypass still rejects invalid parent/name/count/order/remaining', 'Validation bypass corrupts DB', async f => {
  for (const invalid of ['cross-trainer', 'blank-name', 'zero-items', 'four-items', 'duplicate-order', 'gap-order', 'negative-remaining', 'remaining-over-total']) {
    const before = await f.snapshot();
    await assert.rejects(f.directInvalidWrite(invalid), e => ['23503', '23514', '23505'].includes(e.code));
    assert.deepEqual(await f.snapshot(), before);
  }
});
add('AUTH-no-session', 'E2E', 'All trainer endpoints reject a missing session', 'Anonymous trainer API access', async f => {
  const before = await f.snapshot();
  const endpoints = await f.trainerEndpointInventory();
  assert.ok(endpoints.length > 0);
  for (const endpoint of endpoints) {
    const response = await f.http(null, endpoint);
    assert.equal(response.status, 401, `${endpoint.method} ${endpoint.path}`);
  }
  assert.deepEqual(await f.snapshot(), before);
});
add('AUTH-escalation', 'E2E', 'Signup/profile fields cannot grant Pro/admin/active privileges', 'Self-service privilege escalation', async f => {
  const before = await f.privilegeSnapshot();
  for (const field of ['is_pro', 'role', 'is_admin', 'active', 'trainer_id']) {
    const response = await f.forgePrivilege(field);
    assert.ok([400, 403].includes(response.status));
  }
  assert.deepEqual(await f.privilegeSnapshot(), before);
});
add('ERROR-outage', 'E2E', 'DB outage is 503, never empty/demo/not-found success', 'Silent data loss and misleading UI', async f => {
  const endpoints = await f.databaseEndpointInventory();
  assert.ok(endpoints.length > 0);
  await f.disconnectDatabase();
  for (const endpoint of endpoints) {
    const response = await f.http(f.A, endpoint);
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'DB_UNAVAILABLE');
    assert.equal(response.body.demo, undefined);
  }
});
add('TOKEN-public-minimum', 'E2E', 'Public HTTP response hides private fields and token state enumeration', 'Private data or capability leaked', async f => {
  const response = await f.publicRead(f.token);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['displayName', 'exercises', 'expiresAt', 'latestSubmission', 'why']);
  assert.equal(response.headers['cache-control'].includes('no-store'), true);
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  const invalid = await Promise.all(['tampered', 'expired', 'revoked'].map(k => f.publicRead(f.tokens[k])));
  for (const result of invalid) assert.deepEqual(result.body, invalid[0].body);
});

export const p0Cases = Object.freeze(cases);
