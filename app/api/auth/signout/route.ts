import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";

/** Form-post sign-out: revokes the DB session, clears the cookie, returns to /login. */
export async function POST(request: Request) {
  const auth = await getAuth();
  const result = await auth.api.signOut({ headers: request.headers, asResponse: true });
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  for (const cookie of result.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
  return response;
}
