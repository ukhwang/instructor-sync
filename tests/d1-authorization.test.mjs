import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestDatabase, seedTrainer, snapshotCounts } from './support/d1-sqlite.mjs';
import { createHomework, createMember, homeworkInput, repos, SECRET, TRAINER_A, TRAINER_B } from './support/repositories.mjs';

const { members, homeworks, sessionNotes, progress, lessons, reports } = repos;

const goal = (memberId, overrides = {}) => ({
  request_id: crypto.randomUUID(),
  member_id: memberId,
  name: '플랭크 버티기',
  condition: '허리 통증 없이',
  metric: 'duration',
  direction: 'increase',
  unit: 'seconds',
  target_value: 60,
  definition_version: 1,
  measured_on: '2026-11-01',
  value: 0,
  source: 'trainer_measurement',
  actor: 'member',
  opinion: 'same',
  ...overrides,
});

test('member progress: idempotent goal creation, forced trainer actor, 3 active goals max', async () => {
  const db = createTestDatabase();
  seedTrainer(db, { id: TRAINER_A, email: 'a@example.test' });
  const member = await createMember(db, TRAINER_A);
  const input = goal(member.id);
  const [first, second] = await Promise.all([progress.createProgressGoal(db, TRAINER_A, input), progress.createProgressGoal(db, TRAINER_A, input)]);
  assert.equal(first.success, true);
  assert.deepEqual(second, first);
  assert.deepEqual(await progress.createProgressGoal(db, TRAINER_A, { ...input, target_value: 61 }), { success: false, reason: 'request_conflict' });
  const read = await progress.getMemberProgress(db, TRAINER_A, member.id);
  assert.equal(read.goals.length, 1);
  assert.equal(read.observations[0].actor, 'trainer', 'actor is recorded as trainer regardless of input');
  assert.equal(read.observations[0].value, 0, 'zero is a value, not missing');
  await progress.createProgressGoal(db, TRAINER_A, goal(member.id, { name: '둘' }));
  await progress.createProgressGoal(db, TRAINER_A, goal(member.id, { name: '셋' }));
  assert.deepEqual(await progress.createProgressGoal(db, TRAINER_A, goal(member.id, { name: '넷' })), { success: false, reason: 'active_goal_limit' });
  assert.equal((await progress.createProgressGoal(db, TRAINER_A, goal(member.id, { measured_on: '2999-01-01' }))).reason, 'measured_on_future');
  assert.equal((await progress.createProgressGoal(db, TRAINER_A, goal(member.id, { metric: 'difficulty', unit: 'score_0_10', target_value: 7.5 }))).reason, 'invalid_target_value');
});

test('member progress: corrections append, keep the original and cannot be repeated', async () => {
  const db = createTestDatabase();
  seedTrainer(db, { id: TRAINER_A, email: 'a@example.test' });
  const member = await createMember(db, TRAINER_A);
  const created = await progress.createProgressGoal(db, TRAINER_A, goal(member.id));
  const correction = {
    request_id: crypto.randomUUID(),
    goal_id: created.goal_id,
    definition_version: 1,
    metric: 'duration',
    unit: 'seconds',
    measured_on: '2026-11-01',
    value: 20,
    source: 'trainer_measurement',
    actor: 'trainer',
    supersedes_observation_id: created.observation_id,
    correction_reason: '측정 단위 착오',
  };
  const corrected = await progress.recordProgressObservation(db, TRAINER_A, correction);
  assert.equal(corrected.success, true);
  const again = await progress.recordProgressObservation(db, TRAINER_A, { ...correction, request_id: crypto.randomUUID() });
  assert.equal(again.reason, 'observation_already_corrected');
  const read = await progress.getMemberProgress(db, TRAINER_A, member.id);
  assert.equal(read.observations.length, 2);
  assert.equal(read.observations.find((row) => row.id === created.observation_id).value, 0, 'original evidence retained');
});

