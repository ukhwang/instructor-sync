/**
 * Small, dependency-free helpers shared by the D1 repositories.
 * Kept free of `server-only` so node tests can load them directly.
 */

export type Db = D1Database;

/** Fixed-width ISO-8601 UTC timestamp (lexical order == chronological order). */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

export function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError('invalid_timestamp');
  return date.toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function bool(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Deterministic JSON (sorted object keys) for idempotency payload comparison.
 * Equivalent to Postgres jsonb equality used by the original RPCs.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Message of a D1/SQLite error, including RAISE(ABORT, '<code>') codes from triggers. */
export function dbErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return `${error.message} ${cause instanceof Error ? cause.message : ''}`;
  }
  return String(error);
}

export function isDbError(error: unknown, ...needles: string[]): boolean {
  const message = dbErrorMessage(error);
  return needles.some((needle) => message.includes(needle));
}

export function isUniqueViolation(error: unknown, table?: string): boolean {
  const message = dbErrorMessage(error);
  if (!message.includes('UNIQUE constraint failed')) return false;
  return table ? message.includes(`${table}.`) : true;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return dbErrorMessage(error).includes('FOREIGN KEY constraint failed');
}

/** Today's date in Asia/Seoul as YYYY-MM-DD. */
export function seoulToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
