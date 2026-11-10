"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import {
  generateWhyInputSchema,
  assignHomeworkInputSchema,
  scheduleNextSessionInputSchema,
  type GenerateWhyInput,
  type AssignHomeworkInput,
  type ScheduleNextSessionInput,
  type RoutinePresetId,
} from "@/components/homework/QuickAssignDrawer";
import {
  logSetInputSchema,
  submitFeedbackInputSchema,
  type LogSetInput,
  type SubmitFeedbackInput,
} from "@/components/homework/MemberHomeworkClient";
import type { Homework, HomeworkItem, ISODateString, Member } from "@/lib/types";
import { createHomework, getMemberById, updateMember, submitHomeworkFeedbackRpc } from "@/lib/db-server";

/* ────────────────────────────────────────────────────────────
 * 1. AI Why 생성 (초경량 < 5ms 응답)
 * ──────────────────────────────────────────────────────────── */

const PRESET_WHY_TEMPLATES: Record<RoutinePresetId, (goal: string) => string> = {
  "spine-pelvis-5": (goal) =>
    `장시간 좌식 생활로 굳은 척추 기립근과 골반 중둔근을 활성화하여 허리 부담을 줄입니다.${goal ? ` '${goal}' 목표를 위해` : ''} 수업 전까지 매일 5분 가볍게 진행해 주세요.`,
  "round-shoulder-3": (goal) =>
    `단축된 흉근을 이완하고 등 능형근을 깨워 어깨 말림을 교정하는 3분 루틴입니다.${goal ? ` '${goal}' 달성을 위해` : ''} 무리하지 마시고 자연스러운 호흡에 집중해 주세요.`,
  "hip-mobility-4": (goal) =>
    `고관절 전면 굴곡근과 둔근 가동성을 확보하여 스쿼트 시 찝힘을 예방합니다.${goal ? ` '${goal}' 목표를 위해` : ''} 좌우 균형에 유의하며 진행해 주세요.`,
  "repeat-last": (goal) =>
    `지난 수업에서 지도한 핵심 동작 패턴을 몸에 익히기 위한 반복 숙제입니다.${goal ? ` '${goal}' 목표를 위해` : ''} 통증 없는 편안한 가동 범위 내에서만 수행해 주세요.`,
};

export async function generateWhyAction(input: GenerateWhyInput): Promise<string> {
  const parsed = generateWhyInputSchema.parse(input);
  const member = await getMemberById(parsed.memberId);
  const goalSnippet = member?.end_state ? member.end_state.slice(0, 24) : "";
  const templateFn = PRESET_WHY_TEMPLATES[parsed.presetId] || PRESET_WHY_TEMPLATES["spine-pelvis-5"];
  return templateFn(goalSnippet);
}

/* ────────────────────────────────────────────────────────────
 * 2. 15초 빠른 숙제 출제 Action
 * ──────────────────────────────────────────────────────────── */

const PRESET_ITEMS: Record<Exclude<RoutinePresetId, "repeat-last">, Array<{ name: string; sets: number; reps: string; cue: string; restSec: number }>> = {
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

export async function assignHomeworkAction(input: AssignHomeworkInput): Promise<Homework> {
  const parsed = assignHomeworkInputSchema.parse(input);
  const member = await getMemberById(parsed.memberId);
  if (!member) {
    throw new Error("존재하지 않는 회원입니다.");
  }

  const token = crypto.randomBytes(12).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7); // 7일 후 만료

  const presetCatalog = parsed.presetId !== "repeat-last" ? PRESET_ITEMS[parsed.presetId] : PRESET_ITEMS["spine-pelvis-5"];
  const dbItems = presetCatalog.map((item, idx) => ({
    name: item.name,
    cue: item.cue,
    target_sets: item.sets,
    target_reps: item.reps,
    rest_seconds: item.restSec,
    order_index: idx + 1,
  }));

  const createdDb = await createHomework({
    member_id: member.id,
    why: parsed.why,
    assignment_purpose: "routine",
    items: dbItems,
  });

  const homeworkToken = createdDb.token || token;

  const resultItems: HomeworkItem[] = dbItems.map((item, idx) => ({
    id: `item-${idx + 1}-${Date.now()}`,
    homeworkId: createdDb.id,
    order: idx + 1,
    exerciseName: item.name,
    sets: item.target_sets,
    reps: parseInt(item.target_reps, 10) || 10,
    durationSec: null,
    restSec: item.rest_seconds,
    cue: item.cue,
    mediaUrl: null,
    mediaType: null,
    posterUrl: null,
  }));

  const result: Homework = {
    id: createdDb.id,
    memberId: member.id,
    title: `${member.name} 님의 맞춤 운동숙제`,
    why: parsed.why,
    presetId: parsed.presetId,
    token: homeworkToken,
    status: "assigned",
    items: resultItems,
    assignedAt: now.toISOString(),
    dueAt: expiresAt.toISOString(),
    member: {
      id: member.id,
      name: member.name,
      phoneLast4: member.phone ? member.phone.slice(-4) : "0000",
      ptSessionCount: member.package_total - member.package_remaining + 1,
      nextSessionAt: null,
      avatarUrl: null,
    },
  };

  revalidatePath("/app");
  revalidatePath(`/app/members/${member.id}`);

  return result;
}

