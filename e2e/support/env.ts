import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * E2E runs only against the LOCAL Workers runtime (`wrangler dev`) and its local
 * D1 file under .wrangler/state. A non-local base URL aborts before any test runs
 * (protects production data).
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8787";

export function e2eEnv() {
  const host = new URL(E2E_BASE_URL).hostname;
  if (!LOCAL_HOSTS.has(host)) throw new Error(`E2E 는 로컬 Workers(wrangler dev)에서만 실행해요. 현재 대상: ${host}`);
  return { baseUrl: E2E_BASE_URL, d1File: localD1File() };
}

/** The miniflare D1 sqlite file created by `npm run cf:migrate` (wrangler d1 migrations apply --local). */
export function localD1File(): string {
  const dir = path.join(process.cwd(), ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
  const file = readdirSync(dir).find((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  if (!file) throw new Error("로컬 D1 파일이 없어요. `npm run cf:migrate` 를 먼저 실행해주세요.");
  return path.join(dir, file);
}
