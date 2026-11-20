import 'server-only';
import type { Homework, Member, OpenHomeworkResult, Profile } from './types';
import { asDataAccessError } from './data-access-error';
import { normalizeCoachItem } from './coach';
import type { AssignmentPurpose, AssignmentRequirement } from './homework-assignment';
import type { ExerciseSnapshot } from './types';
import { requireTrainer } from '@/lib/server/auth/session';
import { getServerEnv } from '@/lib/server/env';
import * as members from '@/lib/server/db/repositories/members';
import * as homeworks from '@/lib/server/db/repositories/homeworks';
import { openHomeworkByToken, submitHomeworkByToken } from '@/lib/server/db/repositories/public-homework';
import { buildPublicDemoHomework, isPublicDemoToken } from './public-demo-homework';

export { isPublicDemoToken, PUBLIC_DEMO_TOKENS } from './public-demo-homework';
export { isUuid } from '@/lib/server/db/sql';

/*
 * Server-side data access for Server Components and Server Actions (D1).
 * Trainer reads resolve the trainer from the session and are scoped by it.
 * Database failures surface as DataAccessError (never empty lists / demo data).
 */

async function trainerScope() {
  const { trainerId } = await requireTrainer();
  const env = await getServerEnv();
  return { db: env.DB, trainerId, secret: env.BETTER_AUTH_SECRET };
}

async function guarded<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'AUTH_REQUIRED') throw error;
    console.error(`[db] ${operation} failed`, error instanceof Error ? error.message.slice(0, 200) : 'unknown');
    throw asDataAccessError(operation, error);
  }
}

export async function getCurrentTrainerProfile(): Promise<Profile | null> {
  return guarded('profiles.get', async () => {
    const { db, trainerId } = await trainerScope();
    return members.getProfile(db, trainerId);
  });
}

export async function getMembers(): Promise<Member[]> {
  return guarded('members.list', async () => {
    const { db, trainerId } = await trainerScope();
    return members.listMembers(db, trainerId);
  });
}

export async function getMemberById(memberId: string): Promise<Member | null> {
  return guarded('members.get', async () => {
    const { db, trainerId } = await trainerScope();
    return members.getMember(db, trainerId, memberId);
  });
}

export async function getAllHomeworks(): Promise<Homework[]> {
  return guarded('homeworks.list', async () => {
    const { db, trainerId } = await trainerScope();
    return homeworks.listHomeworks(db, trainerId);
  });
}

export async function getHomeworksForMember(memberId: string): Promise<Homework[]> {
  return guarded('homeworks.for_member', async () => {
    const { db, trainerId } = await trainerScope();
    return homeworks.listHomeworks(db, trainerId, { memberId });
  });
}

export async function getHomeworkById(homeworkId: string): Promise<Homework | null> {
  return guarded('homeworks.get', async () => {
    const { db, trainerId, secret } = await trainerScope();
    return homeworks.getHomework(db, trainerId, homeworkId, secret);
  });
}

/* ── Homework creation (atomic, idempotent on request_id) ─────────────────── */

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
  lesson_id?: string | null;
  items: CreateHomeworkItemInput[];
}

export interface CreatedHomework {
  id: string;
  token: string;
  replayed: boolean;
  lessonLinked: boolean;
}

export class HomeworkCreationError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'HomeworkCreationError';
    this.reason = reason;
  }
}

const CREATE_REASON_MESSAGE: Record<string, string> = {
  unauthorized: '로그인이 만료되었어요. 다시 로그인해주세요.',
  member_not_found: '회원 정보를 찾을 수 없어요.',
  invalid_items: '운동은 1~3개, 세트는 1~99 사이로 담아주세요.',
  invalid_why: '숙제 설명이 비어 있어요.',
  invalid_token: '링크를 만들지 못했어요. 다시 시도해주세요.',
  invalid_expiry: '링크 만료일이 올바르지 않아요.',
  invalid_request_id: '요청 정보가 올바르지 않아요. 다시 시도해주세요.',
  request_payload_conflict: '같은 요청이 다른 내용으로 전송됐어요. 다시 시도해주세요.',
  homework_not_found: '숙제를 찾을 수 없어요. 다시 시도해주세요.',
  source_homework_not_found: '이전 숙제를 찾을 수 없어요.',
};

