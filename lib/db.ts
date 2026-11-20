import {
  addImportRecordAction,
  addSessionNoteAction,
  getMemberAction,
  listImportRecordsAction,
  listMemberHomeworksAction,
  listMembersAction,
  listSessionNotesAction,
  registerMemberAction,
  revokeHomeworkAction,
  updateMemberAction,
} from '@/app/actions/data';
import type { ActionResult } from './action-result';
import { asDataAccessError } from './data-access-error';
import type {
  Homework,
  Member,
  MemberImportInput,
  MemberImportRecord,
  MemberRegistrationInput,
  SessionNote,
} from './types';

/*
 * Client-side data access for trainer pages.
 *
 * There is no browser database client any more: every call is a Server Action
 * that resolves the trainer from the session and runs scoped D1 queries.
 * Initial page data is loaded by Server Components; these wrappers serve
 * mutations and in-place refreshes. Failures are surfaced, never turned into
 * empty lists or demo data.
 */

async function read<T>(operation: string, call: () => Promise<ActionResult<T>>): Promise<T> {
  let result: ActionResult<T>;
  try {
    result = await call();
  } catch (error) {
    throw asDataAccessError(operation, error);
  }
  if (!result.ok) throw asDataAccessError(operation, result);
  return result.data;
}

async function write<T>(call: () => Promise<ActionResult<T>>, fallbackMessage: string): Promise<T> {
  let result: ActionResult<T>;
  try {
    result = await call();
  } catch {
    throw new Error('인터넷 연결을 확인하고 다시 시도해주세요.');
  }
  if (!result.ok) throw new Error(result.message || fallbackMessage);
  return result.data;
}

export async function getMembers(): Promise<Member[]> {
  return read('members.list', () => listMembersAction());
}

export async function getMemberById(memberId: string): Promise<Member | null> {
  return read('members.get', () => getMemberAction(memberId));
}

export async function createMember(payload: MemberRegistrationInput): Promise<Member> {
  return write(() => registerMemberAction(payload), '회원 등록에 실패했습니다. 로그인 상태를 확인하세요.');
}

export async function updateMember(
  id: string,
  patch: Partial<Pick<Member, 'name' | 'phone' | 'package_total' | 'package_remaining' | 'package_expires_on' | 'end_state'>>,
): Promise<Member | null> {
  try {
    const result = await updateMemberAction(id, patch);
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

export async function getHomeworksForMember(memberId: string): Promise<Homework[]> {
  return read('homeworks.for_member', () => listMemberHomeworksAction(memberId));
}

export async function revokeHomework(homeworkId: string): Promise<boolean> {
  try {
    const result = await revokeHomeworkAction(homeworkId);
    return result.ok && result.data;
  } catch {
    return false;
  }
}

export async function getMemberImportRecords(memberId: string): Promise<MemberImportRecord[]> {
  return read('imports.list', () => listImportRecordsAction(memberId));
}

export async function addMemberImportRecord(memberId: string, requestId: string, input: MemberImportInput): Promise<MemberImportRecord> {
  return write(() => addImportRecordAction(memberId, requestId, input), '기존 기록 저장에 실패했습니다.');
}

export async function getSessionNotesForMember(memberId: string): Promise<SessionNote[]> {
  return read('session_notes.for_member', () => listSessionNotesAction(memberId));
}

export async function addSessionNote(memberId: string, note: string): Promise<SessionNote> {
  return write(() => addSessionNoteAction(memberId, note), '수업 메모 저장에 실패했습니다.');
}
