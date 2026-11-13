import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { 
  Member, 
  Homework, 
  HomeworkItem, 
  HomeworkLog, 
  SessionNote, 
  Profile, 
  OpenHomeworkResult, 
  LogHomeworkResult,
  SubmitHomeworkFeedbackResult,
  MemberImportRecord,
  MemberImportInput,
  MemberRegistrationInput,
} from './types';
import { generateOpeningLine } from './template';
import { isDemoMode, withCoachFields } from './demo';
import { normalizeCoachItem } from './coach';
import { createRequestId, burdenMinutesToSeconds, type AssignmentPurpose, type AssignmentRequirement } from './homework-assignment';
import { asDataAccessError, isNotFoundDatabaseError } from './data-access-error';

export { isDemoMode };

function getSb() {
  return createBrowserClient();
}

// Demo in-memory fallback store when Supabase auth or DB is not reachable
const demoProfile: Profile = {
  id: 'demo-trainer-id',
  email: 'trainer@exercise-homework.com',
  name: '김강사',
  is_pro: false,
  created_at: new Date().toISOString(),
};

let demoMembers: Member[] = [
  {
    id: 'mem-1',
    trainer_id: 'demo-trainer-id',
    name: '이수진',
    phone: '010-1234-5678',
    package_total: 10,
    package_remaining: 3, // <= 4: Expiring renewal candidate
    package_expires_on: '2026-09-15',
    end_state: '허리 통증 없이 데드리프트 80kg 및 자율 루틴 수행',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'mem-2',
    trainer_id: 'demo-trainer-id',
    name: '박민호',
    phone: '010-9876-5432',
    package_total: 20,
    package_remaining: 2, // <= 4: Expiring renewal candidate
    package_expires_on: '2026-09-08',
    end_state: '라운드숄더 교정 및 벤치프레스 60kg 통증 없이 달성',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'mem-3',
    trainer_id: 'demo-trainer-id',
    name: '정다은',
    phone: '010-5555-7777',
    package_total: 10,
    package_remaining: 8,
    package_expires_on: '2026-10-30',
    end_state: '고관절 찝힘 없는 풀 스쿼트 50kg 완성',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

let demoHomeworks: Homework[] = [
  {
    id: 'hw-1',
    trainer_id: 'demo-trainer-id',
    member_id: 'mem-1',
    token: 'sample-token-demo-active-2026',
    token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 12).toISOString(),
    revoked_at: null,
    why: '데드리프트 시 둔근 개입을 높이고 허리 과신전을 방지하기 위함입니다.',
    status: 'logged',
    opening_line: '지난주에 글루트 브릿지, 힙 힌지 드릴 (벽 터치) 완료하셨고, "2세트 때 허리가 약간 뻐근했어요" 하셔서 오늘은 그 부분부터 볼게요.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      withCoachFields({
        id: 'hwi-1',
        homework_id: 'hw-1',
        order_index: 1,
        name: '글루트 브릿지',
        cue: '골반을 말아올리며 엉덩이에 힘을 꽉 주고 1초 정지합니다.',
        target_sets: 3,
        target_reps: '15회',
        created_at: new Date().toISOString(),
      }),
      withCoachFields({
        id: 'hwi-2',
        homework_id: 'hw-1',
        order_index: 2,
        name: '힙 힌지 드릴 (벽 터치)',
        cue: '무릎은 살짝만 굽히고 엉덩이를 뒤쪽 벽으로 밀어냅니다.',
        target_sets: 3,
        target_reps: '12회',
        created_at: new Date().toISOString(),
      }),
    ],
    logs: [
      {
        id: 'hwl-1',
        homework_id: 'hw-1',
        kind: 'complete',
        payload: {
          note: '2세트 때 허리가 약간 뻐근했어요',
        },
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      },
    ],
  },
  {
    id: 'hw-open',
    trainer_id: 'demo-trainer-id',
    member_id: 'mem-1',
    token: 'sample-token-demo-open-2026',
    token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    revoked_at: null,
    why: '데드리프트 시 둔근 개입을 높이고 허리 과신전을 방지하기 위함입니다.',
    status: 'opened',
    opening_line: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      withCoachFields({
        id: 'hwi-open-1',
        homework_id: 'hw-open',
        order_index: 1,
        name: '글루트 브릿지',
        cue: '골반을 말아올리며 엉덩이에 힘을 꽉 주고 1초 정지합니다.',
        target_sets: 3,
        target_reps: '15회',
        created_at: new Date().toISOString(),
      }),
    ],
    logs: [],
  },
];

