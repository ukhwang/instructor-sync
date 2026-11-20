/**
 * 요청 경로·쿠키만 보고 "로그인 상태 조회(Supabase Auth 호출)가 필요한가"를 판정한다.
 * 미들웨어가 매 요청마다 Auth API·DB를 두드리지 않게 하는 순수 함수 모음이라
 * 테스트(tests/route-access.test.mjs)에서 그대로 검증한다.
 */

/** 로그인과 무관한 공개 경로. 여기서는 supabase.auth.getUser()를 부르지 않는다. */
export const PUBLIC_PATHS: readonly string[] = ["/", "/demo", "/h", "/report"];

/** 하위 경로까지 공개인 접두사 (회원 숙제 링크·마일스톤 리포트·OAuth 콜백) */
export const PUBLIC_PREFIXES: readonly string[] = ["/demo/", "/h/", "/report/", "/auth/"];

/** trailing slash만 정리한다. 그 외 정규화는 하지 않는다. */
export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "") || "/";
  }
  return pathname;
}

export function isPublicPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** 인증 가드 대상: /app, /app/* */
export function isAppPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/app" || path.startsWith("/app/");
}

/**
 * Supabase SSR 세션 쿠키 접두사(sb-<project-ref>-auth-token, 512B 초과 시 .0/.1 청크)가
 * 하나도 없으면 세션이 없다고 단정할 수 있다.
 * - 쿠키가 없으면 supabase-js getUser()도 Auth API를 부르지 않지만(실측 0회),
 *   그 동작에 기대지 않고 미들웨어에서 먼저 끊는다.
 * - 이름 규칙이 바뀌어도 sb- 접두사만 보므로, 세션이 있는데 못 알아보는 오판은 나지 않는다.
 *   (오판이 나는 방향은 "없는데 있다고 볼 때"뿐이고, 그때는 예전처럼 getUser()로 확인한다.)
 */
export function hasSupabaseAuthCookie(cookieNames: readonly string[]): boolean {
  return cookieNames.some((name) => name.startsWith("sb-"));
}
