import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = requestUrl.searchParams.get("next") || "/dashboard";

  let authResponse = NextResponse.next({
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
          return authResponse.cookies.getAll();
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
      const redirectUrl = new URL(nextPath, requestUrl.origin);
      const redirectResponse = NextResponse.redirect(redirectUrl);
      authResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
      return redirectResponse;
    }
  }

  const errorUrl = new URL("/login", requestUrl.origin);
  errorUrl.searchParams.set("error", "auth_failed");
  const errorResponse = NextResponse.redirect(errorUrl);
  authResponse.cookies.getAll().forEach((cookie) => {
    errorResponse.cookies.set(cookie);
  });
  return errorResponse;
}