let demoSessionNotes: SessionNote[] = [
  {
    id: 'sn-1',
    trainer_id: 'demo-trainer-id',
    member_id: 'mem-1',
    note: '7회차 수업 완료: 힌지 각도 60도에서 요추 굴곡 발생. 둔근 수축 큐 집중 전달함.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
];

let demoMemberImportRecords: MemberImportRecord[] = [
  {
    id: 'import-1',
    trainer_id: 'demo-trainer-id',
    member_id: 'mem-1',
    request_id: '00000000-0000-4000-8000-000000000101',
    source_type: 'existing_note',
    raw_text: '기존 메모: 힙 힌지 패턴을 연습했고 30kg에서 허리 뻐근함을 언급함.',
    summary: '힌지 동작과 허리 상태를 다음 수업에서 확인',
    recorded_from: null,
    recorded_to: null,
    imported_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
  },
];
const demoMemberOnboardingRequests = new Map<string, Member>();

// -----------------------------------------------------------------------------
// TRAINER / PROFILES
// -----------------------------------------------------------------------------

export async function getCurrentTrainerProfile(): Promise<Profile | null> {
  try {
    const supabase = getSb();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (data && !error) {
        return data as Profile;
      }
      return {
        id: user.id,
        email: user.email || null,
        name: user.user_metadata?.name || user.email?.split('@')[0] || '강사',
        is_pro: false,
        created_at: user.created_at,
      };
    }
  } catch {
    // fall through
  }
  return isDemoMode() ? demoProfile : null;
}

// -----------------------------------------------------------------------------
// MEMBERS
// -----------------------------------------------------------------------------

export async function getMembers(): Promise<Member[]> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw asDataAccessError('members.list', error);
    return (data || []) as Member[];
  } catch (error) {
    if (!isDemoMode()) throw asDataAccessError('members.list', error);
  }
  return isDemoMode() ? demoMembers : [];
}

export async function getMemberById(memberId: string): Promise<Member | null> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();

    if (error) {
      if (isNotFoundDatabaseError(error)) return null;
      throw asDataAccessError('members.get', error);
    }
    return data ? data as Member : null;
  } catch (error) {
    if (!isDemoMode()) {
      if (isNotFoundDatabaseError(error)) return null;
      throw asDataAccessError('members.get', error);
    }
  }
  return isDemoMode() ? demoMembers.find((m) => m.id === memberId) || null : null;
}

