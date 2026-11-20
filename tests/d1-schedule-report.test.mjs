import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestDatabase, seedTrainer, snapshotCounts } from './support/d1-sqlite.mjs';
import { createHomework, createMember, repos, TRAINER_A, TRAINER_B } from './support/repositories.mjs';

const { lessons, reports, publicHomework, briefing } = repos;

async function setup() {
  const db = createTestDatabase();
  seedTrainer(db, { id: TRAINER_A, email: 'a@example.test', name: '원장A' });
  seedTrainer(db, { id: TRAINER_B, email: 'b@example.test' });
  const member = await createMember(db, TRAINER_A, { package_total: 10 });
  return { db, member };
}

const lessonInput = (memberId, overrides = {}) => ({
  seriesId: crypto.randomUUID(),
  memberId,
  startsAt: '2026-12-07T10:00:00+09:00',
  durationMin: 50,
  repeatWeeks: 0,
  ...overrides,
});

test('lessons: repeat series is all-or-nothing and replays idempotently', async () => {
  const { db, member } = await setup();
  const input = lessonInput(member.id, { repeatWeeks: 3 });
  const created = await lessons.createLessons(db, TRAINER_A, input);
  assert.equal(created.success, true);
  assert.equal(created.lessons.length, 4);
  assert.deepEqual(created.lessons.map((lesson) => lesson.starts_at.slice(0, 10)), ['2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28']);
  const replay = await lessons.createLessons(db, TRAINER_A, input);
  assert.equal(replay.success, true);
  assert.deepEqual(replay.lessons.map((lesson) => lesson.id), created.lessons.map((lesson) => lesson.id));

  // Week 3 of a new series collides → no week of it is written (one batch).
  const before = snapshotCounts(db);
  const conflict = await lessons.createLessons(db, TRAINER_A, lessonInput(member.id, { startsAt: '2026-11-30T10:20:00+09:00', repeatWeeks: 3 }));
  assert.deepEqual(conflict, { success: false, reason: 'time_conflict' });
  assert.deepEqual(snapshotCounts(db), before);
});

test('lessons: overlap is rejected on create/reschedule/uncancel but cancelled slots are free', async () => {
  const { db, member } = await setup();
  const first = (await lessons.createLessons(db, TRAINER_A, lessonInput(member.id))).lessons[0];
  assert.equal((await lessons.createLessons(db, TRAINER_A, lessonInput(member.id, { startsAt: '2026-12-07T10:30:00+09:00' }))).reason, 'time_conflict');
  const later = (await lessons.createLessons(db, TRAINER_A, lessonInput(member.id, { startsAt: '2026-12-07T11:00:00+09:00' }))).lessons[0];
  assert.equal((await lessons.rescheduleLesson(db, TRAINER_A, { lessonId: later.id, startsAt: '2026-12-07T10:10:00+09:00', durationMin: 50 })).reason, 'time_conflict');
  assert.equal((await lessons.setLessonStatus(db, TRAINER_A, first.id, 'cancelled')).success, true);
  assert.equal((await lessons.rescheduleLesson(db, TRAINER_A, { lessonId: later.id, startsAt: '2026-12-07T10:00:00+09:00', durationMin: 50 })).success, true);
  assert.equal((await lessons.setLessonStatus(db, TRAINER_A, first.id, 'scheduled')).reason, 'time_conflict');
  // Another trainer's calendar is independent.
  const memberB = await createMember(db, TRAINER_B);
  assert.equal((await lessons.createLessons(db, TRAINER_B, lessonInput(memberB.id))).success, true);
});

test('lessons: completing consumes exactly one session even under concurrent duplicates; revert restores it', async () => {
  const { db, member } = await setup();
  const lesson = (await lessons.createLessons(db, TRAINER_A, lessonInput(member.id))).lessons[0];
  const results = await Promise.all([1, 2, 3].map(() => lessons.completeLesson(db, TRAINER_A, lesson.id)));
  assert.ok(results.every((result) => result.success));
  assert.equal(results.filter((result) => result.replayed === false).length, 1);
  assert.ok(results.every((result) => result.package_remaining === 9));
  assert.equal(db.sqlite.prepare('SELECT package_remaining FROM members WHERE id = ?').get(member.id).package_remaining, 9);
  assert.equal((await lessons.setLessonStatus(db, TRAINER_A, lesson.id, 'no_show')).reason, 'invalid_status');
  const reverted = await Promise.all([1, 2].map(() => lessons.revertLessonCompletion(db, TRAINER_A, lesson.id)));
  assert.ok(reverted.every((result) => result.package_remaining === 10));
  assert.equal(db.sqlite.prepare('SELECT package_remaining FROM members WHERE id = ?').get(member.id).package_remaining, 10);
});

