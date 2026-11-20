import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestDatabase, seedTrainer, snapshotCounts } from './support/d1-sqlite.mjs';
import { registration, repos, TRAINER_A, TRAINER_B } from './support/repositories.mjs';

const { members } = repos;

function setup({ proA = false } = {}) {
  const db = createTestDatabase();
  seedTrainer(db, { id: TRAINER_A, email: 'a@example.test', isPro: proA });
  seedTrainer(db, { id: TRAINER_B, email: 'b@example.test' });
  return db;
}

test('C-1: Free plan member limit (5) is enforced by the server, not only the UI', async () => {
  const db = setup();
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await members.registerMember(db, TRAINER_A, registration({ name: `회원${index}` }))).success, true);
  }
  const before = snapshotCounts(db);
  assert.deepEqual(await members.registerMember(db, TRAINER_A, registration({ name: '여섯째' })), {
    success: false,
    reason: 'free_plan_member_limit',
  });
  assert.deepEqual(snapshotCounts(db), before, 'rejected registration leaves no request/import rows');
  // Another trainer's count is independent.
  assert.equal((await members.registerMember(db, TRAINER_B, registration())).success, true);
});

test('C-1: concurrent registrations cannot exceed the Free plan limit', async () => {
  const db = setup();
  for (let index = 0; index < 4; index += 1) await members.registerMember(db, TRAINER_A, registration({ name: `회원${index}` }));
  const results = await Promise.all([1, 2, 3].map((index) => members.registerMember(db, TRAINER_A, registration({ name: `동시${index}` }))));
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(results.filter((result) => result.reason === 'free_plan_member_limit').length, 2);
  assert.equal((await members.listMembers(db, TRAINER_A)).length, 5);
});

test('C-1: Pro trainers (operator-set) are not limited', async () => {
  const db = setup({ proA: true });
  for (let index = 0; index < 7; index += 1) {
    assert.equal((await members.registerMember(db, TRAINER_A, registration({ name: `회원${index}` }))).success, true);
  }
});

test('registration is idempotent on request_id and rejects a different payload for the same key', async () => {
  const db = setup();
  const input = registration({
    member_kind: 'existing',
    package_total: 20,
    package_remaining: 7,
    import_record: { source_type: 'existing_note', raw_text: '  기존 메모  ', summary: '요약', recorded_from: '2026-01-01', recorded_to: '2026-02-01' },
  });
  const first = await members.registerMember(db, TRAINER_A, input);
  assert.equal(first.success, true);
  assert.equal(first.replayed, false);
  assert.equal(first.member.package_remaining, 7);
  assert.equal(first.import_record.raw_text, '기존 메모');
  const [again, concurrent] = await Promise.all([members.registerMember(db, TRAINER_A, input), members.registerMember(db, TRAINER_A, input)]);
  for (const replay of [again, concurrent]) {
    assert.equal(replay.success, true);
    assert.equal(replay.replayed, true);
    assert.equal(replay.member.id, first.member.id);
  }
  assert.deepEqual(await members.registerMember(db, TRAINER_A, { ...input, name: '다른 이름' }), { success: false, reason: 'request_payload_conflict' });
  assert.equal((await members.listMembers(db, TRAINER_A)).length, 1);
  assert.equal((await members.listImportRecords(db, TRAINER_A, first.member.id)).length, 1);
});

test('a new member ignores a client-sent remaining count; existing members validate it', async () => {
  const db = setup();
  const created = await members.registerMember(db, TRAINER_A, registration({ package_total: 12, package_remaining: 3 }));
  assert.equal(created.member.package_remaining, 12);
  assert.deepEqual(
    await members.registerMember(db, TRAINER_A, registration({ member_kind: 'existing', package_total: 5, package_remaining: 9 })),
    { success: false, reason: 'invalid_package_remaining' },
  );
});

test('NV-2: member updates cannot change ownership, plan or ids; profiles.is_pro is not writable', async () => {
  const db = setup();
  const created = await members.registerMember(db, TRAINER_A, registration());
  for (const forged of [{ trainer_id: TRAINER_B }, { is_pro: true }, { id: crypto.randomUUID() }, { created_at: '2000-01-01' }]) {
    await assert.rejects(members.updateMember(db, TRAINER_A, created.member.id, forged), /Unrecognized key/);
  }
  const updated = await members.updateMember(db, TRAINER_A, created.member.id, { package_remaining: 4, phone: '010-9', end_state: '목표' });
  assert.equal(updated.package_remaining, 4);
  assert.equal(updated.trainer_id, TRAINER_A);
  await assert.rejects(members.updateMember(db, TRAINER_A, created.member.id, { package_remaining: 11 }), (error) => error.reason === 'invalid_member_patch');
  assert.equal((await members.getProfile(db, TRAINER_A)).is_pro, false);
  // No repository exposes a profile/plan writer; the schema only allows operator SQL.
  assert.deepEqual(Object.keys(members).filter((name) => /pro|plan|profile/i.test(name)).sort(), ['ensureProfile', 'getProfile']);
});

test('ensureProfile creates a non-Pro profile once (replaces the Supabase signup trigger)', async () => {
  const db = createTestDatabase();
  db.sqlite.prepare('INSERT INTO "user" (id, name, email) VALUES (?, ?, ?)').run(TRAINER_A, '', 'coach@example.test');
  await members.ensureProfile(db, { id: TRAINER_A, email: 'coach@example.test', name: '' });
  await members.ensureProfile(db, { id: TRAINER_A, email: 'coach@example.test', name: 'x' });
  const profile = await members.getProfile(db, TRAINER_A);
  assert.equal(profile.name, 'coach');
  assert.equal(profile.is_pro, false);
});

test('import records are idempotent and parent-scoped', async () => {
  const db = setup();
  const memberA = (await members.registerMember(db, TRAINER_A, registration())).member;
  const input = { request_id: crypto.randomUUID(), member_id: memberA.id, source_type: 'conversation', raw_text: '대화 기록', summary: null };
  const first = await members.addImportRecord(db, TRAINER_A, input);
  assert.equal(first.success, true);
  assert.deepEqual(await members.addImportRecord(db, TRAINER_A, input), first);
  assert.deepEqual(await members.addImportRecord(db, TRAINER_A, { ...input, raw_text: '다름' }), { success: false, reason: 'request_payload_conflict' });
  assert.deepEqual(await members.addImportRecord(db, TRAINER_B, { ...input, request_id: crypto.randomUUID() }), { success: false, reason: 'member_not_found' });
});

test('session notes are parent-scoped; another trainer cannot attach notes', async () => {
  const db = setup();
  const memberA = (await members.registerMember(db, TRAINER_A, registration())).member;
  assert.equal(await repos.sessionNotes.addSessionNote(db, TRAINER_B, memberA.id, '침입'), null);
  const note = await repos.sessionNotes.addSessionNote(db, TRAINER_A, memberA.id, '  수업 메모  ');
  assert.equal(note.note, '수업 메모');
  assert.deepEqual(await repos.sessionNotes.listSessionNotes(db, TRAINER_B, memberA.id), []);
  assert.equal((await repos.sessionNotes.listSessionNotes(db, TRAINER_A, memberA.id)).length, 1);
});
