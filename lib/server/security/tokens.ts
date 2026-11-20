/**
 * Public-link token handling (audit NV-3).
 *
 * - Lookup:  only sha256(token) is stored (homework.token_hash, milestone_reports.token_hash).
 * - Re-copy: the trainer must be able to copy an existing homework link again, so the
 *            token is also stored AES-256-GCM sealed with a key derived (HKDF) from the
 *            server secret. A database-only leak exposes neither usable tokens nor
 *            plaintext. Rotating the secret only disables "copy link again"; member links
 *            keep working because lookups use the hash.
 * - Logging: never log tokens. Use redactToken() if a reference is ever needed.
 *
 * Uses WebCrypto only (available in Workers and Node >= 20).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export const hashToken = sha256Hex;

const keyCache = new Map<string, Promise<CryptoKey>>();

function sealingKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error('TOKEN_SEALING_SECRET_REQUIRED');
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle
      .importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey'])
      .then((material) =>
        crypto.subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('instructor-sync'), info: encoder.encode('homework-link-seal-v1') },
          material,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      );
    keyCache.set(secret, key);
  }
  return key;
}

/** Returns "v1.<iv>.<ciphertext>" (base64url). */
export async function sealToken(secret: string, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealingKey(secret), encoder.encode(token));
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** Returns null when the value cannot be opened (wrong secret, tampering, legacy row). */
export async function openToken(secret: string, sealed: string | null | undefined): Promise<string | null> {
  if (!sealed) return null;
  const [version, iv, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !data) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(iv) },
      await sealingKey(secret),
      fromBase64Url(data),
    );
    return decoder.decode(plain);
  } catch {
    return null;
  }
}

/** Short, non-reversible reference for diagnostics (never the token itself). */
export async function redactToken(token: string): Promise<string> {
  return `tok_${(await sha256Hex(token)).slice(0, 8)}`;
}

/** 24 lowercase hex chars (96 bits), the format used for homework and report links. */
export function generateLinkToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(12)).buffer);
}
