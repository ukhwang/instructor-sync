import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { e2eEnv } from "./env";

/**
 * Test setup/inspection against the local D1 file used by `wrangler dev`.
 * Trainers are created through the real Better Auth endpoint (invite → sign-up);
 * only the invite row and fixture members are inserted directly (still through
 * the same D1 constraints and triggers the app relies on).
 */
export interface TrainerSession {
  email: string;
  password: string;
  userId: string;
  cookie: string;
}

let database: DatabaseSync | null = null;
function db(): DatabaseSync {
  database ??= new DatabaseSync(e2eEnv().d1File);
  database.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  return database;
}

export function select<T>(sql: string, ...params: Array<string | number | null>): T {
  return db().prepare(sql).all(...params).map((row) => ({ ...row })) as T;
}

export function execute(sql: string, ...params: Array<string | number | null>): void {
  db().prepare(sql).run(...params);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function inviteEmail(email: string, expiresAt = new Date(Date.now() + 3_600_000)): void {
  execute(
    "INSERT INTO signup_allowlist (email_hash, expires_at) VALUES (?, ?) ON CONFLICT (email_hash) DO UPDATE SET expires_at = excluded.expires_at, used_at = NULL",
    sha256(email.trim().toLowerCase()),
    expiresAt.toISOString(),
  );
}

export async function signUpTrainer(label: string): Promise<TrainerSession> {
  const { baseUrl } = e2eEnv();
  const email = `e2e-${label}-${Date.now()}-${randomUUID().slice(0, 6)}@e2e.local`;
  const password = `E2e-${randomUUID()}`;
  inviteEmail(email);
  // Better Auth rate-limits sign-up per IP (all E2E traffic is 127.0.0.1): back off on 429.
  let response: Response;
  for (let attempt = 0; ; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ email, password, name: `E2E ${label} 원장` }),
    });
    if (response.status !== 429 || attempt >= 6) break;
    await new Promise((resolve) => setTimeout(resolve, 11_000));
  }
  const body = (await response.json()) as { user?: { id: string } };
  if (!response.ok || !body.user) throw new Error(`sign-up failed: ${response.status} ${JSON.stringify(body)}`);
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  return { email, password, userId: body.user.id, cookie };
}

export interface SeedMember {
  id: string;
  name: string;
  phone: string;
  package_total: number;
  package_remaining: number;
}

export function createMember(trainer: TrainerSession, name: string): SeedMember {
  const phone = `010-${String(Math.floor(1000 + Math.random() * 8999))}-${String(Math.floor(1000 + Math.random() * 8999))}`;
  const member: SeedMember = { id: randomUUID(), name, phone, package_total: 10, package_remaining: 10 };
  execute(
    "INSERT INTO members (id, trainer_id, name, phone, package_total, package_remaining, end_state) VALUES (?, ?, ?, ?, 10, 10, ?)",
    member.id,
    trainer.userId,
    name,
    phone,
    "허리 통증 없이 데드리프트",
  );
  return member;
}

/** Next Monday (KST) YYYY-MM-DD — business-hour slots are always in the future and empty. */
export function nextMondayKst(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const weekday = (kst.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - weekday + 7));
  return monday.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Same format as the WeekBoard empty-slot aria-label: "11월 23일 10:00 수업 추가" */
export function slotLabel(date: string, hhmm: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${hhmm} 수업 추가`;
}
