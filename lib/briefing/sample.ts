import { buildBriefing } from './rules';
import type { Briefing, FeedbackInput } from './types';

/** DB 미연결·조회 실패 시 보여주는 데모용 샘플. UI 에는 '샘플 데이터' 표시가 붙는다. */
const SAMPLE_FEEDBACK: FeedbackInput = {
  submittedAt: '2026-11-09T09:30:00.000Z',
  completedSets: 2,
  prescribedSets: 3,
  feel: 'hurt',
  painAreas: ['허리', '고관절'],
  painScore: 5,
  voiceMemo: '브릿지 두 번째 세트부터 일어날 때 찌릿함이 있었어요',
};

export function buildFallbackBriefing(memberId: string, now: Date, memberName: string = '김OO'): Briefing {
  return buildBriefing({
    memberId,
    memberName,
    feedback: SAMPLE_FEEDBACK,
    now,
    source: 'fallback',
  });
}
