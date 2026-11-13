"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import {
  generateWhyInputSchema,
  assignHomeworkInputSchema,
  logSetInputSchema,
  submitFeedbackInputSchema,
  type GenerateWhyInput,
  type AssignHomeworkInput,
  type RoutinePresetId,
  type LogSetInput,
  type SubmitFeedbackInput,
} from "@/lib/homework-schemas";
import type { Homework, HomeworkItem } from "@/lib/types";
import {
  createHomework,
  getMemberById,
  HomeworkCreationError,
  isPublicDemoToken,
  submitHomeworkFeedbackV2Server,
} from "@/lib/db-server";
import { linkHomeworkToLesson } from "@/lib/schedule-server";
import { getExerciseMedia } from "@/lib/exercise-media";
import { composeFeedbackNote, toDiscomfortLevel } from "@/lib/feedback-note";
import { DataAccessError } from "@/lib/data-access-error";

/* ────────────────────────────────────────────────────────────
 * 결과 타입: Server Action 은 운영 빌드에서 throw 메시지가 마스킹되므로
 * 사용자에게 보여줄 실패는 값으로 돌려준다.
 * ──────────────────────────────────────────────────────────── */

export type AssignHomeworkResult =
  | { ok: true; homework: Homework; lessonLinked: boolean }
  | { ok: false; message: string };

export type SubmitFeedbackResult =
  | { ok: true; alreadySubmitted: boolean }
  | { ok: false; message: string; retryable: boolean };

/* ────────────────────────────────────────────────────────────
 * 1. Why 문장 생성 (규칙 기반, 외부 AI 호출 없음)
 * ──────────────────────────────────────────────────────────── */

const PRESET_WHY_TEMPLATES: Record<RoutinePresetId, (goal: string) => string> = {
  "spine-pelvis-5": (goal) =>
    `장시간 좌식 생활로 굳은 척추 기립근과 골반 중둔근을 활성화하여 허리 부담을 줄입니다.${goal ? ` '${goal}' 목표를 위해` : ""} 수업 전까지 매일 5분 가볍게 진행해 주세요.`,
  "round-shoulder-3": (goal) =>
    `단축된 흉근을 이완하고 등 능형근을 깨워 어깨 말림을 교정하는 3분 루틴입니다.${goal ? ` '${goal}' 달성을 위해` : ""} 무리하지 마시고 자연스러운 호흡에 집중해 주세요.`,
  "hip-mobility-4": (goal) =>
    `고관절 전면 굴곡근과 둔근 가동성을 확보하여 스쿼트 시 찝힘을 예방합니다.${goal ? ` '${goal}' 목표를 위해` : ""} 좌우 균형에 유의하며 진행해 주세요.`,
  "repeat-last": (goal) =>
    `지난 수업에서 지도한 핵심 동작 패턴을 몸에 익히기 위한 반복 숙제입니다.${goal ? ` '${goal}' 목표를 위해` : ""} 통증 없는 편안한 가동 범위 내에서만 수행해 주세요.`,
};

export async function generateWhyAction(input: GenerateWhyInput): Promise<string> {
  const parsed = generateWhyInputSchema.parse(input);
  const member = await getMemberById(parsed.memberId);
  const goalSnippet = member?.end_state ? member.end_state.slice(0, 24) : "";
  const templateFn = PRESET_WHY_TEMPLATES[parsed.presetId] ?? PRESET_WHY_TEMPLATES["spine-pelvis-5"];
  return templateFn(goalSnippet);
}

/* ────────────────────────────────────────────────────────────
 * 2. 빠른 숙제 출제
 * ──────────────────────────────────────────────────────────── */

interface PresetItem {
  name: string;
  sets: number;
  reps: string;
  cue: string;
  restSec: number;
  /** 생략하면 필수 */
  required?: boolean;
}

