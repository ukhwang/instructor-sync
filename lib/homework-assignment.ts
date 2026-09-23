export type AssignmentPurpose = 'routine' | 'focus' | 'review';
export type AssignmentRequirement = 'required' | 'optional';
export interface InFlightAssignment {
  fingerprint: string;
  request_id: string;
  token: string;
  token_expires_at: string;
}

const STORAGE_KEY = 'homework-assignment-in-flight-v1';
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function burdenMinutesToSeconds(value: string | number | null | undefined): number | null {
  if (value === '' || value == null) return null;
  const minutes = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round(minutes * 60);
}

export function hasRequiredItem(items: Array<{ requirement?: AssignmentRequirement }>): boolean {
  return items.some((item) => item.requirement !== 'optional');
}

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12);
  return `00000000-0000-4000-8000-${random}`;
}

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}

function isInFlightAssignment(value: unknown): value is InFlightAssignment {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<InFlightAssignment>;
  return typeof candidate.fingerprint === 'string'
    && candidate.fingerprint.length > 0
    && isRequestId(candidate.request_id)
    && typeof candidate.token === 'string'
    && candidate.token.length >= 21
    && typeof candidate.token_expires_at === 'string'
    && Number.isFinite(Date.parse(candidate.token_expires_at));
}

export function loadInFlightAssignment(fingerprint: string): InFlightAssignment | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return isInFlightAssignment(value) && value.fingerprint === fingerprint ? value : null;
  } catch {
    return null;
  }
}

export function saveInFlightAssignment(value: InFlightAssignment): void {
  if (typeof window === 'undefined' || !isInFlightAssignment(value)) return;
  try {
    if (!window.sessionStorage) return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch { /* best effort */ }
}

export function clearInFlightAssignment(fingerprint: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!window.sessionStorage) return;
    const current = loadInFlightAssignment(fingerprint);
    if (current?.fingerprint === fingerprint) window.sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* best effort */ }
}
