import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function safeNextPath(raw: string | null): string {
  const fallback = "/app";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

function publicOrigin(request: NextRequest, requestUrl: URL): string {
  if (process.env.NODE_ENV === "development") {
    return requestUrl.origin;
  }
  const host = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host) {
    return `${proto}://${host}`;
  }
  return requestUrl.origin;
}

/**
 * PKCE: 코드 검증기는 브라우저가 보낸 *요청* Cookie에만 있음.
 * NextResponse.next()만 getAll() 하면 빈 배열 → exchangeCodeForSession 항상 실패.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"));
  const origin = publicOrigin(request, requestUrl);

  const authResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            authResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const redirectUrl = new URL(nextPath, origin);
      const redirectResponse = NextResponse.redirect(redirectUrl);
      authResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
      return redirectResponse;
    }

    const failUrl = new URL("/login", origin);
    failUrl.searchParams.set("error", "auth_failed");
    if (error.message) {
      failUrl.searchParams.set("detail", encodeURIComponent(error.message.slice(0, 300)));
    }
    const failResponse = NextResponse.redirect(failUrl);
    authResponse.cookies.getAll().forEach((cookie) => {
      failResponse.cookies.set(cookie);
    });
    return failResponse;
  }

  const errorUrl = new URL("/login", origin);
  errorUrl.searchParams.set("error", "auth_failed");
  errorUrl.searchParams.set("detail", encodeURIComponent("인증 코드가 없습니다."));
  const errorResponse = NextResponse.redirect(errorUrl);
  authResponse.cookies.getAll().forEach((cookie) => {
    errorResponse.cookies.set(cookie);
  });
  return errorResponse;
}