test('cross-tenant matrix: trainer B can neither read nor change any of trainer A’s records', async () => {
  const db = createTestDatabase();
  seedTrainer(db, { id: TRAINER_A, email: 'a@example.test' });
  seedTrainer(db, { id: TRAINER_B, email: 'b@example.test' });
  const memberA = await createMember(db, TRAINER_A);
  const memberB = await createMember(db, TRAINER_B);
  const homeworkA = await createHomework(db, TRAINER_A, memberA.id);
  const goalA = await progress.createProgressGoal(db, TRAINER_A, goal(memberA.id));
  const lessonA = (await lessons.createLessons(db, TRAINER_A, {
    seriesId: crypto.randomUUID(), memberId: memberA.id, startsAt: '2026-12-01T10:00:00+09:00', durationMin: 50, repeatWeeks: 0,
  })).lessons[0];
  await sessionNotes.addSessionNote(db, TRAINER_A, memberA.id, 'A 메모');
  const before = snapshotCounts(db);

  // Reads
  assert.equal(await members.getMember(db, TRAINER_B, memberA.id), null);
  assert.deepEqual((await members.listMembers(db, TRAINER_B)).map((member) => member.id), [memberB.id]);
  assert.equal(await homeworks.getHomework(db, TRAINER_B, homeworkA.id, SECRET), null);
  assert.deepEqual(await homeworks.listHomeworks(db, TRAINER_B), []);
  assert.deepEqual(await homeworks.listHomeworks(db, TRAINER_B, { memberId: memberA.id }), []);
  assert.deepEqual(await sessionNotes.listSessionNotes(db, TRAINER_B, memberA.id), []);
  assert.deepEqual(await members.listImportRecords(db, TRAINER_B, memberA.id), []);
  assert.deepEqual(await progress.getMemberProgress(db, TRAINER_B, memberA.id), { success: false, reason: 'member_not_found' });

  // Writes
  assert.equal(await members.updateMember(db, TRAINER_B, memberA.id, { name: '탈취' }), null);
  assert.equal(await homeworks.revokeHomework(db, TRAINER_B, homeworkA.id), false);
  assert.deepEqual(await homeworks.createHomework(db, TRAINER_B, homeworkInput(memberA.id), SECRET), { success: false, reason: 'member_not_found' });
  assert.equal(
    (await homeworks.createHomework(db, TRAINER_B, homeworkInput(memberB.id, { source_homework_id: homeworkA.id }), SECRET)).reason,
    'source_homework_not_found',
  );
  assert.equal(await sessionNotes.addSessionNote(db, TRAINER_B, memberA.id, '침입'), null);
  assert.equal((await progress.createProgressGoal(db, TRAINER_B, goal(memberA.id))).reason, 'member_not_found');
  assert.equal((await progress.recordProgressObservation(db, TRAINER_B, {
    request_id: crypto.randomUUID(), goal_id: goalA.goal_id, definition_version: 1, metric: 'duration', unit: 'seconds',
    measured_on: '2026-11-01', value: 1, source: 'trainer_measurement', actor: 'trainer',
  })).reason, 'goal_not_found');
  for (const attempt of [
    () => lessons.completeLesson(db, TRAINER_B, lessonA.id),
    () => lessons.revertLessonCompletion(db, TRAINER_B, lessonA.id),
    () => lessons.setLessonStatus(db, TRAINER_B, lessonA.id, 'cancelled'),
    () => lessons.rescheduleLesson(db, TRAINER_B, { lessonId: lessonA.id, startsAt: '2026-12-02T10:00:00+09:00', durationMin: 50 }),
  ]) {
    assert.equal((await attempt()).reason, 'lesson_not_found');
  }
  assert.equal((await lessons.createLessons(db, TRAINER_B, {
    seriesId: crypto.randomUUID(), memberId: memberA.id, startsAt: '2026-12-03T10:00:00+09:00', durationMin: 50, repeatWeeks: 0,
  })).reason, 'member_not_found');
  assert.equal(await homeworks.linkHomeworkToLesson(db, TRAINER_B, homeworkA.id, lessonA.id), false);
  assert.deepEqual(await reports.createMilestoneReport(db, TRAINER_B, memberA.id), { success: false, reason: 'member_not_found' });

  assert.deepEqual(snapshotCounts(db), before, 'no cross-tenant write changed any row');
  // Positive control: the owner still can.
  assert.equal((await members.getMember(db, TRAINER_A, memberA.id)).id, memberA.id);
  assert.equal(await homeworks.linkHomeworkToLesson(db, TRAINER_A, homeworkA.id, lessonA.id), true);
});

test('lesson link cannot cross members of the same trainer', async () => {
  const db = createTestDatabase();
  seedTrainer(db, { id: TRAINER_A, email: 'a@example.test' });
  const one = await createMember(db, TRAINER_A);
  const two = await createMember(db, TRAINER_A, { name: '다른 회원' });
  const homework = await createHomework(db, TRAINER_A, one.id);
  const lesson = (await lessons.createLessons(db, TRAINER_A, {
    seriesId: crypto.randomUUID(), memberId: two.id, startsAt: '2026-12-01T10:00:00+09:00', durationMin: 50, repeatWeeks: 0,
  })).lessons[0];
  assert.equal(await homeworks.linkHomeworkToLesson(db, TRAINER_A, homework.id, lesson.id), false);
  assert.throws(() => db.sqlite.prepare('UPDATE homework SET lesson_id = ? WHERE id = ?').run(lesson.id, homework.id), /lesson_not_found/);
});

test('signup invitation is single-use and expiring', async () => {
  const db = createTestDatabase();
  const hash = await repos.invites.emailHash('  Coach@Example.TEST ');
  db.sqlite.prepare('INSERT INTO signup_allowlist (email_hash, expires_at) VALUES (?, ?)').run(hash, new Date(Date.now() + 60_000).toISOString());
  const claims = await Promise.all([1, 2].map(() => repos.invites.claimSignupInvite(db, 'coach@example.test')));
  assert.deepEqual(claims.sort(), [false, true]);
  assert.equal(await repos.invites.claimSignupInvite(db, 'stranger@example.test'), false);
  const expired = await repos.invites.emailHash('late@example.test');
  db.sqlite.prepare('INSERT INTO signup_allowlist (email_hash, expires_at) VALUES (?, ?)').run(expired, new Date(Date.now() - 1).toISOString());
  assert.equal(await repos.invites.claimSignupInvite(db, 'late@example.test'), false);
});
