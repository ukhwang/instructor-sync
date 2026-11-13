/**
 * Crypto random token generator
 * TTL: 14 days (336 hours)
 */

export function generateCryptoToken(length: number = 24): string {
  const size = Math.max(length, 21);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is required to issue homework tokens');
  }
  const array = new Uint8Array(size);
  crypto.getRandomValues(array);
  let result = '';
  for (let i = 0; i < size; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

export function getSeoulDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getSeoulDateTimeString(dateString: string | Date | null | undefined): string {
  if (!dateString) return '—';
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function get14DaysExpiryISO(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString();
}
