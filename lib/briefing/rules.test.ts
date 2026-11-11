import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessRisk, buildBriefing, buildOpeningLine, completionRate } from './rules';
import { BriefingSchema, type FeedbackInput } from './types';

const base: FeedbackInput = {
  submittedAt: '2026-11-09T09:30:00.000Z',
  completedSets: 3,
  prescribedSets: 3,
  feel: 'good',
  painAreas: [],
  painScore: null,
  voiceMemo: null,
};

const now = new Date('2026-11-11T01:00:00.000Z');

test('피드백이 없으면 미응답이며 수행하지 않았다고 단정하지 않는다', () => {
  const briefing = buildBriefing({
    memberId: 'm1', memberName: '김OO', feedback: null, now, source: 'live',
  });
  assert.equal(briefing.checkpoint.completionLabel, '미응답');
  assert.equal(briefing.checkpoint.completionRate, null);
  assert.equal(briefing.basedOnFeedbackAt, null);
  assert.ok(!briefing.mentalCare.opening.includes('안 하'));
});

test('특이 신호가 없으면 Safe', () => {
  assert.equal(assessRisk(base).level, 'Safe');
});

test('통증 칩만 선택해도 Caution', () => {
  assert.equal(assessRisk({ ...base, painAreas: ['허리'] }).level, 'Caution');
});

test('통증 4~6 은 Caution, 7 이상은 Danger', () => {
  assert.equal(assessRisk({ ...base, painScore: 4 }).level, 'Caution');
  assert.equal(assessRisk({ ...base, painScore: 6 }).level, 'Caution');
  assert.equal(assessRisk({ ...base, painScore: 7 }).level, 'Danger');
});

test('저림·방사 표현은 통증 점수와 무관하게 Danger', () => {
  const result = assessRisk({ ...base, painScore: 2, voiceMemo: '다리가 저려요' });
  assert.equal(result.level, 'Danger');
});

test('찌릿함 표현은 Caution (Danger 아님)', () => {
  const result = assessRisk({ ...base, voiceMemo: '일어날 때 찌릿함' });
  assert.equal(result.level, 'Caution');
});

test('수행률 50% 미만은 Caution', () => {
  const result = assessRisk({ ...base, completedSets: 1, prescribedSets: 3 });
  assert.equal(result.level, 'Caution');
});

test('수행률은 0~100 으로 제한된다', () => {
  assert.equal(completionRate({ ...base, completedSets: 5, prescribedSets: 3 }), 100);
  assert.equal(completionRate({ ...base, completedSets: 2, prescribedSets: 3 }), 67);
});

test('통증 부위가 있으면 주의 동작과 선행 드릴을 제안하고, 제안임을 명시한다', () => {
  const briefing = buildBriefing({
    memberId: 'm1', memberName: '김OO', now, source: 'live',
    feedback: { ...base, painAreas: ['허리', '고관절'], painScore: 5 },
  });
  assert.ok(briefing.modification.avoid.length >= 2);
  assert.ok(briefing.modification.mobilityFirst.length >= 2);
  assert.ok(briefing.modification.note.includes('원장님이 판단'));
});

test('같은 부위가 중복되어도 제안은 중복되지 않는다', () => {
  const briefing = buildBriefing({
    memberId: 'm1', memberName: '김OO', now, source: 'live',
    feedback: { ...base, painAreas: ['무릎', '고관절'] },
  });
  const unique = new Set(briefing.modification.mobilityFirst);
  assert.equal(unique.size, briefing.modification.mobilityFirst.length);
});

test('오프닝 멘트는 보고된 부위를 언급한다', () => {
  const line = buildOpeningLine('김OO', { ...base, painAreas: ['허리'] });
  assert.ok(line.includes('김OO 님'));
  assert.ok(line.includes('허리'));
});

test('긴 메모는 50자로 요약된다', () => {
  const briefing = buildBriefing({
    memberId: 'm1', memberName: '김OO', now, source: 'live',
    feedback: { ...base, voiceMemo: '가'.repeat(80) },
  });
  assert.equal(briefing.checkpoint.memoSummary?.length, 51);
});

test('생성된 브리핑은 스키마를 통과한다', () => {
  const briefing = buildBriefing({
    memberId: 'm1', memberName: '김OO', now, source: 'fallback',
    feedback: { ...base, painAreas: ['어깨'], painScore: 3, voiceMemo: '뻐근해요' },
  });
  assert.equal(BriefingSchema.safeParse(briefing).success, true);
});