export async function createMember(payload: MemberRegistrationInput): Promise<Member> {
  const imported = payload.import_record?.raw_text.trim()
    ? payload.import_record
    : null;
  const packageRemaining = payload.member_kind === 'new'
    ? payload.package_total
    : Number(payload.package_remaining);

  try {
    const supabase = getSb();
    const { data, error } = await supabase.rpc('register_member_with_import', {
      p_request_id: payload.request_id,
      p_member_kind: payload.member_kind,
      p_name: payload.name,
      p_phone: payload.phone,
      p_package_total: payload.package_total,
      p_package_remaining: payload.package_remaining ?? null,
      p_package_expires_on: payload.package_expires_on || null,
      p_end_state: payload.end_state,
      p_import_source_type: imported?.source_type ?? null,
      p_import_raw_text: imported?.raw_text ?? null,
      p_import_summary: imported?.summary || null,
      p_import_recorded_from: imported?.recorded_from || null,
      p_import_recorded_to: imported?.recorded_to || null,
    });

    const result = data as { success?: boolean; member?: Member } | null;
    if (!error && result?.success && result.member) {
      return result.member;
    }
    if (error) throw error;
  } catch (err) {
    if (!isDemoMode()) throw err;
  }

  if (!isDemoMode()) {
    throw new Error('회원 등록에 실패했습니다. 로그인 상태를 확인하세요.');
  }

  const replayedMember = demoMemberOnboardingRequests.get(payload.request_id);
  if (replayedMember) return replayedMember;

  const newMember: Member = {
    id: `mem-${Date.now()}`,
    trainer_id: demoProfile.id,
    name: payload.name,
    phone: payload.phone,
    package_total: payload.package_total,
    package_remaining: packageRemaining,
    package_expires_on: payload.package_expires_on || null,
    end_state: payload.end_state,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  demoMembers = [newMember, ...demoMembers];
  demoMemberOnboardingRequests.set(payload.request_id, newMember);
  if (imported) {
    const now = new Date().toISOString();
    demoMemberImportRecords = [{
      id: `import-${Date.now()}`,
      trainer_id: demoProfile.id,
      member_id: newMember.id,
      request_id: payload.request_id,
      source_type: imported.source_type,
      raw_text: imported.raw_text.trim(),
      summary: imported.summary?.trim() || null,
      recorded_from: imported.recorded_from || null,
      recorded_to: imported.recorded_to || null,
      imported_at: now,
      created_at: now,
    }, ...demoMemberImportRecords];
  }
  return newMember;
}

export async function updateMember(
  id: string,
  patch: Partial<Omit<Member, 'id' | 'trainer_id' | 'created_at'>>
): Promise<Member | null> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase
      .from('members')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      return data as Member;
    }
  } catch {
    // fall through
  }

  if (!isDemoMode()) return null;

  const index = demoMembers.findIndex((m) => m.id === id);
  if (index !== -1) {
    demoMembers[index] = { ...demoMembers[index], ...patch, updated_at: new Date().toISOString() };
    return demoMembers[index];
  }
  return null;
}

// -----------------------------------------------------------------------------
// HOMEWORK
// -----------------------------------------------------------------------------

export async function getAllHomeworks(): Promise<Homework[]> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase
      .from('homework')
      .select('*, member:members(id, name, phone, package_remaining, end_state), items:homework_items(*), logs:homework_logs(*)')
      .order('created_at', { ascending: false });

    if (error) throw asDataAccessError('homeworks.list', error);
    return (data || []) as Homework[];
  } catch (error) {
    if (!isDemoMode()) throw asDataAccessError('homeworks.list', error);
  }

  if (!isDemoMode()) return [];

  return demoHomeworks.map((hw) => {
    const member = demoMembers.find((m) => m.id === hw.member_id);
    return { ...hw, member };
  });
}

export async function getHomeworkById(id: string): Promise<Homework | null> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase
      .from('homework')
      .select('*, member:members(id, name, phone, package_remaining, end_state), items:homework_items(*), logs:homework_logs(*)')
      .eq('id', id)
      .single();

    if (error) {
      if (isNotFoundDatabaseError(error)) return null;
      throw asDataAccessError('homeworks.get', error);
    }
    return data ? data as Homework : null;
  } catch (error) {
    if (!isDemoMode()) {
      if (isNotFoundDatabaseError(error)) return null;
      throw asDataAccessError('homeworks.get', error);
    }
  }

  if (!isDemoMode()) return null;

  const hw = demoHomeworks.find((h) => h.id === id);
  if (hw) {
    const member = demoMembers.find((m) => m.id === hw.member_id);
    return { ...hw, member };
  }
  return null;
}

export async function getHomeworksForMember(memberId: string): Promise<Homework[]> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase
      .from('homework')
      .select('*, items:homework_items(*), logs:homework_logs(*)')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });

    if (error) throw asDataAccessError('homeworks.for_member', error);
    return (data || []) as Homework[];
  } catch (error) {
    if (!isDemoMode()) throw asDataAccessError('homeworks.for_member', error);
  }

  return isDemoMode() ? demoHomeworks.filter((h) => h.member_id === memberId) : [];
}

