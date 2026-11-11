import { z } from 'zod';

/**
 * 브리핑 전용 타입. 기존 lib/types.ts 와 이름이 겹치지 않도록
 * 모든 export 에 Briefing / Feedback 접두를 사용한다.
 * 필드는 기존 UI 계약에 맞춰 camelCase.
 */

export const PAIN_AREAS = ['무릎', '허리', '어깨', '목', '고관절'] as const;
export const PainAreaSchema = z.enum(PAIN_AREAS);
export type PainArea = z.infer<typeof PainAreaSchema>;

/** 회원이 제출한 가장 최근 피드백 (회원 자기 보고) */
export const FeedbackInputSchema = z.object({
  submittedAt: z.string().min(1),
  completedSets: z.number().int().min(0),
  prescribedSets: z.number().int().min(1),
  feel: z.enum(['good', 'okay', 'hurt']).nullable(),
  painAreas: z.array(PainAreaSchema),
  painScore: z.number().int().min(0).max(10).nullable(),
  voiceMemo: z.string().nullable(),
});
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

export const RiskLevelSchema = z.enum(['Safe', 'Caution', 'Danger']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const BriefingSchema = z.object({
  memberId: z.string().min(1),
  memberName: z.string().min(1),
  generatedAt: z.string().min(1),
  /** live: DB 데이터 기반 / fallback: 샘플 데이터 (DB 미연결·조회 실패) */
  source: z.enum(['live', 'fallback']),
  /** 브리핑의 근거가 된 피드백 제출 시각. 피드백이 없으면 null (= 미응답) */
  basedOnFeedbackAt: z.string().nullable(),
  /** 확인 우선순위 표시. 의료적 위험도 판정이 아니다. */
  risk: RiskLevelSchema,
  riskReasons: z.array(z.string()),
  checkpoint: z.object({
    completionRate: z.number().min(0).max(100).nullable(),
    completionLabel: z.string(),
    painChips: z.array(z.string()),
    painScore: z.number().int().min(0).max(10).nullable(),
    memoSummary: z.string().nullable(),
  }),
  modification: z.object({
    avoid: z.array(z.string()),
    mobilityFirst: z.array(z.string()),
    note: z.string(),
  }),
  mentalCare: z.object({
    opening: z.string(),
  }),
});
export type Briefing = z.infer<typeof BriefingSchema>;

export const BriefingRequestSchema = z.object({
  memberId: z.string().min(1).max(64),
});
