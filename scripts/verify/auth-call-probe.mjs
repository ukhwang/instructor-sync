/**
 * supabase.auth.getUser() 가 실제로 Auth API를 몇 번 부르는지 재는 프로브.
 *
 * 측정 목적: 미들웨어에서 "세션 쿠키가 없을 때" getUser()를 불러도 네트워크 호출이 0회인지,
 * 반대로 "만료된 세션 쿠키"가 있을 때는 refresh 요청이 1회 나가는지 확인한다.
 *
 * 사용: node scripts/verify/auth-call-probe.mjs
 * 결과(2026-11-20, @supabase/supabase-js 2.101 / @supabase/ssr 0.10):
 *   no cookies             | fetch calls: 0
 *   only unrelated cookie  | fetch calls: 0
 *   expired session cookie | fetch calls: 1  (/auth/v1/token?grant_type=refresh_token)
 */
import { createServerClient } from '@supabase/ssr';

let calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  return new Response(JSON.stringify({ user: null }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
};

async function probe(label, cookieJar) {
  calls = [];
  const supabase = createServerClient('https://example.supabase.co', 'anon-key', {
    cookies: {
      getAll: () => cookieJar,
      setAll: (cookies) => {
        cookieJar.push(...cookies.map(({ name, value, ...options }) => ({ name, value, ...options })));
      },
    },
  });
  const res = await supabase.auth.getUser();
  console.log(
    label,
    '| fetch calls:',
    calls.length,
    calls.map((url) => url.replace('https://example.supabase.co', '')),
    '| user:',
    res.data?.user,
    '| error:',
    res.error?.name ?? null,
  );
}

await probe('no cookies             ', []);
await probe('only unrelated cookie  ', [{ name: 'theme', value: 'dark' }]);

const expiredSession = {
  access_token:
    'header.' +
    Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 600, sub: 'u1' })).toString('base64url') +
    '.sig',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) - 600,
  refresh_token: 'refresh-token-value',
  user: { id: 'u1', email: 'a@b.c' },
};
const raw = 'base64-' + Buffer.from(JSON.stringify(expiredSession)).toString('base64url');
await probe('expired session cookie ', [{ name: 'sb-example-auth-token', value: raw }]);
