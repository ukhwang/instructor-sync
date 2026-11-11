'use server';

import { getMemberBriefing } from '@/lib/briefing/service';
import { BriefingRequestSchema, type Briefing } from '@/lib/briefing/types';

export type BriefingActionResult =
  | { ok: true; data: Briefing }
  | { ok: false; error: string };

/**
 * 요청한 이름 그대로의 Server Action.
 * 페이지 최초 렌더는 Server Component 에서 getMemberBriefing 을 직접 호출하고,
 * 이 액션은 클라이언트에서 "다시 불러오기"가 필요할 때 사용한다.
 */
export async function getMemberBriefingAction(
  input: unknown,
): Promise<BriefingActionResult> {
  const parsed = BriefingRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '잘못된 회원 정보예요.' };
  }
  try {
    const data = await getMemberBriefing(parsed.data.memberId);
    return { ok: true, data };
  } catch {
    return { ok: false, error: '브리핑을 불러오지 못했어요.' };
  }
}
