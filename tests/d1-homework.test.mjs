import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestDatabase, seedTrainer, snapshotCounts } from './support/d1-sqlite.mjs';
import { createHomework, createMember, homeworkInput, repos, SECRET, TRAINER_A, TRAINER_B } from './support/repositories.mjs';

const { homeworks, publicHomework } = repos;

async function setup() {
  const db = createTestDatabase();
  seedTrainer(db, { id: TRAINER_A, email: 'a@example.test' });
  seedTrainer(db, { id: TRAINER_B, email: 'b@example.test' });
  const member = await createMember(db, TRAINER_A);
  return { db, member };
}

const submission = (token, overrides = {}) => ({
  token,
  completedItemIds: [],
  discomfortLevel: 4,
  note: '기분: 좋음 | 세트: 3/5 | 메모: 허리가 조금 뻐근',
  requestId: crypto.randomUUID(),
  ...overrides,
});

test('homework + all items + idempotency row commit together (atomic batch)', async () => {
  const { db, member } = await setup();
  const before = snapshotCounts(db);
  // Fails inside the batch on the 2nd item (CHECK: reps out of range bypassing zod via direct call shape).
  const failing = homeworkInput(member.id);
  db.beforeStatement = (sql) => {
    if (sql.includes('INSERT INTO homework_items') && (db.itemInserts = (db.itemInserts ?? 0) + 1) === 2) {
      throw new Error('injected failure on exercise_insert_2');
    }
  };
  await assert.rejects(homeworks.createHomework(db, TRAINER_A, failing, SECRET), /injected failure/);
  db.beforeStatement = null;
  assert.deepEqual(snapshotCounts(db), before, 'no partial homework is published');

  const created = await homeworks.createHomework(db, TRAINER_A, failing, SECRET);
  assert.equal(created.success, true);
  const homework = await homeworks.getHomework(db, TRAINER_A, created.id, SECRET);
  assert.equal(homework.items.length, 2);
  assert.equal(homework.token, failing.token, 'trainer can re-copy the link (sealed token opens)');
  assert.deepEqual(homework.items.map((item) => [item.order_index, item.effort_kind, item.reps, item.hold_seconds, item.requirement]), [
    [1, 'reps', 15, null, 'required'],
    [2, 'hold', null, 30, 'optional'],
  ]);
});

test('create is idempotent on request_id, including concurrent retries', async () => {
  const { db, member } = await setup();
  const input = homeworkInput(member.id);
  const results = await Promise.all([1, 2, 3].map(() => homeworks.createHomework(db, TRAINER_A, input, SECRET)));
  const ids = new Set(results.map((result) => result.id));
  assert.equal(ids.size, 1);
  assert.equal(results.filter((result) => result.replayed).length, 2);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM homework').get().n, 1);
  assert.deepEqual(await homeworks.createHomework(db, TRAINER_A, { ...input, why: '다른 이유' }, SECRET), {
    success: false,
    reason: 'request_payload_conflict',
  });
});

test('input boundary rejects blank why, 0/4 items, duplicate or gapped order, no required item', async () => {
  const { db, member } = await setup();
  const base = homeworkInput(member.id);
  const one = base.items[0];
  const cases = {
    invalid_why: { why: '   ' },
    'zero items': { items: [] },
    'four items': { items: [1, 2, 3, 4].map((order_index) => ({ ...one, order_index })) },
    'duplicate order': { items: [one, { ...one }] },
    'gap order': { items: [one, { ...one, order_index: 3 }] },
    'no required item': { items: [{ ...one, requirement: 'optional' }] },
    'expired link': { token_expires_at: new Date(Date.now() - 1000).toISOString() },
    'short token': { token: 'short' },
  };
  const before = snapshotCounts(db);
  for (const [name, overrides] of Object.entries(cases)) {
    const result = await homeworks.createHomework(db, TRAINER_A, { ...base, request_id: crypto.randomUUID(), ...overrides }, SECRET);
    assert.equal(result.success, false, name);
  }
  assert.deepEqual(snapshotCounts(db), before);
});

