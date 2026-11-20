/** Serializable Server Action outcome shared by server actions and client wrappers. */
export type ActionErrorCode = 'AUTH_REQUIRED' | 'INVALID_INPUT' | 'NOT_FOUND' | 'DB_UNAVAILABLE' | (string & {});

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string };
