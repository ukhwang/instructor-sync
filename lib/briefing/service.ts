import 'server-only';
import { buildBriefing } from './rules';
import { buildFallbackBriefing } from './sample';
import { fetchRecentFeedback } from './source';
import type { Briefing } from './types';
import { getMemberById } from '@/lib/db-server';

/**
 * 읽기 경로: Server Component 에서 직접 await 한다.
 * - 회원 확인 + 조회 성공: live 브리핑 (피드백이 없으면 '미응답' 브리핑)
 * - 회원 없음 / 조회 실패: 샘플 폴백. 가짜 데이터를 live 로 위장하지 않도록 source='fallback' 표시.
 */
export async function getMemberBriefing(memberId: string): Promise<Briefing> {
  const now = new Date();
  let resolvedMemberName = '회원';
  try {
    const member = await getMemberById(memberId);
    if (member?.name) {
      resolvedMemberName = member.name;
    }
  } catch {
    // fallback name
  }

  try {
    const result = await fetchRecentFeedback(memberId);
    if (result) {
      return buildBriefing({
        memberId,
        memberName: result.memberName || resolvedMemberName,
        feedback: result.feedback,
        now,
        source: 'live',
      });
    }
  } catch (error) {
    console.error(
      '[briefing] 피드백 조회 실패, 샘플로 대체',
      error instanceof Error ? error.message : 'unknown error',
    );
  }
  return buildFallbackBriefing(memberId, now, resolvedMemberName);
}
