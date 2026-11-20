import 'server-only';
import { z } from 'zod';
import { requireTrainer } from '@/lib/server/auth/session';
import { getServerEnv } from '@/lib/server/env';
import { getBriefingSource } from '@/lib/server/db/repositories/briefing';
import {
  FeedbackInputSchema,
  PainAreaSchema,
  type FeedbackInput,
} from './types';
import { parseFeedbackNote } from '@/lib/feedback-note';
import { summarizeSubmission } from '@/lib/schedule-board';
import { asDataAccessError } from '@/lib/data-access-error';

/**
 * ⚠️ 이 파일이 기존 DB 와 맞닿는 유일한 지점이다.
 * 회원 피드백은 homework_submissions.snapshot(불변) + note 규약(lib/feedback-note.ts)에서 읽는다.
 * 조회는 세션에서 확인한 trainerId 로 스코프되므로 다른 센터 회원은 조회되지 않는다.
 */
const MemberRowSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

/** 불변 제출 스냅샷(v2)에서 브리핑에 필요한 필드만 읽는다. */
const SnapshotSchema = z.object({
  result: z.enum(['complete', 'partial', 'cant']).nullable().optional(),
  discomfort_level: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
  exercises: z
    .array(
      z.object({
        target_sets: z.number().int().min(0).nullable().optional(),
        completed: z.boolean().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

const SubmissionRowSchema = z.object({
  submitted_at: z.string(),
  snapshot: z.unknown(),
});

const MOOD_TO_FEEL = { good: 'good', hard: 'okay', pain: 'hurt' } as const;

export interface RecentFeedbackResult {
  memberName: string;
  /** null = 회원은 있으나 제출된 피드백이 없음 (미응답) */
  feedback: FeedbackInput | null;
}

function toFeedbackInput(submittedAt: string, rawSnapshot: unknown): FeedbackInput | null {
  const snapshot = SnapshotSchema.safeParse(rawSnapshot);
  if (!snapshot.success) return null;

  const note = parseFeedbackNote(snapshot.data.note ?? null);
  const summary = summarizeSubmission(rawSnapshot);

  let completedSets = note.completedSets;
  let prescribedSets = note.totalSets;
  if (completedSets === null || prescribedSets === null) {
    const exercises = snapshot.data.exercises ?? [];
    const total = exercises.reduce((sum, item) => sum + Math.max(1, item.target_sets ?? 1), 0);
    const done = exercises.reduce(
      (sum, item) => sum + (item.completed ? Math.max(1, item.target_sets ?? 1) : 0),
      0,
    );
    completedSets = done;
    prescribedSets = Math.max(1, total);
  }

  const painAreas = summary.painAreas.flatMap((area) => {
    const parsed = PainAreaSchema.safeParse(area);
    return parsed.success ? [parsed.data] : [];
  });

  const parsed = FeedbackInputSchema.safeParse({
    submittedAt,
    completedSets,
    prescribedSets,
    feel: note.mood ? MOOD_TO_FEEL[note.mood] : null,
    painAreas,
    painScore: summary.painScore,
    voiceMemo: note.memo,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * 회원의 가장 최근 피드백 1건을 조회한다.
 * - 회원을 찾지 못하면(다른 센터 회원 포함, RLS) null
 * - 조회 오류는 DataAccessError 로 던진다. 호출 측이 샘플로 위장하지 않고 실패를 보여준다.
 * - 회원·제출 조회는 서로 독립이므로 병렬로 실행한다 (왕복 1회).
 */
export async function fetchRecentFeedback(
  memberId: string,
): Promise<RecentFeedbackResult | null> {
  const { trainerId } = await requireTrainer();
  let rows: Awaited<ReturnType<typeof getBriefingSource>>;
  try {
    const env = await getServerEnv();
    rows = await getBriefingSource(env.DB, trainerId, memberId);
  } catch (error) {
    console.error('[briefing] 조회 실패', error instanceof Error ? error.message.slice(0, 200) : 'unknown');
    throw asDataAccessError('briefing.read', error);
  }
  if (!rows.member) return null;
  const member = MemberRowSchema.safeParse(rows.member);
  if (!member.success) return null;
  if (!rows.latestSubmission) return { memberName: member.data.name, feedback: null };
  const row = SubmissionRowSchema.safeParse(rows.latestSubmission);
  if (!row.success) return { memberName: member.data.name, feedback: null };
  return {
    memberName: member.data.name,
    feedback: toFeedbackInput(row.data.submitted_at, row.data.snapshot),
  };
}
