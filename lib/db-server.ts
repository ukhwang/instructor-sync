import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, withCoachFields } from "./demo";
import type { ExerciseSnapshot, Homework, Member, OpenHomeworkResult, Profile } from "./types";
import { asDataAccessError } from "./data-access-error";
import { normalizeCoachItem } from "./coach";
import type { AssignmentPurpose, AssignmentRequirement } from "./homework-assignment";

async function withTimeout<T>(promise: PromiseLike<T> | Promise<T>, ms = 4000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise) as Promise<T>,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("supabase-timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const DEMO_TOKEN = "sample-token-demo-active-2026";

const demoProfile: Profile = {
  id: "demo-trainer-id",
  email: "trainer@exercise-homework.com",
  name: "김강사",
  is_pro: false,
  created_at: new Date().toISOString(),
};

function demoMembers(): Member[] {
  return [
    {
      id: "mem-1",
      trainer_id: "demo-trainer-id",
      name: "이수진",
      phone: "010-1234-5678",
      package_total: 10,
      package_remaining: 3,
      package_expires_on: "2026-09-15",
      end_state: "허리 통증 없이 데드리프트 80kg 및 자율 루틴 수행",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "mem-2",
      trainer_id: "demo-trainer-id",
      name: "박민호",
      phone: "010-9876-5432",
      package_total: 20,
      package_remaining: 2,
      package_expires_on: "2026-09-08",
      end_state: "라운드숄더 교정 및 벤치프레스 60kg 통증 없이 달성",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "mem-3",
      trainer_id: "demo-trainer-id",
      name: "정다은",
      phone: "010-5555-7777",
      package_total: 10,
      package_remaining: 8,
      package_expires_on: "2026-10-30",
      end_state: "고관절 찝힘 없는 풀 스쿼트 50kg 완성",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
}

function demoHomeworks(): Homework[] {
  const members = demoMembers();
  const member = members[0];
  return [
    {
      id: "hw-1",
      trainer_id: "demo-trainer-id",
      member_id: member.id,
      token: DEMO_TOKEN,
      token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 12).toISOString(),
      revoked_at: null,
      why: "데드리프트 시 둔근 개입을 높이고 허리 과신전을 방지하기 위함입니다.",
      status: "logged",
      opening_line:
        '지난주에 글루트 브릿지, 힙 힌지 드릴 (벽 터치) 완료하셨고, "2세트 때 허리가 약간 뻐근했어요" 하셔서 오늘은 그 부분부터 볼게요.',
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
      updated_at: new Date().toISOString(),
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        package_remaining: member.package_remaining,
        end_state: member.end_state,
      },
      items: [
        withCoachFields({
          id: "hwi-1",
          homework_id: "hw-1",
          order_index: 1,
          name: "글루트 브릿지",
          cue: "골반을 말아올리며 엉덩이에 힘을 꽉 주고 1초 정지합니다.",
          target_sets: 3,
          target_reps: "15회",
          created_at: new Date().toISOString(),
        }),
        withCoachFields({
          id: "hwi-2",
          homework_id: "hw-1",
          order_index: 2,
          name: "힙 힌지 드릴 (벽 터치)",
          cue: "무릎은 살짝만 굽히고 엉덩이를 뒤쪽 벽으로 밀어냅니다.",
          target_sets: 3,
          target_reps: "12회",
          created_at: new Date().toISOString(),
        }),
      ],
      logs: [
        {
          id: "hwl-1",
          homework_id: "hw-1",
          kind: "complete",
          payload: { note: "2세트 때 허리가 약간 뻐근했어요" },
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        },
      ],
    },
    {
      id: "hw-open",
      trainer_id: "demo-trainer-id",
      member_id: member.id,
      token: "sample-token-demo-open-2026",
      token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      revoked_at: null,
      why: "데드리프트 시 둔근 개입을 높이고 허리 과신전을 방지하기 위함입니다.",
      status: "opened",
      opening_line: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        package_remaining: member.package_remaining,
        end_state: member.end_state,
      },
      items: [
        withCoachFields({
          id: "hwi-open-1",
          homework_id: "hw-open",
          order_index: 1,
          name: "글루트 브릿지",
          cue: "골반을 말아올리며 엉덩이에 힘을 꽉 주고 1초 정지합니다.",
          target_sets: 3,
          target_reps: "15회",
          created_at: new Date().toISOString(),
        }),
      ],
      logs: [],
    },
  ];
}

