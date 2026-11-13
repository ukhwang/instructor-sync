import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const report = loadModule('lib/milestone-report.ts');

const base = {
  success: true,
  member_name: '회원A',
  studio_name: null,
  session_number: 10,
  created_at: '2026-11-13T00:00:00Z',
  homeworks: [
    { id: 'h1', created_at: '2026-10-01T00:00:00Z', status: 'logged' },
    { id: 'h2', created_at: '2026-10-08T00:00:00Z', status: 'logged' },
    { id: 'h3', created_at: '2026-10-15T00:00:00Z', status: 'sent' },
  ],
  submissions: [],
};

test('기록이 없으면 수치를 만들지 않고 안내만 한다', () => {
  const view = report.buildMilestoneView(base);
  assert.equal(view.logs.length, 0);
  assert.equal(view.studioName, '담당 원장');
  assert.match(view.summary, /아직 제출한 숙제 기록이 없어요/);
  assert.doesNotMatch(view.summary, /\d+%|추천|완화/);
});

test('실제 제출만으로 달성·통증 요약을 만든다', () => {
  const view = report.buildMilestoneView({
    ...base,
    submissions: [
      { homework_id: 'h1', submitted_at: '2026-10-02T00:00:00Z', result: 'complete', discomfort_level: 6, note: '기분: 아픔 | 부위: 허리 | 통증: 6/10 | 세트: 6/6 | 메모: 비공개 메모' },
      { homework_id: 'h2', submitted_at: '2026-10-09T00:00:00Z', result: 'partial', discomfort_level: 3, note: '기분: 좋음 | 부위: 허리 | 통증: 3/10 | 세트: 2/6' },
    ],
  });
  assert.equal(view.logs.length, 2);
  assert.deepEqual(view.logs.map((l) => [l.completedSets, l.totalSets, l.painScore]), [[6, 6, 6], [2, 6, 3]]);
  assert.ok(view.logs.every((l) => l.voiceMemoText === null), '메모 원문은 리포트에 싣지 않는다');
  assert.equal(
    view.summary,
    '숙제 3번 중 1번을 끝까지 하셨어요. 허리 불편감은 처음 6점, 최근 3점으로 기록됐어요 (10점 만점, 회원 직접 입력). 다음 10회 계획은 담당 원장님과 함께 정해요.',
  );
});

test('통증 기록이 1회면 비교하지 않는다', () => {
  const view = report.buildMilestoneView({
    ...base,
    submissions: [{ homework_id: 'h1', submitted_at: '2026-10-02T00:00:00Z', result: 'complete', discomfort_level: 5, note: '기분: 버거움 | 부위: 무릎 | 통증: 5/10 | 세트: 3/3' }],
  });
  assert.match(view.summary, /무릎 불편감 기록이 1회라 아직 변화를 비교하기 어려워요/);
});

test('이전 포맷(note 없음) 제출은 discomfort_level 과 결과로 해석한다', () => {
  const [log] = report.toReportLogs({
    ...base,
    submissions: [{ homework_id: 'h1', submitted_at: '2026-10-02T00:00:00Z', result: 'complete', discomfort_level: 4, note: null }],
  });
  assert.equal(log.painScore, 4);
  assert.equal(log.completedSets, log.totalSets);
});

test('리포트 토큰 형식과 샘플 리포트', () => {
  assert.equal(report.REPORT_TOKEN_PATTERN.test('a1b2c3d4e5f6a1b2c3d4e5f6'), true);
  assert.equal(report.REPORT_TOKEN_PATTERN.test('rep-123-10'), false);
  const sample = report.openedReportSchema.safeParse(report.buildSampleReport(new Date('2026-11-13T00:00:00Z')));
  assert.equal(sample.success, true);
  assert.equal(report.buildMilestoneView(sample.data).memberName, '샘플 회원');
});