export async function createHomework(
  payload: {
    request_id?: string;
    member_id: string;
    why: string;
    token: string;
    token_expires_at: string;
    assignment_purpose?: AssignmentPurpose | null;
    burden_budget_minutes?: string | number | null;
    burden_budget_seconds?: number | null;
    source_homework_id?: string | null;
    items: Array<{
      exercise_snapshot?: import('@/lib/types').ExerciseSnapshot | null;
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
      requirement?: AssignmentRequirement;
    }>;
  }
): Promise<Homework> {
  try {
    const supabase = getSb();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const normalizedItems = payload.items.map((item) => ({
        ...normalizeCoachItem(item),
        requirement: item.requirement ?? 'required',
      }));
      const { data: result, error: createError } = await supabase.rpc('create_homework_v2', {
        p_request_id: payload.request_id ?? createRequestId(),
        p_member_id: payload.member_id,
        p_why: payload.why,
        p_token: payload.token,
        p_token_expires_at: payload.token_expires_at,
        p_items: normalizedItems,
        p_assignment_purpose: payload.assignment_purpose ?? null,
        p_burden_budget_seconds: payload.burden_budget_seconds ?? burdenMinutesToSeconds(payload.burden_budget_minutes),
        p_source_homework_id: payload.source_homework_id ?? null,
      });

      const homeworkId = (result as { success?: boolean; id?: string } | null)?.id;
      if (!createError && (result as { success?: boolean } | null)?.success && homeworkId) {
        const itemRows = normalizedItems.map((item) => ({
          homework_id: homeworkId,
          ...item,
        }));

        const { data: full } = await supabase
          .from('homework')
          .select('*, items:homework_items(*), logs:homework_logs(*)')
          .eq('id', homeworkId)
          .single();

        return (full ?? {
          id: homeworkId,
          trainer_id: user.id,
      member_id: payload.member_id,
          why: payload.why,
          token: payload.token,
          token_expires_at: payload.token_expires_at,
          status: 'sent',
          source_homework_id: payload.source_homework_id ?? null,
          items: itemRows,
          logs: [],
        }) as Homework;
      }
      if (createError) throw createError;
      throw new Error('숙제 생성이 거부되었습니다. 회원과 입력 내용을 확인하세요.');
    }
  } catch (err) {
    if (!isDemoMode()) throw err;
  }

  if (!isDemoMode()) {
    throw new Error('숙제 생성에 실패했습니다. 로그인 상태를 확인하세요.');
  }

  const newHwId = `hw-${Date.now()}`;
  const createdItems: HomeworkItem[] = payload.items.map((it, idx) =>
    normalizeCoachItem({
      id: `hwi-${Date.now()}-${idx}`,
      homework_id: newHwId,
      order_index: it.order_index,
      exercise_snapshot: it.exercise_snapshot,
      name: it.name,
      cue: it.cue,
      target_sets: it.target_sets,
      target_reps: it.target_reps,
      effort_kind: it.effort_kind,
      reps: it.reps,
      hold_seconds: it.hold_seconds,
      seconds_per_rep: it.seconds_per_rep,
      rest_seconds: it.rest_seconds,
      per_side: it.per_side,
      requirement: it.requirement,
      created_at: new Date().toISOString(),
    })
  );

  const newHomework: Homework = {
    id: newHwId,
    trainer_id: demoProfile.id,
    member_id: payload.member_id,
    token: payload.token,
    token_expires_at: payload.token_expires_at,
    revoked_at: null,
    why: payload.why,
    status: 'sent',
    opening_line: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
      items: createdItems,
      assignment_purpose: payload.assignment_purpose ?? null,
    burden_budget_seconds: payload.burden_budget_seconds ?? burdenMinutesToSeconds(payload.burden_budget_minutes),
    source_homework_id: payload.source_homework_id ?? null,
    logs: [],
  };

  demoHomeworks = [newHomework, ...demoHomeworks];
  return newHomework;
}

export async function revokeHomework(homeworkId: string): Promise<boolean> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase.rpc('revoke_homework', { p_homework_id: homeworkId });
    if (!error && data?.success) {
      return true;
    }
  } catch {
    // fall through
  }

  if (!isDemoMode()) return false;

  const hw = demoHomeworks.find((h) => h.id === homeworkId);
  if (hw) {
    hw.revoked_at = new Date().toISOString();
    hw.status = 'revoked';
    return true;
  }
  return false;
}

