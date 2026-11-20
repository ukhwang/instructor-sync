import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from './index';

/**
 * Server authorization entry point (RLS replacement).
 * Every trainer read/write resolves the trainer id from the verified DB session
 * here; repositories receive it as an argument and scope every query with it.
 * Client-supplied trainer_id / is_pro are never trusted.
 */

export interface TrainerSession {
  trainerId: string;
  email: string;
  name: string;
}

export class AuthRequiredError extends Error {
  readonly code = 'AUTH_REQUIRED';
  constructor() {
    super('AUTH_REQUIRED');
    this.name = 'AuthRequiredError';
  }
}

/** Per-request memoized session lookup (one D1 read per render). */
export const getTrainerSession = cache(async (): Promise<TrainerSession | null> => {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { trainerId: session.user.id, email: session.user.email, name: session.user.name };
});

/** For Server Actions / Route Handlers: throws when there is no valid session. */
export async function requireTrainer(): Promise<TrainerSession> {
  const session = await getTrainerSession();
  if (!session) throw new AuthRequiredError();
  return session;
}

/** For Server Components under /app: redirects to /login when there is no valid session. */
export async function requireTrainerPage(nextPath = '/app'): Promise<TrainerSession> {
  const session = await getTrainerSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return session;
}
