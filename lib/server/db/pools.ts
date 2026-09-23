import 'server-only';
import { Pool, type PoolConfig } from 'pg';

const globalPools = globalThis as typeof globalThis & {
  homeworkAppPool?: Pool;
  homeworkAuthPool?: Pool;
};

function config(name: 'DATABASE_URL' | 'AUTH_DATABASE_URL'): PoolConfig {
  const connectionString = process.env[name];
  if (!connectionString) throw new Error(`${name}_REQUIRED`);
  return {
    connectionString,
    max: process.env.NODE_ENV === 'test' ? 2 : 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  };
}

export function appDatabase(): Pool {
  return globalPools.homeworkAppPool ??= new Pool(config('DATABASE_URL'));
}

export function authDatabase(): Pool {
  return globalPools.homeworkAuthPool ??= new Pool(config('AUTH_DATABASE_URL'));
}
