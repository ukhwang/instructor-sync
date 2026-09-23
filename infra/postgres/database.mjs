import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const targets = new Map([
  ['homework_dev', '55432'],
  ['homework_test', '55433'],
  ['homework_restore', '55434'],
]);
export function connectionConfig() {
  const database = process.env.HW_PG_DATABASE;
  const port = process.env.HW_PG_PORT;
  if (!targets.has(database) || targets.get(database) !== port) {
    throw new Error('Refusing database target outside the local homework allowlist');
  }
  const password = readFileSync(new URL('./.local/pg-password.txt', import.meta.url), 'utf8').trim();
  if (password.length < 32) throw new Error('Local database password is missing or too short');
  return { host: '127.0.0.1', port: Number(port), database, user: 'homework_owner', password, ssl: false, connectionTimeoutMillis: 3000, max: 2 };
}
export function createPool() {
  return new Pool(connectionConfig());
}
export async function withPool(run) {
  const pool = createPool();
  try { return await run(pool); } finally { await pool.end(); }
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('database.mjs')) {
  if (process.argv[2] !== 'migrate') throw new Error('Supported command: migrate');
  await withPool(async pool => migrate(drizzle({ client: pool }), { migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)) }));
  console.log('Migration applied to allowlisted local synthetic database.');
}
