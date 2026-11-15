/**
 * E2E 가 붙는 Supabase 는 반드시 로컬이어야 한다.
 * 운영 프로젝트 URL 이 들어오면 테스트를 시작하기 전에 중단한다 (운영 DB 보호).
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 가 필요해요. e2e/README.md 를 참고해 로컬 스택 값을 넣어주세요.`);
  return value;
}

export function e2eEnv() {
  const supabaseUrl = required("E2E_SUPABASE_URL");
  const anonKey = required("E2E_SUPABASE_ANON_KEY");
  const host = new URL(supabaseUrl).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`E2E 는 로컬 Supabase 에서만 실행해요. 현재 대상: ${host}`);
  }
  return { supabaseUrl, anonKey };
}