test('public open: minimal fields only, first open moves sent → opened, no token or trainer data', async () => {
  const { db, member } = await setup();
  const { token, id } = await createHomework(db, TRAINER_A, member.id);
  const opened = await publicHomework.openHomeworkByToken(db, token);
  assert.equal(opened.success, true);
  assert.equal(opened.homework.status, 'opened');
  assert.deepEqual(Object.keys(opened.homework).sort(), ['created_at', 'id', 'status', 'token_expires_at', 'why']);
  assert.deepEqual(opened.member, { name: member.name });
  const serialized = JSON.stringify(opened);
  for (const secret of [token, TRAINER_A, member.phone, 'token_hash', 'token_sealed', 'trainer_id']) {
    assert.equal(serialized.includes(secret), false, `leaked ${secret}`);
  }
  assert.equal((await homeworks.getHomework(db, TRAINER_A, id, SECRET)).status, 'opened');
});

test('token states: missing, tampered, expired and revoked are explicit and change nothing', async () => {
  const { db, member } = await setup();
  const { token, id } = await createHomework(db, TRAINER_A, member.id);
  const expired = await createHomework(db, TRAINER_A, member.id);
  db.sqlite.prepare('UPDATE homework SET token_expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), expired.id);
  const revoked = await createHomework(db, TRAINER_A, member.id);
  assert.equal(await homeworks.revokeHomework(db, TRAINER_A, revoked.id), true);

  assert.equal((await publicHomework.openHomeworkByToken(db, '')).reason, 'not_found');
  assert.equal((await publicHomework.openHomeworkByToken(db, `${token.slice(0, -1)}x`)).reason, 'not_found');
  assert.equal((await publicHomework.openHomeworkByToken(db, expired.token)).reason, 'expired');
  assert.equal((await publicHomework.openHomeworkByToken(db, revoked.token)).reason, 'revoked');

  const before = snapshotCounts(db);
  for (const [value, reason] of [[`${token}x`, 'not_found'], [expired.token, 'expired'], [revoked.token, 'revoked']]) {
    assert.equal((await publicHomework.submitHomeworkByToken(db, submission(value))).reason, reason);
  }
  assert.deepEqual(snapshotCounts(db), before);
  assert.equal((await homeworks.getHomework(db, TRAINER_A, id, SECRET)).status, 'sent');
});

test('submission is atomic: submission, item results, both logs, status and receipt together', async () => {
  const { db, member } = await setup();
  const { token, id } = await createHomework(db, TRAINER_A, member.id);
  const before = snapshotCounts(db);
  db.beforeStatement = (sql) => {
    if (sql.includes("'pain'") || sql.includes('INSERT INTO homework_logs') && db.failNext) throw new Error('injected feedback_insert failure');
  };
  db.failNext = true;
  await assert.rejects(publicHomework.submitHomeworkByToken(db, submission(token)), /injected/);
  db.beforeStatement = null;
  assert.deepEqual(snapshotCounts(db), before, 'no partial receipt / lost pain record');

  const items = (await homeworks.getHomework(db, TRAINER_A, id, SECRET)).items;
  const required = items.find((item) => item.requirement === 'required');
  const result = await publicHomework.submitHomeworkByToken(db, submission(token, { completedItemIds: [required.id] }));
  assert.equal(result.success, true);
  assert.equal(result.result, 'complete', 'optional items do not block completion');
  const after = snapshotCounts(db);
  assert.equal(after.homework_submissions - before.homework_submissions, 1);
  assert.equal(after.homework_item_results - before.homework_item_results, items.length);
  assert.equal(after.homework_logs - before.homework_logs, 2);
  assert.equal(after.homework_submission_requests - before.homework_submission_requests, 1);
  const homework = await homeworks.getHomework(db, TRAINER_A, id, SECRET);
  assert.equal(homework.status, 'logged');
  assert.match(homework.opening_line, /필수 동작을 완료/);
  const pain = homework.logs.find((log) => log.kind === 'pain');
  assert.equal(pain.payload.pain_level, 4);
  const stored = db.sqlite.prepare('SELECT snapshot, snapshot_hash FROM homework_submissions').get();
  assert.equal(stored.snapshot_hash, await repos.tokens.sha256Hex(stored.snapshot));
});

test('same request retried (sequentially and concurrently) is one bundle; other payloads conflict', async () => {
  const { db, member } = await setup();
  const { token } = await createHomework(db, TRAINER_A, member.id);
  const body = submission(token);
  const first = await publicHomework.submitHomeworkByToken(db, body);
  const results = await Promise.all([publicHomework.submitHomeworkByToken(db, body), publicHomework.submitHomeworkByToken(db, body)]);
  for (const result of results) assert.deepEqual(result, first);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM homework_submissions').get().n, 1);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM homework_logs').get().n, 2);
  assert.deepEqual(await publicHomework.submitHomeworkByToken(db, { ...body, discomfortLevel: 9 }), { success: false, reason: 'request_payload_conflict' });
  assert.deepEqual(await publicHomework.submitHomeworkByToken(db, submission(token)), { success: false, reason: 'already_submitted' });
});

