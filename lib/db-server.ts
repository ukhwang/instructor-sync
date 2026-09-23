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

export async function openHomeworkRpc(token: string): Promise<OpenHomeworkResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await withTimeout(
      supabase.rpc("open_homework", { p_token: token })
    );
    if (error) return { success: false, reason: "unavailable" };
    if (data) return data as OpenHomeworkResult;
  } catch {
    if (!isDemoMode()) return { success: false, reason: "unavailable" };
  }

  if (!isDemoMode()) {
    return { success: false, reason: "unavailable" };
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