const PRESET_ITEMS: Record<Exclude<RoutinePresetId, "repeat-last">, PresetItem[]> = {
  "spine-pelvis-5": [
    { name: "버드독 (Bird Dog)", sets: 3, reps: "10회", cue: "허리가 꺾이지 않도록 복부에 긴장을 유지하세요", restSec: 30 },
    { name: "글루트 브릿지 (Glute Bridge)", sets: 3, reps: "15회", cue: "엉덩이를 쥐어짜듯 골반을 수평으로 들어 올립니다", restSec: 30 },
    { name: "데드버그 (Dead Bug)", sets: 2, reps: "12회", cue: "허리가 바닥에서 뜨지 않게 배꼽을 아래로 누르세요", restSec: 30 },
  ],
  "round-shoulder-3": [
    { name: "엎드려 Y-레이즈 (Prone Y-Raise)", sets: 3, reps: "12회", cue: "승모근이 솟지 않게 날개뼈 아래쪽을 모아주세요", restSec: 30 },
    { name: "월 슬라이드 (Wall Slide)", sets: 3, reps: "10회", cue: "팔꿈치와 손등이 벽에서 떨어지지 않게 올립니다", restSec: 30 },
  ],
  "hip-mobility-4": [
    { name: "90-90 고관절 회전 스트레칭", sets: 3, reps: "10회", cue: "양 무릎 90도로 앉아 골반을 천천히 좌우 회전합니다", restSec: 30 },
    { name: "런지 힙 플렉서 스트레칭", sets: 2, reps: "30초 홀드", cue: "앞쪽 무릎을 밀며 뒷다리 앞쪽 고관절을 늘립니다", restSec: 30 },
  ],
};

const HOMEWORK_LINK_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function resolveMedia(name: string): Pick<HomeworkItem, "mediaUrl" | "mediaType" | "posterUrl"> {
  const media = getExerciseMedia(name);
  const mediaUrl = media?.video || media?.animatedFallback || media?.poster || null;
  const mediaType: HomeworkItem["mediaType"] = media?.video ? "video" : mediaUrl ? "image" : null;
  return { mediaUrl, mediaType, posterUrl: media?.poster || null };
}

export async function assignHomeworkAction(input: AssignHomeworkInput): Promise<AssignHomeworkResult> {
  const parsed = assignHomeworkInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요" };
  }
  const data = parsed.data;

  try {
    const member = await getMemberById(data.memberId);
    if (!member) return { ok: false, message: "회원 정보를 찾을 수 없어요." };

    const sourceItems: PresetItem[] =
      data.customItems && data.customItems.length > 0
        ? data.customItems.map((item) => ({
            name: item.name,
            sets: item.sets,
            reps: item.reps,
            cue: item.cue,
            restSec: item.restSec,
            required: item.required,
          }))
        : PRESET_ITEMS[data.presetId && data.presetId !== "repeat-last" ? data.presetId : "spine-pelvis-5"];

    const why =
      data.why?.trim() ||
      PRESET_WHY_TEMPLATES[data.presetId ?? "spine-pelvis-5"](member.end_state?.slice(0, 24) ?? "");

    const token = crypto.randomBytes(12).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOMEWORK_LINK_TTL_MS);

    const created = await createHomework({
      request_id: crypto.randomUUID(),
      member_id: member.id,
      why,
      token,
      token_expires_at: expiresAt.toISOString(),
      assignment_purpose: "routine",
      items: sourceItems.map((item, index) => ({
        order_index: index + 1,
        name: item.name,
        cue: item.cue,
        target_sets: item.sets,
        target_reps: item.reps,
        rest_seconds: item.restSec,
        requirement: item.required === false ? "optional" : "required",
      })),
    });

    // 수업 ↔ 숙제 연결은 부가 정보다. 실패해도 숙제 자체는 유효하므로 결과로만 알린다.
    let lessonLinked = false;
    if (data.lessonId) {
      lessonLinked = await linkHomeworkToLesson({ homeworkId: created.id, lessonId: data.lessonId });
    }

    const items: HomeworkItem[] = sourceItems.map((item, index) => ({
      id: `${created.id}-item-${index + 1}`,
      homeworkId: created.id,
      order: index + 1,
      exerciseName: item.name,
      sets: item.sets,
      reps: Number.parseInt(item.reps, 10) || 10,
      durationSec: null,
      restSec: item.restSec,
      cue: item.cue,
      requirement: item.required === false ? "optional" : "required",
      ...resolveMedia(item.name),
    }));

    const homework: Homework = {
      id: created.id,
      memberId: member.id,
      title: `${member.name} 님의 맞춤 운동숙제`,
      why,
      presetId: data.presetId ?? null,
      token: created.token,
      status: "sent",
      items,
      assignedAt: now.toISOString(),
      dueAt: expiresAt.toISOString(),
      member: {
        id: member.id,
        name: member.name,
        avatarUrl: null,
      },
    };

    revalidatePath("/app");
    revalidatePath("/app/schedules");
    revalidatePath(`/app/members/${member.id}`);

    return { ok: true, homework, lessonLinked };
  } catch (error) {
    if (error instanceof HomeworkCreationError) return { ok: false, message: error.message };
    if (error instanceof DataAccessError) {
      console.error("[assignHomeworkAction] data access failure", error.message);
      return { ok: false, message: "서버에 저장하지 못했어요. 잠시 후 다시 시도해주세요." };
    }
    console.error("[assignHomeworkAction] unexpected failure", error instanceof Error ? error.message : "unknown");
    return { ok: false, message: "숙제를 저장하지 못했어요. 다시 시도해주세요." };
  }
}