export async function getCurrentTrainerProfile(): Promise<Profile | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser());

    if (user) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data && !error) return data as Profile;
      return {
        id: user.id,
        email: user.email || null,
        name: user.user_metadata?.name || user.email?.split("@")[0] || "강사",
        is_pro: false,
        created_at: user.created_at,
      };
    }
  } catch {
    // fall through
  }
  return isDemoMode() ? demoProfile : null;
}

export async function getMembers(): Promise<Member[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await withTimeout(
      supabase.from("members").select("*").order("created_at", { ascending: false })
    );

    if (error) throw asDataAccessError("members.list", error);
    return (data || []) as Member[];
  } catch (error) {
    if (!isDemoMode()) throw asDataAccessError("members.list", error);
  }
  return isDemoMode() ? demoMembers() : [];
}

export async function getAllHomeworks(): Promise<Homework[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await withTimeout(
      supabase
        .from("homework")
        .select(
          "*, member:members(id, name, phone, package_remaining, end_state), items:homework_items(*), logs:homework_logs(*)"
        )
        .order("created_at", { ascending: false })
    );

    if (error) throw asDataAccessError("homeworks.list", error);
    return (data || []) as Homework[];
  } catch (error) {
    if (!isDemoMode()) throw asDataAccessError("homeworks.list", error);
  }
  return isDemoMode() ? demoHomeworks() : [];
}

/* ────────────────────────────────────────────────────────────
 * 회원 단건 조회 (서버 세션 + RLS)
 * ──────────────────────────────────────────────────────────── */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function getMemberById(memberId: string): Promise<Member | null> {
  if (isDemoMode()) {
    const demo = demoMembers().find((member) => member.id === memberId);
    if (demo) return demo;
  }
  if (!isUuid(memberId)) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await withTimeout(
      supabase.from("members").select("*").eq("id", memberId).maybeSingle()
    );
    if (error) throw asDataAccessError("members.get", error);
    return (data as Member | null) ?? null;
  } catch (error) {
    if (!isDemoMode()) throw asDataAccessError("members.get", error);
  }
  return null;
}

/* ────────────────────────────────────────────────────────────
 * 숙제 생성: create_homework_v2 RPC 단일 경로
 * - 인메모리 캐시·가짜 ID 폴백 없음. 실패는 실패로 원장에게 보인다.
 * - request_id 멱등키: 같은 요청 재전송은 같은 숙제를 돌려준다.
 * ──────────────────────────────────────────────────────────── */

export interface CreateHomeworkItemInput {
  order_index: number;
  name: string;
  cue: string;
  target_sets: number;
  target_reps: string;
  rest_seconds?: number;
  requirement?: AssignmentRequirement;
  exercise_snapshot?: ExerciseSnapshot | null;
}

export interface CreateHomeworkPayload {
  request_id: string;
  member_id: string;
  why: string;
  token: string;
  token_expires_at: string;
  assignment_purpose?: AssignmentPurpose | null;
  burden_budget_seconds?: number | null;
  source_homework_id?: string | null;
  items: CreateHomeworkItemInput[];
}

export interface CreatedHomework {
  id: string;
  token: string;
  replayed: boolean;
}

export class HomeworkCreationError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = "HomeworkCreationError";
    this.reason = reason;
  }
}

