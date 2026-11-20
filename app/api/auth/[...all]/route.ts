import { getAuth } from '@/lib/server/auth';

/** Better Auth endpoints (sign-in, sign-up with invite, sign-out, session). */
async function handle(request: Request): Promise<Response> {
  const auth = await getAuth();
  const response = await auth.handler(request);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const GET = handle;
export const POST = handle;
