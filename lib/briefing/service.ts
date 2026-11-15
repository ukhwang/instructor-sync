import 'server-only';
import { buildBriefing } from './rules';
import { buildFallbackBriefing } from './sample';
import { fetchRecentFeedback } from './source';
import type { Briefing } from './types';
import { isDemoMode } from '@/lib/demo';
import { getMemberById } from '@/lib/db-server';
import { DataAccessError, asDataAccessError } from '@/lib/data-access-error';

/**
 * 읽기 경로: Server Component 에서 직접 await 한다.
 * - 회원 확인 + 조회 성공: live 브리핑 (피드백이 없으면 '미응답' 브리핑)
 * - 회원 없음 / 조회 실패:
 *   · 로컬 데모 모드(운영 빌드에서는 항상 false)에서만 source='fallback' 샘플을 보여준다.
 *   · 그 외에는 DataAccessError 를 던진다. 실제 회원 이름에 가짜 통증 기록을 붙여 보여주지 않는다.
 */
export async function getMemberBriefing(memberId: string): Promise<Briefing> {
  const now = new Date();

  let result: Awaited<ReturnType<typeof fetchRecentFeedback>>;
  try {
    result = await fetchRecentFeedback(memberId);
  } catch (error) {
    console.error(
      '[briefing] 피드백 조회 실패',
      error instanceof Error ? error.message : 'unknown error',
    );
    if (isDemoMode()) return demoFallback(memberId, now);
    throw error instanceof DataAccessError ? error : asDataAccessError('briefing.read', error);
  }

  if (result) {
    return buildBriefing({
      memberId,
      memberName: result.memberName,
      feedback: result.feedback,
      now,
      source: 'live',
    });
  }

  if (isDemoMode()) return demoFallback(memberId, now);
  throw asDataAccessError('briefing.member_not_found');
}

async function demoFallback(memberId: string, now: Date): Promise<Briefing> {
  const member = await getMemberById(memberId).catch(() => null);
  return buildFallbackBriefing(memberId, now, member?.name ?? '회원');
}