const CREATE_REASON_MESSAGE: Record<string, string> = {
  unauthorized: "로그인이 만료되었어요. 다시 로그인해주세요.",
  member_not_found: "회원 정보를 찾을 수 없어요.",
  invalid_items: "운동은 1~20개(필수 1개 이상), 세트는 1~99 사이로 담아주세요.",
  invalid_why: "숙제 설명이 비어 있어요.",
  invalid_token: "링크를 만들지 못했어요. 다시 시도해주세요.",
  invalid_expiry: "링크 만료일이 올바르지 않아요.",
  invalid_request_id: "요청 정보가 올바르지 않아요. 다시 시도해주세요.",
  request_payload_conflict: "같은 요청이 다른 내용으로 전송됐어요. 다시 시도해주세요.",
  homework_not_found: "숙제를 찾을 수 없어요. 다시 시도해주세요.",
};

const createHomeworkRpcResultSchema = z.union([
  z.object({ success: z.literal(true), id: z.string().uuid(), replayed: z.boolean().optional() }),
  z.object({ success: z.literal(false), reason: z.string() }),
]);

export async function createHomework(payload: CreateHomeworkPayload): Promise<CreatedHomework> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isDemoMode()) {
      // 로컬 데모 전용: 공개 데모 토큰으로 회원 화면을 보여준다. 운영(production)에서는 절대 실행되지 않는다.
      return { id: `demo-hw-${Date.now()}`, token: DEMO_TOKEN, replayed: false };
    }
    throw new HomeworkCreationError("unauthorized", CREATE_REASON_MESSAGE.unauthorized);
  }

  const items = payload.items.map((item) => ({
    ...normalizeCoachItem(item),
    requirement: item.requirement ?? "required",
  }));

  const { data, error } = await supabase.rpc("create_homework_v2", {
    p_request_id: payload.request_id,
    p_member_id: payload.member_id,
    p_why: payload.why,
    p_token: payload.token,
    p_token_expires_at: payload.token_expires_at,
    p_items: items,
    p_assignment_purpose: payload.assignment_purpose ?? null,
    p_burden_budget_seconds: payload.burden_budget_seconds ?? null,
    p_source_homework_id: payload.source_homework_id ?? null,
  });

  if (error) throw asDataAccessError("homework.create", error);

  const parsed = createHomeworkRpcResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new HomeworkCreationError("unexpected_response", "숙제 저장 결과를 확인하지 못했어요. 숙제 목록을 확인해주세요.");
  }
  if (!parsed.data.success) {
    const reason = parsed.data.reason;
    throw new HomeworkCreationError(reason, CREATE_REASON_MESSAGE[reason] ?? "숙제를 저장하지 못했어요. 다시 시도해주세요.");
  }

  return { id: parsed.data.id, token: payload.token, replayed: parsed.data.replayed ?? false };
}

/* ────────────────────────────────────────────────────────────
 * 회원 최종 피드백 제출: submit_homework_feedback_v2 (토큰 기반, anon 허용 RPC)
 * ──────────────────────────────────────────────────────────── */

export type SubmitFeedbackOutcome =
  | { ok: true; result: "complete" | "partial" | "cant" | null }
  | { ok: false; reason: string };

const submitFeedbackRpcResultSchema = z.object({
  success: z.boolean(),
  reason: z.string().optional(),
  result: z.enum(["complete", "partial", "cant"]).optional(),
});

export async function submitHomeworkFeedbackV2Server(input: {
  token: string;
  completedItemIds: string[];
  discomfortLevel: number;
  note: string | null;
  requestId: string;
}): Promise<SubmitFeedbackOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_homework_feedback_v2", {
    p_token: input.token,
    p_completed_item_ids: [...new Set(input.completedItemIds)].sort(),
    p_discomfort_level: input.discomfortLevel,
    p_note: input.note,
    p_request_id: input.requestId,
  });

  if (error) return { ok: false, reason: "rpc_failed" };
  const parsed = submitFeedbackRpcResultSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: "unexpected_response" };
  if (!parsed.data.success) return { ok: false, reason: parsed.data.reason ?? "rejected" };
  return { ok: true, result: parsed.data.result ?? null };
}

export {
  updateMember,
  getHomeworksForMember,
  submitHomeworkFeedbackRpc,
  submitHomeworkFeedbackV2Rpc,
  logHomeworkRpc,
} from "./db";

