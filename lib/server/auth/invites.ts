import { sha256Hex } from '@/lib/server/security/tokens';
import { nowIso } from '@/lib/server/db/sql';

/**
 * Invitation allowlist (replaces magic links / open sign-up).
 * Operators add sha256(lower(trim(email))) with an expiry; sign-up claims it once.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function emailHash(email: string): Promise<string> {
  return sha256Hex(normalizeEmail(email));
}

/** Single conditional UPDATE: concurrent sign-ups for one invite cannot both succeed. */
export async function claimSignupInvite(db: D1Database, email: string, now: Date = new Date()): Promise<boolean> {
  const at = nowIso(now);
  const result = await db
    .prepare('UPDATE signup_allowlist SET used_at = ? WHERE email_hash = ? AND used_at IS NULL AND expires_at > ?')
    .bind(at, await emailHash(email), at)
    .run();
  return (result.meta.changes ?? 0) === 1;
}
