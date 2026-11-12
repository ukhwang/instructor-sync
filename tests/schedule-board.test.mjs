import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const note = loadModule('lib/feedback-note.ts');
const schemas = loadModule('lib/schedule-schemas.ts');
const board = loadModule('lib/schedule-board.ts');

test('피드백 note 는 왕복 직렬화된다 (구분자 포함 메모도 깨지지 않음)', () => {
  const composed = note.composeFeedbackNote({
    mood: 'pain', painAreas: ['허리', '무릎'], painScore: 6, completedSets: 7, totalSets: 9,
    memo: '2세트에서 | 허리가\n뻐근했어요',
  });
  assert.equal(composed, '기분: 아픔 | 부위: 허리, 무릎 | 통증: 6/10 | 세트: 7/9 | 메모: 2세트에서 / 허리가 뻐근했어요');
  const parsed = note.parseFeedbackNote(composed);
  assert.equal(parsed.mood, 'pain');
  assert.deepEqual(parsed.painAreas, ['허리', '무릎']);
  assert.equal(parsed.painScore, 6);
  assert.equal(parsed.completedSets, 7);
  assert.equal(parsed.totalSets, 9);
  assert.equal(parsed.memo, '2세트에서 / 허리가 뻐근했어요');
});

test('이전 자유 텍스트 note 는 메모로만 해석한다', () => {
  const parsed = note.parseFeedbackNote('허리가 좀 뻐근했어요');
  assert.equal(parsed.mood, null);
  assert.equal(parsed.painScore, null);
  assert.equal(parsed.memo, '허리가 좀 뻐근했어요');
});

test('통증 점수 0~10 → discomfort_level 1~10', () => {
  assert.equal(note.toDiscomfortLevel(null), 1);
  assert.equal(note.toDiscomfortLevel(0), 1);
  assert.equal(note.toDiscomfortLevel(1), 1);
  assert.equal(note.toDiscomfortLevel(7), 7);
  assert.equal(note.toDiscomfortLevel(10), 10);
});

test('KST 날짜 계산: 일요일 밤 23시(KST)는 같은 주 월요일에 속한다', () => {
  // 2026-11-22(일) 23:30 KST = 2026-11-22T14:30Z
  assert.equal(schemas.kstDateOf('2026-11-22T14:30:00Z'), '2026-11-22');
  assert.equal(schemas.mondayOf('2026-11-22T14:30:00Z'), '2026-11-16');
  // 2026-11-23(월) 00:30 KST = 2026-11-22T15:30Z
  assert.equal(schemas.mondayOf('2026-11-22T15:30:00Z'), '2026-11-23');
  assert.equal(schemas.kstMinutesOfDay('2026-11-16T10:30:00+09:00'), 630);
  assert.equal(schemas.kstIso('2026-11-16', 570), '2026-11-16T09:30:00+09:00');
  assert.equal(schemas.weekStartSchema.safeParse('2026-11-16').success, true);
  assert.equal(schemas.weekStartSchema.safeParse('2026-11-17').success, false);
});

test('예약 입력: 운영 시간 밖은 거부', () => {
  const base = {
    seriesId: '7d0b8c1e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
    memberId: '6c9a7b2e-3d4f-4a1b-8c2d-1e2f3a4b5c6d',
    durationMin: 50,
    repeatWeeks: 0,
  };
  assert.equal(schemas.createLessonsInputSchema.safeParse({ ...base, startsAt: '2026-11-16T09:00:00+09:00' }).success, true);
  assert.equal(schemas.createLessonsInputSchema.safeParse({ ...base, startsAt: '2026-11-16T21:10:00+09:00' }).success, true);
  assert.equal(schemas.createLessonsInputSchema.safeParse({ ...base, startsAt: '2026-11-16T21:30:00+09:00' }).success, false);
  assert.equal(schemas.createLessonsInputSchema.safeParse({ ...base, startsAt: '2026-11-16T08:30:00+09:00' }).success, false);
});

