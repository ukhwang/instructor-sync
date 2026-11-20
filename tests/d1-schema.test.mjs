import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestDatabase, migrationFiles, seedTrainer, snapshotCounts } from './support/d1-sqlite.mjs';
import { createMember, createHomework, repos, TRAINER_A, TRAINER_B } from './support/repositories.mjs';

function setup() {
  const db = createTestDatabase();
  seedTrainer(db, { id: TRAINER_A, email: 'a@example.test' });
  seedTrainer(db, { id: TRAINER_B, email: 'b@example.test' });
  return db;
}

test('migrations are ordered wrangler files 0001..0007 and apply cleanly', () => {
  assert.deepEqual(migrationFiles(), [
    '0001_init.sql',
    '0002_homework_submissions.sql',
    '0003_member_onboarding.sql',
    '0004_member_progress.sql',
    '0005_exercise_catalog.sql',
    '0006_lessons.sql',
    '0007_milestone_reports.sql',
  ]);
  const db = setup();
  const fk = db.sqlite.prepare('PRAGMA foreign_key_check').all();
  assert.deepEqual(fk, []);
});

test('SQL bypass still rejects cross-trainer parents, invalid names, counts and orders', async () => {
  const db = setup();
  const memberA = await createMember(db, TRAINER_A);
  const before = snapshotCounts(db);
  const now = new Date().toISOString();
  const invalidWrites = {
    'cross-trainer homework parent': () =>
      db.sqlite.prepare(`INSERT INTO homework (id, trainer_id, member_id, token_hash, token_expires_at, why) VALUES (?, ?, ?, ?, ?, 'x')`)
        .run(crypto.randomUUID(), TRAINER_B, memberA.id, 'a'.repeat(64), now),
    'cross-trainer session note': () =>
      db.sqlite.prepare('INSERT INTO session_notes (id, trainer_id, member_id, note) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), TRAINER_B, memberA.id, 'x'),
    'blank member name': () =>
      db.sqlite.prepare("INSERT INTO members (id, trainer_id, name, phone) VALUES (?, ?, '   ', '010')").run(crypto.randomUUID(), TRAINER_A),
    'remaining over total': () =>
      db.sqlite.prepare("INSERT INTO members (id, trainer_id, name, phone, package_total, package_remaining) VALUES (?, ?, 'n', '010', 5, 6)").run(crypto.randomUUID(), TRAINER_A),
    'negative remaining': () =>
      db.sqlite.prepare("INSERT INTO members (id, trainer_id, name, phone, package_total, package_remaining) VALUES (?, ?, 'n', '010', 5, -1)").run(crypto.randomUUID(), TRAINER_A),
    'move member to another trainer': () =>
      db.sqlite.prepare('UPDATE members SET trainer_id = ? WHERE id = ?').run(TRAINER_B, memberA.id),
  };
  for (const [name, write] of Object.entries(invalidWrites)) {
    assert.throws(write, /constraint failed|trainer_id_immutable/, name);
  }
  const homework = await createHomework(db, TRAINER_A, memberA.id);
  const afterHomework = snapshotCounts(db);
  for (const [name, orderIndex] of [['fourth item', 4], ['duplicate order', 1]]) {
    assert.throws(
      () => db.sqlite.prepare(`INSERT INTO homework_items (id, homework_id, order_index, name, target_sets, target_reps, effort_kind, reps) VALUES (?, ?, ?, 'x', 1, '1회', 'reps', 1)`)
        .run(crypto.randomUUID(), homework.id, orderIndex),
      /constraint failed/,
      name,
    );
  }
  assert.deepEqual(snapshotCounts(db), afterHomework);
  assert.notDeepEqual(before, afterHomework);
});

test('member link tokens are stored only as sha256 + sealed ciphertext (NV-3)', async () => {
  const db = setup();
  const member = await createMember(db, TRAINER_A);
  const { token, id } = await createHomework(db, TRAINER_A, member.id);
  const row = db.sqlite.prepare('SELECT * FROM homework WHERE id = ?').get(id);
  assert.equal(Object.hasOwn(row, 'token'), false);
  assert.equal(row.token_hash, await repos.tokens.sha256Hex(token));
  assert.equal(JSON.stringify(row).includes(token), false);
  assert.match(row.token_sealed, /^v1\./);
  const dump = JSON.stringify(db.sqlite.prepare('SELECT * FROM homework_assignment_requests').all());
  assert.equal(dump.includes(token), false, 'idempotency payload must not contain the raw token');
});

test('submissions are append-only at the database level', async () => {
  const db = setup();
  const member = await createMember(db, TRAINER_A);
  const { token } = await createHomework(db, TRAINER_A, member.id);
  const result = await repos.publicHomework.submitHomeworkByToken(db, { token, completedItemIds: [], discomfortLevel: 3, note: null, requestId: crypto.randomUUID() });
  assert.equal(result.success, true);
  assert.throws(() => db.sqlite.prepare("UPDATE homework_submissions SET snapshot = '{}'").run(), /submission_immutable/);
});
