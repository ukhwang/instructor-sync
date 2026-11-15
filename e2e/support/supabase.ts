import { randomUUID } from "node:crypto";

import { e2eEnv } from "./env";

/**
 * 테스트 준비·검증용 Supabase REST 클라이언트.
 * 모든 호출은 "로그인한 강사 본인 토큰" 또는 anon 키로만 한다 → 앱과 동일하게 RLS·RPC 경로를 탄다.
 * service_role 키는 사용하지 않는다 (권한 우회 금지).
 */
export interface TrainerSession {
  email: string;
  password: string;
  userId: string;
  accessToken: string;
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { supabaseUrl, anonKey } = e2eEnv();
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${init.token ?? anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${response.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

export async function signUpTrainer(label: string): Promise<TrainerSession> {
  const email = `e2e-${label}-${Date.now()}-${randomUUID().slice(0, 6)}@e2e.local`;
  const password = `E2e-${randomUUID()}`;
  const body = await call<{ access_token?: string; user?: { id: string } }>("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, data: { name: `E2E ${label} 원장` } }),
  });
  if (!body.access_token || !body.user) {
    throw new Error("회원가입 직후 세션이 없어요. 로컬 GoTrue 의 MAILER_AUTOCONFIRM 을 켜주세요.");
  }
  return { email, password, userId: body.user.id, accessToken: body.access_token };
}

export interface SeedMember {
  id: string;
  name: string;
  phone: string;
  package_total: number;
  package_remaining: number;
}

/** 원장 본인 토큰으로 회원 1명을 만든다 (members INSERT RLS: trainer_id = auth.uid()). */
export async function createMember(trainer: TrainerSession, name: string): Promise<SeedMember> {
  const phone = `010-${String(Math.floor(1000 + Math.random() * 8999))}-${String(Math.floor(1000 + Math.random() * 8999))}`;
  const rows = await call<SeedMember[]>("/rest/v1/members", {
    method: "POST",
    token: trainer.accessToken,
    body: JSON.stringify({
      trainer_id: trainer.userId,
      name,
      phone,
      package_total: 10,
      package_remaining: 10,
      end_state: "허리 통증 없이 계단 오르기",
    }),
  });
  const member = rows[0];
  if (!member) throw new Error("회원 생성 결과가 비었어요.");
  return member;
}

export async function select<T>(trainer: TrainerSession | null, path: string): Promise<T> {
  return call<T>(`/rest/v1/${path}`, { token: trainer?.accessToken });
}

export async function rpc<T>(trainer: TrainerSession | null, fn: string, args: Record<string, unknown>): Promise<T> {
  return call<T>(`/rest/v1/rpc/${fn}`, {
    method: "POST",
    token: trainer?.accessToken,
    body: JSON.stringify(args),
  });
}

/** 다음 주 월요일(KST) YYYY-MM-DD — 실행 시각과 무관하게 운영 시간 슬롯이 항상 미래·빈 칸이도록 */
export function nextMondayKst(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const weekday = (kst.getUTCDay() + 6) % 7; // 0=월
  const monday = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - weekday + 7));
  return monday.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** WeekBoard 빈 슬롯 aria-label 과 같은 형식: "11월 23일 10:00 수업 추가" */
export function slotLabel(date: string, hhmm: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${hhmm} 수업 추가`;
}
