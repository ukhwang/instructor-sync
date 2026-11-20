import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Supabase Free 일시정지(Pause) 방어용 초경량 헬스 핑.
 *
 * 왜 필요한가: 무료 플랜은 7일간 DB 활동이 없으면 프로젝트가 멈춘다.
 * Vercel Cron(vercel.json `crons`, 매일 03:00 UTC = 12:00 KST 1회)이 이 경로를 호출한다.
 *
 * 무엇을 하는가: 회원 링크가 쓰는 공개 RPC `open_homework`를 "존재하지 않는 토큰"으로 1회 호출한다.
 * - anon 키로 호출 가능한 유일한 읽기 경로다. (members 등 테이블은 anon 권한이 회수돼 있어
 *   테이블 직접 조회는 401로 실패한다 — 20260415000000_exercise_homework_init.sql:540,553)
 * - 응답은 항상 success=false / reason=not_found 이며 회원 데이터는 한 행도 나가지 않는다.
 * - 비용: 호출 1회당 PostgREST 1요청. 월 30회라 Egress(5GB/월)에 영향이 없다.
 *
 * 캐시 금지: CDN이 응답을 캐시하면 DB를 건드리지 않아 핑 의미가 사라진다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 4000;
const PING_TOKEN = "keep-alive-ping-not-a-real-token";

function payload(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
  });
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return payload({ ok: false, db: "unconfigured" }, 503);
  }

  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const query = supabase.rpc("open_homework", { p_token: PING_TOKEN });
    const { error } = await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("supabase-timeout")), DB_TIMEOUT_MS);
      }),
    ]);

    if (error) {
      return payload(
        { ok: false, db: "error", reason: "rpc_failed", code: error.code ?? null, ms: Date.now() - startedAt },
        503,
      );
    }
    return payload({ ok: true, db: "up", ms: Date.now() - startedAt }, 200);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    return payload({ ok: false, db: "error", reason, ms: Date.now() - startedAt }, 503);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