// -----------------------------------------------------------------------------
// MEMBER IMPORT RECORDS
// -----------------------------------------------------------------------------

export async function getMemberImportRecords(memberId: string): Promise<MemberImportRecord[]> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase
      .from('member_import_records')
      .select('*')
      .eq('member_id', memberId)
      .order('imported_at', { ascending: false });

    if (!error && data) {
      return data as MemberImportRecord[];
    }
    if (error) throw error;
  } catch (err) {
    if (!isDemoMode()) throw err;
  }

  return isDemoMode()
    ? demoMemberImportRecords.filter((record) => record.member_id === memberId)
    : [];
}

export async function addMemberImportRecord(
  memberId: string,
  requestId: string,
  input: MemberImportInput,
): Promise<MemberImportRecord> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase.rpc('add_member_import_record', {
      p_request_id: requestId,
      p_member_id: memberId,
      p_source_type: input.source_type,
      p_raw_text: input.raw_text,
      p_summary: input.summary || null,
      p_recorded_from: input.recorded_from || null,
      p_recorded_to: input.recorded_to || null,
    });
    const result = data as { success?: boolean; import_record?: MemberImportRecord } | null;
    if (!error && result?.success && result.import_record) {
      return result.import_record;
    }
    if (error) throw error;
  } catch (err) {
    if (!isDemoMode()) throw err;
  }

  if (!isDemoMode()) {
    throw new Error('기존 기록 저장에 실패했습니다.');
  }

  const replayedRecord = demoMemberImportRecords.find(
    (record) => record.request_id === requestId,
  );
  if (replayedRecord) return replayedRecord;

  const now = new Date().toISOString();
  const record: MemberImportRecord = {
    id: `import-${Date.now()}`,
    trainer_id: demoProfile.id,
    member_id: memberId,
    request_id: requestId,
    source_type: input.source_type,
    raw_text: input.raw_text.trim(),
    summary: input.summary?.trim() || null,
    recorded_from: input.recorded_from || null,
    recorded_to: input.recorded_to || null,
    imported_at: now,
    created_at: now,
  };
  demoMemberImportRecords = [record, ...demoMemberImportRecords];
  return record;
}

// -----------------------------------------------------------------------------
// SESSION NOTES
// -----------------------------------------------------------------------------

export async function getSessionNotesForMember(memberId: string): Promise<SessionNote[]> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase
      .from('session_notes')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });

    if (error) throw asDataAccessError('session_notes.for_member', error);
    return (data || []) as SessionNote[];
  } catch (error) {
    if (!isDemoMode()) throw asDataAccessError('session_notes.for_member', error);
  }

  return isDemoMode() ? demoSessionNotes.filter((n) => n.member_id === memberId) : [];
}

export async function addSessionNote(memberId: string, note: string): Promise<SessionNote> {
  try {
    const supabase = getSb();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from('session_notes')
        .insert({
          trainer_id: user.id,
          member_id: memberId,
          note,
        })
        .select()
        .single();

      if (!error && data) {
        return data as SessionNote;
      }
      if (error) throw error;
    }
  } catch (err) {
    if (!isDemoMode()) throw err;
  }

  if (!isDemoMode()) {
    throw new Error('수업 메모 저장에 실패했습니다.');
  }

  const newNote: SessionNote = {
    id: `sn-${Date.now()}`,
    trainer_id: demoProfile.id,
    member_id: memberId,
    note,
    created_at: new Date().toISOString(),
  };
  demoSessionNotes = [newNote, ...demoSessionNotes];
  return newNote;
}

// -----------------------------------------------------------------------------
// MEMBER MAGIC LINK RPCs (open_homework, log_homework)
// -----------------------------------------------------------------------------