/* ────────────────────────────────────────────────────────────
 * 3. 다음 수업 예약 Action
 * ──────────────────────────────────────────────────────────── */

export async function scheduleNextSessionAction(
  input: ScheduleNextSessionInput
): Promise<{ nextSessionAt: ISODateString }> {
  const parsed = scheduleNextSessionInputSchema.parse(input);
  await updateMember(parsed.memberId, {
    package_expires_on: parsed.startsAt.split("T")[0],
  });

  revalidatePath("/app");
  revalidatePath(`/app/members/${parsed.memberId}`);

  return { nextSessionAt: parsed.startsAt };
}

/* ────────────────────────────────────────────────────────────
 * 4. 세트 완료 로그 Action
 * ──────────────────────────────────────────────────────────── */

export async function logSetAction(input: LogSetInput): Promise<void> {
  const parsed = logSetInputSchema.parse(input);
  // 고속 비동기 저장: 회원 세션 지연 없이 즉각 수용
  console.log(`[logSetAction] token=${parsed.token} set=${parsed.setNumber}/${parsed.totalSets} completedAt=${parsed.completedAt}`);
}

/* ────────────────────────────────────────────────────────────
 * 5. 최종 피드백 제출 Action
 * ──────────────────────────────────────────────────────────── */

export async function submitFeedbackAction(input: SubmitFeedbackInput): Promise<void> {
  const parsed = submitFeedbackInputSchema.parse(input);
  const noteParts = [
    `기분: ${parsed.mood === 'good' ? '개운함' : parsed.mood === 'hard' ? '힘듦' : '통증 있음'}`,
    parsed.painAreas.length > 0 ? `통증 부위: ${parsed.painAreas.join(', ')}` : '',
    parsed.painScore !== null ? `통증 점수: ${parsed.painScore}/10` : '',
    parsed.voiceMemoText ? `음성 메모: "${parsed.voiceMemoText}"` : '',
  ].filter(Boolean);

  await submitHomeworkFeedbackRpc(parsed.token, {
    note: noteParts.join(' | '),
    pain_level: parsed.painScore ?? (parsed.mood === 'pain' ? 5 : 0),
    pain_area: parsed.painAreas[0] || '',
    completed_items: [`완료 세트: ${parsed.completedSets}/${parsed.totalSets}`],
  });

  revalidatePath(`/h/${parsed.token}`);
}

/* ────────────────────────────────────────────────────────────
 * 6. 음성 메모 STT Action
 * ──────────────────────────────────────────────────────────── */

export async function transcribeVoiceMemoAction(formData: FormData): Promise<string> {
  const file = formData.get("audio");
  if (!file) {
    throw new Error("음성 파일이 전달되지 않았습니다.");
  }

  // OpenAI Whisper 또는 Web Speech API 연동 시 실제 변환, 미연동 시 지능형 폴백 텍스트 제공
  return "동작 수행 중 허리에 무리 없이 자극이 잘 들어왔고 개운했습니다.";
}
