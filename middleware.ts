import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isDemoModeEnabled } from './lib/demo-mode';
import { hasSupabaseAuthCookie, isAppPath, isPublicPath } from './lib/route-access';

/**
 * 인증 가드 미들웨어.
 *
 * 비용 원칙: 여기서 supabase.auth.getUser()는 "필요한 요청"에서만 부른다.
 * - 공개 경로(/ , /demo, /h/*, /report/*, /auth/*)는 세션과 무관하므로 Auth API 호출 0회.
 * - sb- 쿠키가 하나도 없으면 세션이 없으므로 getUser() 없이 바로 판정(리다이렉트)한다.
 * - 그 외(/app/*, /login, sb- 쿠키가 있는 요청)에서만 getUser()로 검증·갱신한다.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1) 공개 경로: 로그인 상태를 보지 않는다.
  if (isPublicPath(path)) {
    return NextResponse.next({ request });
  }

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    return NextResponse.redirect(url);
  };

  // 2) 데모 모드: 세션 없이도 앱을 연다 (기존 동작 유지, Auth 호출 0회).
  if (isDemoModeEnabled()) {
    if (path === '/login') {
      return redirectTo('/app');
    }
    return NextResponse.next({ request });
  }

  // 3) 세션 쿠키가 없으면 Auth API를 부르지 않고 판정한다.
  if (!hasSupabaseAuthCookie(request.cookies.getAll().map((cookie) => cookie.name))) {
    if (isAppPath(path)) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', path);
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  // 4) 세션이 있을 수 있는 요청만 검증한다.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(user);

  const redirectWithCookies = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  };

  if (isAppPath(path) && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  if (path === '/login' && isAuthenticated) {
    return redirectWithCookies('/app');
  }

  return response;
}

export const config = {
  // 정적 에셋은 미들웨어를 아예 타지 않게 한다 (Auth 호출·엣지 실행 0회).
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|xml|json|webmanifest|woff|woff2|ttf|otf)$).*)',
  ],
};
