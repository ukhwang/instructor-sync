import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/node-postgres';
import { users, accounts, sessions, verifications, authRateLimits } from '@/infra/postgres/schema';
import { authDatabase } from '@/lib/server/db/pools';
import { authSecuritySettings } from './security.mjs';

const origin = process.env.BETTER_AUTH_URL ?? 'http://127.0.0.1:3015';
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET_REQUIRED');

const security = authSecuritySettings();
const schema = {
  user: users,
  account: accounts,
  session: sessions,
  verification: verifications,
  rateLimit: authRateLimits,
};

export const auth = betterAuth({
  appName: '운동숙제',
  baseURL: origin,
  secret,
  trustedOrigins: [origin],
  database: drizzleAdapter(drizzle({ client: authDatabase(), schema }), {
    provider: 'pg',
    schema,
    schemaName: 'authn',
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.NODE_ENV === 'production',
    requireEmailVerification: process.env.NODE_ENV === 'production',
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: process.env.NODE_ENV !== 'production',
    resetPasswordTokenExpiresIn: 30 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async () => {
      if (process.env.NODE_ENV === 'production') throw new Error('AUTH_EMAIL_PROVIDER_REQUIRED');
    },
  },
  session: security.session,
  rateLimit: { enabled: true, storage: 'database', window: 60, max: 10 },
  advanced: {
    useSecureCookies: security.secure,
    cookiePrefix: 'homework',
    cookies: { session_token: { attributes: security.sessionCookie } },
    database: { generateId: 'uuid' },
    trustedProxyHeaders: false,
  },
});