test('뱃지 우선순위: 통증 > 완료 > 진행 중 > 없음', () => {
  const pain = { result: 'complete', painScore: 6, painAreas: ['허리'] };
  assert.equal(board.deriveHomeworkBadge({ hasHomework: true, submission: pain }), 'pain');
  assert.equal(board.deriveHomeworkBadge({ hasHomework: true, submission: { ...pain, painScore: 5 } }), 'done');
  assert.equal(board.deriveHomeworkBadge({ hasHomework: true, submission: { result: 'partial', painScore: null, painAreas: [] } }), 'in_progress');
  assert.equal(board.deriveHomeworkBadge({ hasHomework: true, submission: null }), 'in_progress');
  assert.equal(board.deriveHomeworkBadge({ hasHomework: false, submission: null }), 'none');
});

test('제출 스냅샷 요약: note 우선, 없으면 discomfort_level 사용', () => {
  const fromNote = board.summarizeSubmission({
    result: 'partial', discomfort_level: 3, note: '기분: 아픔 | 부위: 어깨 | 통증: 8/10 | 세트: 2/6',
  });
  assert.deepEqual(fromNote, { result: 'partial', painScore: 8, painAreas: ['어깨'] });
  const legacy = board.summarizeSubmission({ result: 'complete', discomfort_level: 7, note: null });
  assert.deepEqual(legacy, { result: 'complete', painScore: 7, painAreas: [] });
  assert.deepEqual(board.summarizeSubmission(null), { result: null, painScore: null, painAreas: [] });
});

test('주간 보드: 수업 시작 전 마지막 숙제 기준으로 뱃지를 계산한다', () => {
  const member = { id: 'm1', name: '이수진', package_remaining: 3, package_total: 10 };
  const result = board.assembleWeekBoard({
    weekStart: '2026-11-16',
    now: new Date('2026-11-16T00:00:00Z'),
    lessons: [
      { id: 'l2', member_id: 'm1', starts_at: '2026-11-19T10:00:00+09:00', ends_at: '2026-11-19T10:50:00+09:00', status: 'scheduled' },
      { id: 'l1', member_id: 'm1', starts_at: '2026-11-16T10:00:00+09:00', ends_at: '2026-11-16T10:50:00+09:00', status: 'completed' },
      { id: 'ghost', member_id: 'unknown', starts_at: '2026-11-17T10:00:00+09:00', ends_at: '2026-11-17T10:50:00+09:00', status: 'scheduled' },
    ],
    members: [member],
    homeworks: [
      { id: 'h-old', member_id: 'm1', created_at: '2026-11-12T11:00:00+09:00', status: 'logged', revoked_at: null },
      { id: 'h-new', member_id: 'm1', created_at: '2026-11-16T11:00:00+09:00', status: 'sent', revoked_at: null },
      { id: 'h-revoked', member_id: 'm1', created_at: '2026-11-17T11:00:00+09:00', status: 'revoked', revoked_at: '2026-11-17T12:00:00+09:00' },
    ],
    submissions: [
      { homework_id: 'h-old', submitted_at: '2026-11-14T20:00:00+09:00', snapshot: { result: 'complete', discomfort_level: 1, note: '기분: 좋음 | 세트: 9/9' } },
    ],
  });
  assert.deepEqual(result.lessons.map((lesson) => lesson.id), ['l1', 'l2']);
  const [first, second] = result.lessons;
  assert.equal(first.badge, 'done');
  assert.equal(first.homeworkSummary, '숙제 완료');
  assert.equal(second.badge, 'in_progress', '11/16 수업에서 낸 숙제는 아직 미제출, 회수된 숙제는 무시');
  assert.equal(second.homeworkSummary, '숙제 진행 중 (미제출)');
  assert.equal(second.packageRemaining, 3);
  assert.equal(schemas.weekBoardSchema.safeParse(result).success, true);
});