export async function openHomeworkRpc(token: string): Promise<OpenHomeworkResult> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase.rpc('open_homework', { p_token: token });

    if (error) return { success: false, reason: 'unavailable' };
    if (data) return data as OpenHomeworkResult;
  } catch {
    if (!isDemoMode()) return { success: false, reason: 'unavailable' };
  }

  if (!isDemoMode()) {
    return { success: false, reason: 'unavailable' };
  }

  const hw = demoHomeworks.find((h) => h.token === token);
  if (!hw) {
    return { success: false, reason: 'not_found' };
  }
  if (hw.revoked_at || hw.status === 'revoked') {
    return { success: false, reason: 'revoked' };
  }
  if (new Date(hw.token_expires_at ?? 0) < new Date()) {
    return { success: false, reason: 'expired' };
  }

  if (hw.status === 'sent' || hw.status === 'draft') {
    hw.status = 'opened';
  }

  const member = demoMembers.find((m) => m.id === hw.member_id) || { id: hw.member_id, name: '회원' };

  return {
    success: true,
    homework: {
      id: hw.id,
      why: hw.why,
      status: hw.status,
      token: hw.token,
      token_expires_at: hw.token_expires_at ?? new Date(0).toISOString(),
      created_at: hw.created_at ?? new Date(0).toISOString(),
    },
    member: {
      id: member.id,
      name: member.name,
    },
    items: hw.items || [],
    logs: hw.logs || [],
  };
}

export async function submitHomeworkFeedbackRpc(
  token: string,
  kind: 'complete' | 'cant',
  payload: { discomfort_level: number; note?: string }
): Promise<SubmitHomeworkFeedbackResult> {
  const note = payload.note?.trim() || null;

  try {
    const supabase = getSb();
    const { data, error } = await supabase.rpc('submit_homework_feedback', {
      p_token: token,
      p_kind: kind,
      p_discomfort_level: payload.discomfort_level,
      p_note: note,
    });
    if (!error && data) return data as SubmitHomeworkFeedbackResult;
  } catch {
    // Only known demo homework can be submitted locally when demo mode is on.
  }

  if (!isDemoMode()) return { success: false, reason: 'rpc_failed' };

  const hw = demoHomeworks.find((h) => h.token === token);
  if (!hw) return { success: false, reason: 'not_found' };
  if (hw.revoked_at || hw.status === 'revoked') {
    return { success: false, reason: 'revoked' };
  }
  if (new Date(hw.token_expires_at ?? 0).getTime() <= Date.now()) {
    return { success: false, reason: 'expired' };
  }
  if (kind !== 'complete' && kind !== 'cant') {
    return { success: false, reason: 'invalid_kind' };
  }
  if (!Number.isInteger(payload.discomfort_level) || payload.discomfort_level < 1 || payload.discomfort_level > 10) {
    return { success: false, reason: 'invalid_discomfort_level' };
  }
  if ((hw.logs || []).some((entry) => entry.kind === 'complete' || entry.kind === 'cant')) {
    return { success: false, reason: 'already_submitted' };
  }

  const createdAt = new Date().toISOString();
  const log: HomeworkLog = {
    id: `hwl-${crypto.randomUUID()}`,
    homework_id: hw.id,
    kind,
    payload: note ? { note } : {},
    created_at: createdAt,
  };
  const discomfortLog: HomeworkLog = {
    id: `hwl-${crypto.randomUUID()}`,
    homework_id: hw.id,
    kind: 'pain',
    payload: { pain_level: payload.discomfort_level },
    created_at: createdAt,
  };
  const logs = [...(hw.logs || []), log, discomfortLog];
  const openingLine = generateOpeningLine(hw.items || [], logs);

  // Prepare everything before mutating the demo store, with no await in between.
  Object.assign(hw, { logs, status: 'logged', opening_line: openingLine, updated_at: createdAt });
  return {
    success: true,
    log_id: log.id,
    pain_log_id: discomfortLog.id,
    status: 'logged',
    opening_line: openingLine,
  };
}

