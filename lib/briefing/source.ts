import 'server-only';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  FeedbackInputSchema,
  PainAreaSchema,
  type FeedbackInput,
} from './types';

/**
 * ⚠️ 이 파일이 기존 DB 와 맞닿는 유일한 지점이다.
 * 테이블·컬럼명은 아래 상수/스키마만 고치면 나머지는 그대로 동작한다.
 * 조회는 로그인한 강사의 세션(RLS)으로 실행되므로 다른 센터 회원은 조회되지 않는다.
 */
const MEMBERS_TABLE = 'members';
const SUBMISSIONS_TABLE = 'homework_submissions';

const MemberRowSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

const SubmissionRowSchema = z.object({
  submitted_at: z.string(),
  completed_sets: z.number().int().min(0),
  prescribed_sets: z.number().int().min(1),
  feel: z.enum(['good', 'okay', 'hurt']).nullable(),
  pain_areas: z.array(z.string()).nullable(),
  pain_score: z.number().int().min(0).max(10).nullable(),
  voice_memo: z.string().nullable(),
});

export interface RecentFeedbackResult {
  memberName: string;
  /** null = 회원은 있으나 제출된 피드백이 없음 (미응답) */
  feedback: FeedbackInput | null;
}

/**
 * 회원의 가장 최근 피드백 1건을 조회한다.
 * - 회원을 찾지 못하면 null
 * - 조회 오류는 throw (호출 측이 폴백 처리)
 */
export async function fetchRecentFeedback(
  memberId: string,
): Promise<RecentFeedbackResult | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  try {
    const supabase = await createClient();

    const memberRes = await supabase
      .from(MEMBERS_TABLE)
      .select('id, name')
      .eq('id', memberId)
      .maybeSingle();
    if (memberRes.error || !memberRes.data) return null;

    const member = MemberRowSchema.safeParse(memberRes.data);
    if (!member.success) return null;

    const submissionRes = await supabase
      .from(SUBMISSIONS_TABLE)
      .select(
        'submitted_at, completed_sets, prescribed_sets, feel, pain_areas, pain_score, voice_memo',
      )
      .eq('member_id', memberId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (submissionRes.error || !submissionRes.data) {
      return { memberName: member.data.name, feedback: null };
    }

    const row = SubmissionRowSchema.parse(submissionRes.data);
    const painAreas = (row.pain_areas ?? []).flatMap((area) => {
      const parsed = PainAreaSchema.safeParse(area);
      return parsed.success ? [parsed.data] : [];
    });

    const feedback = FeedbackInputSchema.parse({
      submittedAt: row.submitted_at,
      completedSets: row.completed_sets,
      prescribedSets: row.prescribed_sets,
      feel: row.feel,
      painAreas,
      painScore: row.pain_score,
      voiceMemo: row.voice_memo,
    });

    return { memberName: member.data.name, feedback };
  } catch {
    return null;
  }
}
