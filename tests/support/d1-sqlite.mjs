// A D1Database-compatible adapter over node:sqlite for unit/integration tests.
//
// It mirrors the D1 Worker API surface the app uses (prepare/bind/first/all/run/raw,
// batch as one implicit transaction, exec) and D1's binding rules (undefined is
// rejected, booleans become 0/1), and applies the real migrations/*.sql files.
// It is NOT a mock of the repositories: every test query runs real SQL, triggers,
// CHECKs and foreign keys.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const migrationsDir = path.join(root, 'migrations');

function normalizeValue(value) {
  if (value === undefined) throw new TypeError('D1_TYPE_ERROR: Type \'undefined\' not supported for value \'undefined\'');
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...values) {
    return new Statement(this.db, this.sql, values.map(normalizeValue));
  }
  #exec() {
    this.db.beforeStatement?.(this.sql);
    return this.db.sqlite.prepare(this.sql);
  }
  async first(column) {
    const row = this.#exec().get(...this.params);
    if (!row) return null;
    const plain = { ...row };
    return column ? plain[column] ?? null : plain;
  }
  async all() {
    const results = this.#exec().all(...this.params).map((row) => ({ ...row }));
    return { results, success: true, meta: { rows_read: results.length } };
  }
  async run() {
    return this.runSync();
  }
  // Synchronous execution used by batch(): D1 runs a batch as one serialized
  // transaction, so no other statement may interleave between its statements.
  runSync() {
    const statement = this.#exec();
    if (/\breturning\b/i.test(this.sql) || /^\s*(select|with)\b/i.test(this.sql)) {
      const results = statement.all(...this.params).map((row) => ({ ...row }));
      return { results, success: true, meta: { changes: results.length } };
    }
    const info = statement.run(...this.params);
    return { results: [], success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
  async raw() {
    return this.#exec().all(...this.params).map((row) => Object.values(row));
  }
}

export class SqliteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    this.beforeStatement = null;
    this.batchCount = 0;
  }
  prepare(sql) {
    return new Statement(this, sql);
  }
  async batch(statements) {
    this.batchCount += 1;
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(statement.runSync());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }
  close() {
    this.sqlite.close();
  }
}

export function migrationFiles() {
  return readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
}

export function createTestDatabase() {
  const db = new SqliteD1();
  for (const file of migrationFiles()) {
    db.sqlite.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  return db;
}

/** Inserts an auth user + profile directly (test fixture only). */
export function seedTrainer(db, { id, email, name = '테스트 강사', isPro = false }) {
  db.sqlite.prepare('INSERT INTO "user" (id, name, email, email_verified) VALUES (?, ?, ?, 1)').run(id, name, email);
  db.sqlite.prepare('INSERT INTO profiles (id, email, name, is_pro) VALUES (?, ?, ?, ?)').run(id, email, name, isPro ? 1 : 0);
}

/** Row counts for every app table: used to prove that a rejected write changed nothing. */
export function snapshotCounts(db) {
  const tables = db.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")
    .all()
    .map((row) => row.name);
  return Object.fromEntries(tables.map((name) => [name, db.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get().n]));
}
