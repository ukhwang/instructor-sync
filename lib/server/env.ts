import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Server-only access to Cloudflare bindings and secrets.
 * - Workers runtime / `next dev` (initOpenNextCloudflareForDev): bindings come from
 *   getCloudflareContext(); secrets from `wrangler secret put` / `.dev.vars`.
 * - process.env is consulted as a fallback for plain Node tooling.
 */

export interface ServerEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

type CloudflareBindings = Partial<Record<string, unknown>> & { DB?: D1Database };

async function bindings(): Promise<CloudflareBindings> {
  const context = await getCloudflareContext({ async: true });
  return context.env as unknown as CloudflareBindings;
}

function stringValue(env: CloudflareBindings, name: string): string | undefined {
  const value = env[name] ?? process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function getServerEnv(): Promise<ServerEnv> {
  const env = await bindings();
  if (!env.DB) throw new Error('D1_BINDING_MISSING');
  const secret = stringValue(env, 'BETTER_AUTH_SECRET');
  if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET_REQUIRED');
  return {
    DB: env.DB,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: stringValue(env, 'BETTER_AUTH_URL') ?? stringValue(env, 'NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000',
  };
}

export async function getDb(): Promise<D1Database> {
  return (await getServerEnv()).DB;
}
