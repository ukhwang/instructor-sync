import 'server-only';
import { ZodError } from 'zod';
import { AuthRequiredError, requireTrainer } from '@/lib/server/auth/session';
import { getServerEnv } from '@/lib/server/env';
import { MemberValidationError } from '@/lib/server/db/repositories/members';
import type { ActionResult } from '@/lib/action-result';

export interface TrainerContext {
  db: D1Database;
  trainerId: string;
  secret: string;
}

/**
 * Wraps a trainer Server Action: resolves the session (never from client input),
 * hands the trainer id to repositories, and converts failures into values
 * (production builds mask thrown Server Action errors). Never logs request
 * payloads or tokens.
 */
export async function trainerAction<T>(operation: string, run: (context: TrainerContext) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const { trainerId } = await requireTrainer();
    const env = await getServerEnv();
    return { ok: true, data: await run({ db: env.DB, trainerId, secret: env.BETTER_AUTH_SECRET }) };
  } catch (error) {
    if (error instanceof AuthRequiredError) return { ok: false, code: 'AUTH_REQUIRED', message: '로그인이 만료되었어요. 다시 로그인해주세요.' };
    if (error instanceof ZodError || error instanceof MemberValidationError) {
      return { ok: false, code: 'INVALID_INPUT', message: '입력값을 확인해주세요.' };
    }
    console.error(`[action] ${operation} failed`, error instanceof Error ? error.message.slice(0, 200) : 'unknown');
    return { ok: false, code: 'DB_UNAVAILABLE', message: '데이터를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
}
