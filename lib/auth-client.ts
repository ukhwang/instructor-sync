import { z } from 'zod';

/**
 * Browser calls to the Better Auth endpoints (/api/auth/*). Plain fetch keeps the
 * client bundle small; the session itself is an HttpOnly cookie the browser never reads.
 */

export const credentialsSchema = z.object({
  email: z.string().trim().email('이메일 형식을 확인해주세요.').max(254),
  password: z.string().min(12, '비밀번호는 12자 이상이어야 합니다.').max(128, '비밀번호는 128자 이하여야 합니다.'),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export type AuthOutcome = { ok: true } | { ok: false; message: string };

const ERROR_MESSAGE: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: '이메일 또는 비밀번호가 올바르지 않습니다.',
  SIGNUP_INVITE_REQUIRED: '초대된 이메일만 가입할 수 있습니다. 도입 담당자에게 초대를 요청해주세요.',
  USER_ALREADY_EXISTS: '이미 가입된 이메일입니다. 로그인해주세요.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '이미 가입된 이메일입니다. 로그인해주세요.',
  PASSWORD_TOO_SHORT: '비밀번호는 12자 이상이어야 합니다.',
  PASSWORD_TOO_LONG: '비밀번호는 128자 이하여야 합니다.',
};

async function post(path: string, body: unknown): Promise<AuthOutcome> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: '인터넷 연결을 확인하고 다시 시도해주세요.' };
  }
  if (response.ok) return { ok: true };
  if (response.status === 429) return { ok: false, message: '요청이 너무 많습니다. 1분 뒤 다시 시도해주세요.' };
  const payload = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
  const code = payload?.code ?? payload?.message ?? '';
  return { ok: false, message: ERROR_MESSAGE[code] ?? '로그인 처리 중 오류가 발생했습니다.' };
}

export function signInWithEmail(credentials: Credentials): Promise<AuthOutcome> {
  return post('/api/auth/sign-in/email', credentials);
}

export function signUpWithInvite(credentials: Credentials): Promise<AuthOutcome> {
  return post('/api/auth/sign-up/email', { ...credentials, name: credentials.email.split('@')[0] ?? '강사' });
}

export function signOut(): Promise<AuthOutcome> {
  return post('/api/auth/sign-out', {});
}
