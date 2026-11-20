import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic edge guard for /app/*: no D1 query here (keeps per-request CPU low).
 * A missing session cookie redirects to /login. The authoritative check — the
 * cookie's session row exists in D1 and is unexpired — runs in app/app/layout.tsx
 * and in every Server Action (lib/server/auth/session.ts).
 * /h/[token], /report/[token] and /demo stay public by design.
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/app") && !getSessionCookie(request, { cookiePrefix: "homework" })) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
