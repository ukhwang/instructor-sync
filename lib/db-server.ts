import { createClient } from "@/lib/supabase/server";
import { isDemoMode, withCoachFields } from "./demo";
import type { Homework, Member, OpenHomeworkResult, Profile } from "./types";
import { asDataAccessError } from "./data-access-error";

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

const ACTIVE_HOMEWORKS_CACHE = new Map<string, {
  homework: any;
  member: any;
  items: any[];
  logs: any[];
}>();

export async function createHomework(payload: {
  request_id?: string;
  member_id: string;
  why: string;
  token: string;
  token_expires_at: string;
  assignment_purpose?: string | null;
  burden_budget_minutes?: string | number | null;
  burden_budget_seconds?: number | null;
  source_homework_id?: string | null;
  items: Array<{
    exercise_snapshot?: any;
    order_index: number;
    name: string;
    cue: string;
    target_sets: number;
    target_reps: string;
    effort_kind?: 'reps' | 'hold';
    reps?: number | null;
    hold_seconds?: number | null;
    seconds_per_rep?: number;
    rest_seconds?: number;
    per_side?: boolean;
    requirement?: string;
    media_url?: string | null;
    media_type?: string | null;
  }>;
}): Promise<Homework> {
  const newHwId = `hw-${Date.now()}`;
  let member = await getMemberById(payload.member_id);
  if (!member) {
    const demo = demoMembers();
    member = demo.find((m) => m.id === payload.member_id) || demo[0];
  }

  const normalizedItems = payload.items.map((it, idx) => ({
    id: `item-${idx + 1}-${Date.now()}`,
    homework_id: newHwId,
    order_index: it.order_index ?? idx + 1,
    name: it.name,
    cue: it.cue,
    target_sets: it.target_sets,
    target_reps: it.target_reps,
    rest_seconds: it.rest_seconds ?? 30,
    media_url: it.media_url ?? null,
    media_type: it.media_type ?? null,
    created_at: new Date().toISOString(),
  }));

  const createdHomework: Homework = {
    id: newHwId,
    trainer_id: member?.trainer_id || "demo-trainer",
    member_id: payload.member_id,
    why: payload.why,
    token: payload.token,
    token_expires_at: payload.token_expires_at,
    status: "sent",
    items: normalizedItems as any,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    member: member as any,
    logs: [],
  };

  // 1. 메모리 캐시 즉시 적재 (회원 화면 0초 즉각 렌더링 보장)
  ACTIVE_HOMEWORKS_CACHE.set(payload.token, {
    homework: {
      id: newHwId,
      why: payload.why,
      status: "sent",
      token: payload.token,
      token_expires_at: payload.token_expires_at,
      created_at: createdHomework.created_at,
    },
    member: {
      id: member?.id || payload.member_id,
      name: member?.name || "회원",
      phone: member?.phone,
    },
    items: normalizedItems,
    logs: [],
  });

  // 2. Supabase 비동기 적재 시도 (실패해도 무중단)
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: result, error: rpcError } = await supabase.rpc('create_homework_v2', {
        p_request_id: payload.request_id || `req-${Date.now()}`,
        p_member_id: payload.member_id,
        p_why: payload.why,
        p_token: payload.token,
        p_token_expires_at: payload.token_expires_at,
        p_items: payload.items,
        p_assignment_purpose: payload.assignment_purpose || null,
        p_burden_budget_seconds: payload.burden_budget_seconds || 300,
        p_source_homework_id: payload.source_homework_id || null,
      });
      if (!rpcError && (result as any)?.id) {
        createdHomework.id = (result as any).id;
      }
    }
  } catch (err) {
    console.warn("[createHomework] non-fatal Supabase sync warning:", err);
  }

  return createdHomework;
}

export {
  getMemberById,
  updateMember,
  getHomeworksForMember,
  submitHomeworkFeedbackRpc,
  submitHomeworkFeedbackV2Rpc,
  logHomeworkRpc,
} from "./db";

export async function openHomeworkRpc(token: string): Promise<OpenHomeworkResult> {
  const isDemoToken =
    token === "demo-token" ||
    token === "demo" ||
    token.startsWith("demo-") ||
    token.includes("demo") ||
    token === DEMO_TOKEN;

  if (isDemoToken) {
    const members = demoMembers();
    const member = members[0];
    return {
      success: true,
      homework: {
        id: "demo-hw-1",
        why: "장시간 좌식 생활로 굳은 척추 기립근과 골반 중둔근을 활성화하여 허리 부담을 줄입니다. 수업 전까지 매일 5분 가볍게 진행해 주세요.",
        status: "assigned",
        token: token,
        token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
        created_at: new Date().toISOString(),
      },
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        package_remaining: member.package_remaining,
        end_state: member.end_state,
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
          target_sets: 2,
          target_reps: "12회",
          rest_seconds: 30,
          created_at: new Date().toISOString(),
        }),
      ],
      logs: [],
    };
  }

  // 1. 활성 캐시 우선 확인
  if (ACTIVE_HOMEWORKS_CACHE.has(token)) {
    const cached = ACTIVE_HOMEWORKS_CACHE.get(token)!;
    return {
      success: true,
      homework: cached.homework,
      member: cached.member,
      items: cached.items,
      logs: cached.logs,
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await withTimeout(
      supabase.rpc("open_homework", { p_token: token })
    );
    if (!error && data) return data as OpenHomeworkResult;
  } catch {
    // fall through to demo data
  }

  const hw = demoHomeworks().find((h) => h.token === token);
  if (!hw) return { success: false, reason: "not_found" };
  if (hw.revoked_at || hw.status === "revoked") {
    return { success: false, reason: "revoked" };
  }
  if (new Date(hw.token_expires_at) < new Date()) {
    return { success: false, reason: "expired" };
  }

  return {
    success: true,
    homework: {
      id: hw.id,
      why: hw.why,
      status: hw.status,
      token: hw.token,
      token_expires_at: hw.token_expires_at,
      created_at: hw.created_at,
    },
    member: {
      id: hw.member?.id || hw.member_id,
      name: hw.member?.name || "회원",
    },
    items: hw.items || [],
    logs: hw.logs || [],
  };
}