test('lessons: week board is trainer-scoped and joins the latest submissions in one batch', async () => {
  const { db, member } = await setup();
  await lessons.createLessons(db, TRAINER_A, lessonInput(member.id, { startsAt: '2026-11-23T10:00:00+09:00' }));
  const { token } = await createHomework(db, TRAINER_A, member.id);
  await publicHomework.submitHomeworkByToken(db, { token, completedItemIds: [], discomfortLevel: 7, note: null, requestId: crypto.randomUUID() });
  const batchesBefore = db.batchCount;
  const rows = await lessons.getWeekBoardRows(db, TRAINER_A, '2026-11-23');
  assert.equal(db.batchCount - batchesBefore, 1, 'one D1 round trip');
  assert.equal(rows.lessons.length, 1);
  assert.equal(rows.members[0].name, member.name);
  assert.equal(rows.submissions.length, 1);
  assert.equal(rows.submissions[0].snapshot.discomfort_level, 7);
  const other = await lessons.getWeekBoardRows(db, TRAINER_B, '2026-11-23');
  assert.deepEqual(other, { lessons: [], members: [], homeworks: [], submissions: [] });
});

test('NV-1: public milestone report never returns the member memo; NV-3: only the token hash is stored', async () => {
  const { db, member } = await setup();
  db.sqlite.prepare('UPDATE members SET package_remaining = 1 WHERE id = ?').run(member.id);
  const { token } = await createHomework(db, TRAINER_A, member.id);
  const memo = '이건 원장만 봐야 하는 비밀 메모';
  await publicHomework.submitHomeworkByToken(db, {
    token,
    completedItemIds: [],
    discomfortLevel: 6,
    note: `기분: 아픔 | 부위: 허리 | 통증: 6/10 | 세트: 2/5 | 메모: ${memo}`,
    requestId: crypto.randomUUID(),
  });
  const created = await reports.createMilestoneReport(db, TRAINER_A, member.id, new Date(Date.now() + 1000));
  assert.equal(created.success, true);
  assert.equal(created.session_number, 9);
  assert.match(created.token, /^[0-9a-f]{24}$/);
  const stored = db.sqlite.prepare('SELECT * FROM milestone_reports').get();
  assert.equal(stored.token_hash, await repos.tokens.sha256Hex(created.token));
  assert.equal(JSON.stringify(stored).includes(created.token), false);

  const opened = await reports.openMilestoneReport(db, created.token, new Date(Date.now() + 2000));
  assert.equal(opened.success, true);
  assert.equal(opened.studio_name, '원장A');
  assert.equal(opened.submissions.length, 1);
  assert.equal(opened.submissions[0].note, '기분: 아픔 | 부위: 허리 | 통증: 6/10 | 세트: 2/5');
  assert.equal(JSON.stringify(opened).includes(memo), false);

  assert.equal(await reports.revokeMilestoneReport(db, TRAINER_B, created.token), false, 'other trainer cannot revoke');
  assert.equal(await reports.revokeMilestoneReport(db, TRAINER_A, created.token), true);
  assert.deepEqual(await reports.openMilestoneReport(db, created.token), { success: false, reason: 'revoked' });
  assert.deepEqual(await reports.openMilestoneReport(db, 'f'.repeat(24)), { success: false, reason: 'not_found' });
  assert.deepEqual(await reports.createMilestoneReport(db, TRAINER_B, member.id), { success: false, reason: 'member_not_found' });
});

test('briefing source reads the latest submission for an owned member only', async () => {
  const { db, member } = await setup();
  const { token } = await createHomework(db, TRAINER_A, member.id);
  await publicHomework.submitHomeworkByToken(db, { token, completedItemIds: [], discomfortLevel: 5, note: null, requestId: crypto.randomUUID() });
  const own = await briefing.getBriefingSource(db, TRAINER_A, member.id);
  assert.equal(own.member.name, member.name);
  assert.equal(own.latestSubmission.snapshot.result, 'cant');
  assert.deepEqual(await briefing.getBriefingSource(db, TRAINER_B, member.id), { member: null, latestSubmission: null });
});