/** Coach fields are derived from the editable reps label on the server (authoritative). */
export function normalizeHomeworkItems(items: CreateHomeworkItemInput[]) {
  return items.map((item) => {
    const normalized = normalizeCoachItem(item);
    return {
      order_index: normalized.order_index,
      name: normalized.name,
      cue: normalized.cue ?? '',
      target_sets: normalized.target_sets,
      target_reps: normalized.target_reps,
      effort_kind: normalized.effort_kind,
      reps: normalized.reps ?? null,
      hold_seconds: normalized.hold_seconds ?? null,
      seconds_per_rep: normalized.seconds_per_rep,
      rest_seconds: normalized.rest_seconds,
      per_side: normalized.per_side,
      requirement: item.requirement ?? 'required',
      exercise_snapshot: item.exercise_snapshot ?? null,
    };
  });
}

export async function createHomework(payload: CreateHomeworkPayload): Promise<CreatedHomework> {
  const { db, trainerId, secret } = await trainerScope().catch((error) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'AUTH_REQUIRED') {
      throw new HomeworkCreationError('unauthorized', CREATE_REASON_MESSAGE.unauthorized);
    }
    throw asDataAccessError('homework.create', error);
  });
  let result: homeworks.CreateHomeworkResult;
  try {
    result = await homeworks.createHomework(
      db,
      trainerId,
      {
        request_id: payload.request_id,
        member_id: payload.member_id,
        why: payload.why,
        token: payload.token,
        token_expires_at: payload.token_expires_at,
        assignment_purpose: payload.assignment_purpose ?? null,
        burden_budget_seconds: payload.burden_budget_seconds ?? null,
        source_homework_id: payload.source_homework_id ?? null,
        lesson_id: payload.lesson_id ?? null,
        items: normalizeHomeworkItems(payload.items),
      },
      secret,
    );
  } catch (error) {
    console.error('[db] homework.create failed', error instanceof Error ? error.message.slice(0, 200) : 'unknown');
    throw asDataAccessError('homework.create', error);
  }
  if (!result.success) {
    throw new HomeworkCreationError(result.reason, CREATE_REASON_MESSAGE[result.reason] ?? '숙제를 저장하지 못했어요. 다시 시도해주세요.');
  }
  return { id: result.id, token: payload.token, replayed: result.replayed, lessonLinked: result.lesson_linked };
}

/* ── Member link (no login) ───────────────────────────────────────────────── */

export async function openHomeworkRpc(token: string): Promise<OpenHomeworkResult> {
  if (isPublicDemoToken(token)) return buildPublicDemoHomework(token);
  try {
    const env = await getServerEnv();
    return await openHomeworkByToken(env.DB, token);
  } catch (error) {
    console.error('[db] homework.open failed', error instanceof Error ? error.message.slice(0, 200) : 'unknown');
    return { success: false, reason: 'unavailable' };
  }
}

export type SubmitFeedbackOutcome =
  | { ok: true; result: 'complete' | 'partial' | 'cant' | null }
  | { ok: false; reason: string };

export async function submitHomeworkFeedbackV2Server(input: {
  token: string;
  completedItemIds: string[];
  discomfortLevel: number;
  note: string | null;
  requestId: string;
}): Promise<SubmitFeedbackOutcome> {
  try {
    const env = await getServerEnv();
    const response = await submitHomeworkByToken(env.DB, {
      ...input,
      completedItemIds: [...new Set(input.completedItemIds)].sort(),
    });
    if (!response.success) return { ok: false, reason: response.reason ?? 'rejected' };
    return { ok: true, result: response.result ?? null };
  } catch (error) {
    console.error('[db] homework.submit failed', error instanceof Error ? error.message.slice(0, 200) : 'unknown');
    return { ok: false, reason: 'rpc_failed' };
  }
}
