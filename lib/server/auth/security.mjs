export function authSecuritySettings(environment = process.env.NODE_ENV) {
  const secure = environment === 'production';
  return Object.freeze({
    secure,
    session: Object.freeze({ expiresIn: 60 * 60 * 24 * 7, disableSessionRefresh: true }),
    sessionCookie: Object.freeze({ httpOnly: true, secure, sameSite: 'lax', path: '/' }),
  });
}