export async function submitHomeworkFeedbackV2Rpc(
  token: string,
  completedItemIds: string[],
  payload: { discomfort_level: number; note?: string },
  requestId: string = createRequestId(),
): Promise<SubmitHomeworkFeedbackResult & { result?: 'complete' | 'partial' | 'cant' }> {
  const note = payload.note?.trim() || null;
  const normalizedIds = [...new Set(completedItemIds)].sort();

  try {
    const supabase = getSb();
    const { data, error } = await supabase.rpc('submit_homework_feedback_v2', {
      p_token: token,
      p_completed_item_ids: normalizedIds,
      p_discomfort_level: payload.discomfort_level,
      p_note: note,
      p_request_id: requestId,
    });
    if (!error && data) return data as SubmitHomeworkFeedbackResult & { result?: 'complete' | 'partial' | 'cant' };
    if (error) return { success: false, reason: error.message || 'rpc_failed' };
  } catch {
    // Only the known demo homework is simulated locally.
  }

  if (!isDemoMode()) return { success: false, reason: 'rpc_failed' };

  const hw = demoHomeworks.find((entry) => entry.token === token);
  if (!hw) return { success: false, reason: 'not_found' };
  if (hw.revoked_at || hw.status === 'revoked') return { success: false, reason: 'revoked' };
  if (new Date(hw.token_expires_at ?? 0).getTime() <= Date.now()) return { success: false, reason: 'expired' };
  if (!Number.isInteger(payload.discomfort_level) || payload.discomfort_level < 1 || payload.discomfort_level > 10) {
    return { success: false, reason: 'invalid_discomfort_level' };
  }
  if ((hw.logs || []).some((entry) => entry.kind !== undefined && ['complete', 'partial', 'cant'].includes(entry.kind))) {
    return { success: false, reason: 'already_submitted' };
  }
  const itemIds = new Set((hw.items || []).map((item) => item.id));
  if (normalizedIds.some((id) => !itemIds.has(id))) return { success: false, reason: 'invalid_completed_item_ids' };
  const required = (hw.items || []).filter((item) => (item.requirement ?? 'required') === 'required');
  const result = normalizedIds.length === 0
    ? 'cant'
    : required.every((item) => normalizedIds.includes(item.id))
      ? 'complete'
      : 'partial';
  const createdAt = new Date().toISOString();
  const log: HomeworkLog = {
    id: `hwl-${crypto.randomUUID()}`,
    homework_id: hw.id,
    kind: result,
    payload: { ...(note ? { note } : {}), completed_items: normalizedIds },
    created_at: createdAt,
  };
  const painLog: HomeworkLog = {
    id: `hwl-${crypto.randomUUID()}`,
    homework_id: hw.id,
    kind: 'pain',
    payload: { pain_level: payload.discomfort_level },
    created_at: createdAt,
  };
  const logs = [...(hw.logs || []), log, painLog];
  const openingLine = generateOpeningLine(hw.items || [], logs);
  Object.assign(hw, { logs, status: 'logged', opening_line: openingLine, updated_at: createdAt });
  return { success: true, result, log_id: log.id, pain_log_id: painLog.id, status: 'logged', opening_line: openingLine };
}

export async function logHomeworkRpc(
  token: string,
  kind: 'complete' | 'cant' | 'pain' | 'note',
  payload: { note?: string; pain_area?: string; completed_items?: string[] }
): Promise<LogHomeworkResult> {
  try {
    const supabase = getSb();
    const { data, error } = await supabase.rpc('log_homework', {
      p_token: token,
      p_kind: kind,
      p_payload: payload,
    });

    if (!error && data) {
      return data as LogHomeworkResult;
    }
  } catch {
    // fall through
  }

  if (!isDemoMode()) {
    return { success: false, reason: 'not_found' };
  }

  const hw = demoHomeworks.find((h) => h.token === token);
  if (!hw) {
    return { success: false, reason: 'not_found' };
  }
  if (hw.revoked_at || hw.status === 'revoked') {
    return { success: false, reason: 'revoked' };
  }
  if (new Date(hw.token_expires_at ?? 0) < new Date()) {
    return { success: false, reason: 'expired' };
  }

  const newLog: HomeworkLog = {
    id: `hwl-${Date.now()}`,
    homework_id: hw.id,
    kind,
    payload,
    created_at: new Date().toISOString(),
  };

  hw.logs = [...(hw.logs || []), newLog];
  hw.status = 'logged';
  hw.opening_line = generateOpeningLine(hw.items || [], hw.logs);

  return {
    success: true,
    log_id: newLog.id,
    status: 'logged',
    opening_line: hw.opening_line,
  };
}
