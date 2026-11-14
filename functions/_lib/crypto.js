// Kryptografie nur mit der Web Crypto API (keine Bibliotheken).

const enc = new TextEncoder();

export function toBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromBase64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const toBase64Url = (bytes) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }
export const randomToken = () => toBase64Url(randomBytes(32)); // 256 Bit

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * PBKDF2-HMAC-SHA256. Die Workers-Runtime erlaubt max. 100.000 Iterationen.
 * @returns {Promise<string>} base64 (256 Bit)
 */
export async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256);
  return toBase64(new Uint8Array(bits));
}

/** Vergleich in konstanter Zeit (für Hashes gleicher Länge). */
export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Wiederherstellungscode: 16 Zeichen aus einem eindeutigen Alphabet (ohne 0/O/1/I), ~80 Bit.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRecoveryCode() {
  const bytes = randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += ALPHABET[bytes[i] % 32]; // 32 teilt 256 -> kein Bias
  return s.replace(/(.{4})(?=.)/g, '$1-');
}
export const normalizeRecoveryCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashRecoveryCode = (code) => sha256Hex('recovery:' + normalizeRecoveryCode(code));