test('concurrent submissions with different request ids: exactly one wins', async () => {
  const { db, member } = await setup();
  const { token } = await createHomework(db, TRAINER_A, member.id);
  const results = await Promise.all([1, 2, 3, 4].map(() => publicHomework.submitHomeworkByToken(db, submission(token))));
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(results.filter((result) => result.reason === 'already_submitted').length, 3);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM homework_submissions').get().n, 1);
});

test('revocation wins over a stored receipt (no replay after revoke)', async () => {
  const { db, member } = await setup();
  const { token, id } = await createHomework(db, TRAINER_A, member.id);
  const body = submission(token);
  assert.equal((await publicHomework.submitHomeworkByToken(db, body)).success, true);
  await homeworks.revokeHomework(db, TRAINER_A, id);
  const before = snapshotCounts(db);
  assert.deepEqual(await publicHomework.submitHomeworkByToken(db, body), { success: false, reason: 'revoked' });
  assert.deepEqual(snapshotCounts(db), before);
});

test('invalid submissions are rejected without writes', async () => {
  const { db, member } = await setup();
  const { token } = await createHomework(db, TRAINER_A, member.id);
  const before = snapshotCounts(db);
  const cases = [
    [{ discomfortLevel: 0 }, 'invalid_discomfort_level'],
    [{ discomfortLevel: 11 }, 'invalid_discomfort_level'],
    [{ completedItemIds: ['x', 'x'] }, 'invalid_completed_item_ids'],
    [{ completedItemIds: [crypto.randomUUID()] }, 'invalid_completed_item_ids'],
    [{ requestId: 'not-a-uuid' }, 'invalid_request_id'],
  ];
  for (const [overrides, reason] of cases) {
    assert.deepEqual(await publicHomework.submitHomeworkByToken(db, submission(token, overrides)), { success: false, reason });
  }
  assert.deepEqual(snapshotCounts(db), before);
});

// Replaces the removed in-memory demo tests "demo commits <kind>, discomfort=<n>, and summary together".
for (const kind of ['complete', 'cant']) {
  for (const level of [1, 10]) {
    test(`commits ${kind}, discomfort=${level}, and opening line together`, async () => {
      const { db, member } = await setup();
      const { token, id } = await createHomework(db, TRAINER_A, member.id);
      const items = (await homeworks.getHomework(db, TRAINER_A, id, SECRET)).items;
      const completed = kind === 'complete' ? items.map((item) => item.id) : [];
      const result = await publicHomework.submitHomeworkByToken(db, submission(token, { completedItemIds: completed, discomfortLevel: level }));
      assert.equal(result.result, kind);
      const homework = await homeworks.getHomework(db, TRAINER_A, id, SECRET);
      assert.equal(homework.status, 'logged');
      assert.equal(homework.opening_line, result.opening_line);
      assert.deepEqual(homework.logs.map((log) => log.kind).sort(), [kind, 'pain'].sort());
      assert.equal(homework.logs.find((log) => log.kind === 'pain').payload.pain_level, level);
    });
  }
}
