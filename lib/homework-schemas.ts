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
  restSec: z.number().int().optional().default(30),
  gifUrl: z.string().optional(),
  posterUrl: z.string().optional(),
});
export type CustomExerciseItem = z.infer<typeof customExerciseItemSchema>;

export const assignHomeworkInputSchema = z
  .object({
    memberId: z.string().min(1),
    presetId: z.enum(ROUTINE_PRESET_IDS).nullable().optional(),
    repeatFromHomeworkId: z.string().min(1).nullable().optional(),
    why: z.string().optional(),
    tags: z.array(z.string()).optional(),
    customItems: z.array(customExerciseItemSchema).optional(),
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

export const scheduleNextSessionInputSchema = z.object({
  memberId: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
});
export type ScheduleNextSessionInput = z.infer<typeof scheduleNextSessionInputSchema>;

export const logSetInputSchema = z.object({
  token: z.string().min(1),
  homeworkId: z.string().min(1),
  itemId: z.string().min(1),
  setNumber: z.number().int().positive(),
  totalSets: z.number().int().positive(),
  completedAt: z.string(),
});
export type LogSetInput = z.infer<typeof logSetInputSchema>;

export const submitFeedbackInputSchema = z.object({
  token: z.string().min(1),
  homeworkId: z.string().min(1),
  mood: z.enum(["good", "hard", "pain"]),
  painAreas: z.array(z.string()),
  painScore: z.number().nullable(),
  completedSets: z.number().int().nonnegative(),
  totalSets: z.number().int().positive(),
  voiceMemoText: z.string().optional(),
  submittedAt: z.string(),
});
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackInputSchema>;