/* ────────────────────────────────────────────────────────────
 * 3. 세트 완료 이벤트
 * 세트 단위 이벤트는 저장하지 않는다. 수행 결과는 최종 제출(동작별 완료 여부 +
 * 세트 수)로 한 번에 원자적으로 기록된다. 토큰 원문은 로그에 남기지 않는다.
 * ──────────────────────────────────────────────────────────── */

export async function logSetAction(input: LogSetInput): Promise<void> {
  logSetInputSchema.parse(input);
}

/* ────────────────────────────────────────────────────────────
 * 4. 회원 최종 피드백 제출
 * ──────────────────────────────────────────────────────────── */

const SUBMIT_REASON_MESSAGE: Record<string, { message: string; retryable: boolean }> = {
  not_found: { message: "숙제 링크를 찾을 수 없어요. 선생님께 새 링크를 받아주세요.", retryable: false },
  revoked: { message: "선생님이 이 숙제를 취소했어요.", retryable: false },
  expired: { message: "숙제 기간이 지났어요. 선생님께 새 링크를 받아주세요.", retryable: false },
  invalid_completed_item_ids: { message: "기록 정보가 맞지 않아요. 화면을 새로고침 해주세요.", retryable: false },
  request_payload_conflict: { message: "이미 다른 내용으로 보냈어요. 화면을 새로고침 해주세요.", retryable: false },
};

export async function submitFeedbackAction(input: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
  const parsed = submitFeedbackInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "기록을 다시 확인해주세요", retryable: false };
  }
  const data = parsed.data;

  // 공개 데모 링크는 저장하지 않는다 (공모전 시연용 샘플).
  if (isPublicDemoToken(data.token)) return { ok: true, alreadySubmitted: false };

  const painScore = data.painAreas.length > 0 ? data.painScore : null;
  const note = composeFeedbackNote({
    mood: data.mood,
    painAreas: data.painAreas,
    painScore,
    completedSets: data.completedSets,
    totalSets: data.totalSets,
    memo: data.voiceMemoText?.trim() || null,
  });

  try {
    const outcome = await submitHomeworkFeedbackV2Server({
      token: data.token,
      completedItemIds: data.completedItemIds,
      discomfortLevel: toDiscomfortLevel(painScore),
      note,
      requestId: data.requestId,
    });

    if (outcome.ok) {
      revalidatePath(`/h/${data.token}`);
      revalidatePath("/app");
      revalidatePath("/app/schedules");
      return { ok: true, alreadySubmitted: false };
    }
    if (outcome.reason === "already_submitted") return { ok: true, alreadySubmitted: true };

    const known = SUBMIT_REASON_MESSAGE[outcome.reason];
    if (known) return { ok: false, ...known };
    return { ok: false, message: "전송에 실패했어요. 버튼을 한 번 더 눌러주세요", retryable: true };
  } catch {
    return { ok: false, message: "인터넷 연결을 확인하고 한 번 더 눌러주세요", retryable: true };
  }
}
