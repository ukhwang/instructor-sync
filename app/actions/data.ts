'use server';

import { revalidatePath } from 'next/cache';
import { trainerAction } from '@/lib/server/actions';
import type { ActionResult } from '@/lib/action-result';
import type { Homework, Member, MemberImportInput, MemberImportRecord, MemberRegistrationInput, SessionNote } from '@/lib/types';
import type { MemberProgressGoalInput, MemberProgressObservationInput, MemberProgressResult } from '@/lib/member-progress-types';
import type { DatabaseExerciseRow } from '@/lib/exercises/provider';
import * as members from '@/lib/server/db/repositories/members';
import * as homeworks from '@/lib/server/db/repositories/homeworks';
import * as notes from '@/lib/server/db/repositories/session-notes';
import * as progress from '@/lib/server/db/repositories/member-progress';
import { listPublishedExercises } from '@/lib/server/db/repositories/exercise-catalog';

/*
 * Trainer mutations (and the few interactive reads) used by client components.
 * Initial page data is read in Server Components; these actions never accept a
 * trainer id — it always comes from the verified session (lib/server/actions.ts).
 */

const REGISTER_REASON_MESSAGE: Record<string, string> = {
  free_plan_member_limit: 'Free 플랜은 최대 5명까지만 등록 가능합니다. 추가 등록은 도입 담당자에게 문의해주세요.',
  request_payload_conflict: '같은 요청이 다른 내용으로 전송됐어요. 다시 시도해주세요.',
  invalid_package_remaining: '현재 잔여 횟수는 0회 이상, 등록 횟수 이하여야 합니다.',
  invalid_import_date_range: '기존 기록의 시작일은 종료일보다 늦을 수 없습니다.',
  import_text_too_long: '기존 기록이 너무 깁니다(최대 20,000자).',
  import_summary_too_long: '요약이 너무 깁니다(최대 2,000자).',
};

export async function registerMemberAction(input: MemberRegistrationInput): Promise<ActionResult<Member>> {
  const result = await trainerAction('members.register', ({ db, trainerId }) => members.registerMember(db, trainerId, input));
  if (!result.ok) return result;
  if (!result.data.success) {
    return { ok: false, code: result.data.reason, message: REGISTER_REASON_MESSAGE[result.data.reason] ?? '회원 등록에 실패했습니다. 입력값을 확인해주세요.' };
  }
  revalidatePath('/app/members');
  return { ok: true, data: result.data.member };
}

export async function updateMemberAction(memberId: string, patch: members.MemberPatch): Promise<ActionResult<Member | null>> {
  const result = await trainerAction('members.update', ({ db, trainerId }) => members.updateMember(db, trainerId, memberId, patch));
  if (result.ok) revalidatePath(`/app/members/${memberId}`);
  return result;
}

export async function getMemberAction(memberId: string): Promise<ActionResult<Member | null>> {
  return trainerAction('members.get', ({ db, trainerId }) => members.getMember(db, trainerId, memberId));
}

export async function listMembersAction(): Promise<ActionResult<Member[]>> {
  return trainerAction('members.list', ({ db, trainerId }) => members.listMembers(db, trainerId));
}

export async function listMemberHomeworksAction(memberId: string): Promise<ActionResult<Homework[]>> {
  return trainerAction('homeworks.for_member', ({ db, trainerId }) => homeworks.listHomeworks(db, trainerId, { memberId }));
}

export async function revokeHomeworkAction(homeworkId: string): Promise<ActionResult<boolean>> {
  const result = await trainerAction('homeworks.revoke', ({ db, trainerId }) => homeworks.revokeHomework(db, trainerId, homeworkId));
  if (result.ok && result.data) revalidatePath(`/app/homework/${homeworkId}`);
  return result;
}

export async function listImportRecordsAction(memberId: string): Promise<ActionResult<MemberImportRecord[]>> {
  return trainerAction('imports.list', ({ db, trainerId }) => members.listImportRecords(db, trainerId, memberId));
}

export async function addImportRecordAction(
  memberId: string,
  requestId: string,
  input: MemberImportInput,
): Promise<ActionResult<MemberImportRecord>> {
  const result = await trainerAction('imports.add', ({ db, trainerId }) =>
    members.addImportRecord(db, trainerId, { ...input, member_id: memberId, request_id: requestId }),
  );
  if (!result.ok) return result;
  if (!result.data.success) {
    return { ok: false, code: result.data.reason, message: REGISTER_REASON_MESSAGE[result.data.reason] ?? '기존 기록 저장에 실패했습니다.' };
  }
  revalidatePath(`/app/members/${memberId}`);
  return { ok: true, data: result.data.import_record };
}

export async function listSessionNotesAction(memberId: string): Promise<ActionResult<SessionNote[]>> {
  return trainerAction('session_notes.list', ({ db, trainerId }) => notes.listSessionNotes(db, trainerId, memberId));
}

export async function addSessionNoteAction(memberId: string, note: string): Promise<ActionResult<SessionNote>> {
  const result = await trainerAction('session_notes.add', ({ db, trainerId }) => notes.addSessionNote(db, trainerId, memberId, note));
  if (!result.ok) return result;
  if (!result.data) return { ok: false, code: 'NOT_FOUND', message: '회원 정보를 찾을 수 없어요.' };
  revalidatePath(`/app/members/${memberId}`);
  return { ok: true, data: result.data };
}

export async function createProgressGoalAction(input: MemberProgressGoalInput): Promise<ActionResult<MemberProgressResult>> {
  return trainerAction('progress.goal', ({ db, trainerId }) => progress.createProgressGoal(db, trainerId, input));
}

export async function recordProgressObservationAction(input: MemberProgressObservationInput): Promise<ActionResult<MemberProgressResult>> {
  return trainerAction('progress.observation', ({ db, trainerId }) => progress.recordProgressObservation(db, trainerId, input));
}

export async function getMemberProgressAction(memberId: string): Promise<ActionResult<MemberProgressResult>> {
  return trainerAction('progress.get', ({ db, trainerId }) => progress.getMemberProgress(db, trainerId, memberId));
}

export async function listPublishedExercisesAction(): Promise<ActionResult<DatabaseExerciseRow[]>> {
  return trainerAction('exercise_catalog.list', ({ db }) => listPublishedExercises(db));
}
