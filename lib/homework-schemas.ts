import { z } from "zod";

/* ────────────────────────────────────────────────────────────
 * 운동숙제 공유 Zod 스키마 & 계약 정의 (Server/Client 경계 분리)
 * ──────────────────────────────────────────────────────────── */

export const ROUTINE_PRESET_IDS = [
  "spine-pelvis-5",
  "round-shoulder-3",
  "hip-mobility-4",
  "repeat-last",
] as const;
export type RoutinePresetId = (typeof ROUTINE_PRESET_IDS)[number];

export const customExerciseItemSchema = z.object({
  name: z.string().min(1),
  sets: z.number().int().min(1).default(3),
  reps: z.string().default("10회"),
  cue: z.string().optional().default("통증 없는 범위에서 천천히"),
  coachingTags: z.array(z.string()).optional(),
  /** 별표(★) = 필수. false 면 회원이 건너뛰어도 되는 선택 동작 */
  required: z.boolean().default(true),
  restSec: z.number().int().optional().default(30),
  gifUrl: z.string().optional(),
  posterUrl: z.string().optional(),
});
export type CustomExerciseItem = z.infer<typeof customExerciseItemSchema>;

/** create_homework RPC 계약: 숙제 1건당 동작 1~20개, 필수(★) 1개 이상 */
export const MAX_HOMEWORK_ITEMS = 20;

export const assignHomeworkInputSchema = z
  .object({
    memberId: z.string().min(1),
    /** 스케줄러 원루프: 이 숙제가 출제된 수업 */
    lessonId: z.uuid().nullable().optional(),
    presetId: z.enum(ROUTINE_PRESET_IDS).nullable().optional(),
    repeatFromHomeworkId: z.string().min(1).nullable().optional(),
    why: z.string().optional(),
    tags: z.array(z.string()).optional(),
    customItems: z
      .array(customExerciseItemSchema)
      .max(MAX_HOMEWORK_ITEMS, { message: `운동은 한 번에 최대 ${MAX_HOMEWORK_ITEMS}개까지 보낼 수 있어요` })
      .refine((items) => items.length === 0 || items.some((item) => item.required), {
        message: "별표(★) 필수 동작을 1개 이상 남겨주세요",
      })
      .optional(),
  })
  .refine(
    (value) => (value.customItems && value.customItems.length > 0) || Boolean(value.presetId),
    {
      message: "루틴 프리셋을 고르거나 운동을 1개 이상 추가해주세요",
      path: ["presetId"],
    }
  );
export type AssignHomeworkInput = z.infer<typeof assignHomeworkInputSchema>;

export const generateWhyInputSchema = z.object({
  memberId: z.string().min(1),
  presetId: z.enum(ROUTINE_PRESET_IDS),
});
export type GenerateWhyInput = z.infer<typeof generateWhyInputSchema>;

export const logSetInputSchema = z.object({
  token: z.string().min(1),
  homeworkId: z.string().min(1),
  itemId: z.string().min(1),
  setNumber: z.number().int().positive(),
  totalSets: z.number().int().positive(),
  completedAt: z.string(),
});
export type LogSetInput = z.infer<typeof logSetInputSchema>;

/**
 * 회원 최종 피드백.
 * - requestId: 화면 1회 진입당 고정 UUID → 네트워크 재시도가 중복 제출이 되지 않음 (RPC 멱등키)
 * - completedItemIds: 모든 세트를 끝낸 동작 id (서버가 complete/partial/cant 판정)
 * - 제출 시각은 서버(DB clock)가 기록한다.
 */
export const submitFeedbackInputSchema = z.object({
  token: z.string().min(1).max(128),
  homeworkId: z.string().min(1),
  requestId: z.uuid(),
  mood: z.enum(["good", "hard", "pain"]),
  painAreas: z.array(z.string().min(1).max(10)).max(8),
  painScore: z.number().int().min(0).max(10).nullable(),
  completedItemIds: z.array(z.string().min(1)).max(MAX_HOMEWORK_ITEMS),
  completedSets: z.number().int().nonnegative(),
  totalSets: z.number().int().positive(),
  voiceMemoText: z.string().max(500).nullable().optional(),
});
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackInputSchema>;