/* ────────────────────────────────────────────────────────────
 * 회원 링크 열기
 * - 공개 데모 토큰은 "정확히 일치"할 때만 샘플 숙제를 보여준다 (DB 미사용).
 * - 그 외 토큰은 open_homework RPC 결과만 신뢰한다. 만료·회수 판정은 DB가 한다.
 * ──────────────────────────────────────────────────────────── */

export const PUBLIC_DEMO_TOKENS: ReadonlySet<string> = new Set(["demo-token", "demo", DEMO_TOKEN]);

export function isPublicDemoToken(token: string): boolean {
  return PUBLIC_DEMO_TOKENS.has(token);
}

function buildPublicDemoHomework(token: string): OpenHomeworkResult {
  const member = demoMembers()[0];
  return {
    success: true,
    homework: {
      id: "demo-hw-1",
      why: "장시간 좌식 생활로 굳은 척추 기립근과 골반 중둔근을 활성화하여 허리 부담을 줄입니다. 수업 전까지 매일 5분 가볍게 진행해 주세요.",
      status: "sent",
      token,
      token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      created_at: new Date().toISOString(),
    },
    member: {
      id: member.id,
      name: member.name,
    },
    items: [
      withCoachFields({
        id: "demo-item-1",
        homework_id: "demo-hw-1",
        order_index: 1,
        name: "버드독 (Bird Dog)",
        cue: "허리가 꺾이지 않도록 복부에 긴장을 유지하고 팔다리를 대각선으로 곧게 뻗습니다.",
        target_sets: 3,
        target_reps: "10회",
        rest_seconds: 30,
        created_at: new Date().toISOString(),
      }),
      withCoachFields({
        id: "demo-item-2",
        homework_id: "demo-hw-1",
        order_index: 2,
        name: "글루트 브릿지 (Glute Bridge)",
        cue: "골반을 말아올리며 엉덩이에 힘을 꽉 주고 1초 정지합니다.",
        target_sets: 3,
        target_reps: "15회",
        rest_seconds: 30,
        created_at: new Date().toISOString(),
      }),
      withCoachFields({
        id: "demo-item-3",
        homework_id: "demo-hw-1",
        order_index: 3,
        name: "데드버그 (Dead Bug)",
        cue: "허리가 바닥에서 뜨지 않게 배꼽을 아래로 누르며 교차로 움직입니다.",
        requirement: "optional",
        target_sets: 2,
        target_reps: "12회",
        rest_seconds: 30,
        created_at: new Date().toISOString(),
      }),
    ],
    logs: [],
  };
}

export async function openHomeworkRpc(token: string): Promise<OpenHomeworkResult> {
  if (isPublicDemoToken(token)) return buildPublicDemoHomework(token);

  try {
    const supabase = await createClient();
    const { data, error } = await withTimeout(
      supabase.rpc("open_homework", { p_token: token }),
      6000
    );
    if (!error && data) return data as OpenHomeworkResult;
    if (error) return { success: false, reason: "unavailable" };
  } catch {
    if (!isDemoMode()) return { success: false, reason: "unavailable" };
  }

  if (!isDemoMode()) return { success: false, reason: "not_found" };

  const hw = demoHomeworks().find((h) => h.token === token);
  if (!hw) return { success: false, reason: "not_found" };
  if (hw.revoked_at || hw.status === "revoked") return { success: false, reason: "revoked" };
  if (hw.token_expires_at && new Date(hw.token_expires_at) < new Date()) {
    return { success: false, reason: "expired" };
  }
  return {
    success: true,
    homework: {
      id: hw.id,
      why: hw.why,
      status: hw.status,
      token: hw.token,
      token_expires_at: hw.token_expires_at ?? new Date().toISOString(),
      created_at: hw.created_at ?? new Date().toISOString(),
    },
    member: {
      id: hw.member?.id || hw.member_id,
      name: hw.member?.name || "회원",
    },
    items: hw.items || [],
    logs: hw.logs || [],
  };
}
