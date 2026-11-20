import 'server-only';
import { betterAuth } from 'better-auth/minimal';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import { authSchema } from './schema';
import { authSecuritySettings } from './security.mjs';
import { claimSignupInvite } from './invites';
import { ensureProfile } from '@/lib/server/db/repositories/members';
import { getServerEnv, type ServerEnv } from '@/lib/server/env';

/**
 * Better Auth on Cloudflare D1 (reuses the stage-5 Better Auth track; provider
 * switched from node-postgres to drizzle-orm/d1).
 *
 * - Email + password, DB-backed sessions (session table), HttpOnly signed cookie.
 * - Sign-up is invitation-only: the email must be on signup_allowlist (operator
 *   adds it; see scripts/cf/invite-trainer.mjs). No magic link: no email provider.
 * - Rate limiting is stored in D1 (rate_limit table).
 * - D1 has no interactive transactions → adapter transaction: false.
 */

function createAuth(env: ServerEnv) {
  const security = authSecuritySettings();
  const production = process.env.NODE_ENV === 'production';
  const db = drizzle(env.DB, { schema: authSchema });
  return betterAuth({
    appName: '운동숙제',
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: 'sqlite', schema: authSchema, transaction: false }),
    emailAndPassword: {
      enabled: true,
      // Open self-service sign-up is replaced by the invitation allowlist hook below.
      disableSignUp: false,
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async () => {
        if (production) throw new Error('AUTH_EMAIL_PROVIDER_REQUIRED');
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // Atomic single-statement claim; unknown/expired/used invites are rejected.
            const claimed = await claimSignupInvite(env.DB, user.email);
            if (!claimed) throw new APIError('FORBIDDEN', { message: 'SIGNUP_INVITE_REQUIRED' });
            // The operator vouched for this address when issuing the invite.
            return { data: { ...user, emailVerified: true } };
          },
          after: async (user) => {
            await ensureProfile(env.DB, { id: user.id, email: user.email, name: user.name });
          },
        },
      },
    },
    session: security.session,
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 10 },
    advanced: {
      useSecureCookies: security.secure,
      cookiePrefix: 'homework',
      cookies: { session_token: { attributes: security.sessionCookie } },
      database: { generateId: 'uuid' },
      // Cloudflare sets cf-connecting-ip; used only for rate-limit keys.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;
const instances = new WeakMap<D1Database, Auth>();

/** One Better Auth instance per D1 binding object (bindings are per isolate). */
export async function getAuth(): Promise<Auth> {
  const env = await getServerEnv();
  let auth = instances.get(env.DB);
  if (!auth) {
    auth = createAuth(env);
    instances.set(env.DB, auth);
  }
  return auth;
}
