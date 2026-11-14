// Sessions: zufälliges Token im Cookie, in D1 nur als SHA-256-Hash. 30 Tage, rollierend.
import { getCookie, cookieHeader, SESSION_COOKIE } from './http.js';
import { randomToken, sha256Hex, randomBytes, toBase64, pbkdf2 } from './crypto.js';

export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const EXTEND_AFTER_MS = 24 * 3600 * 1000; // höchstens 1 Schreibvorgang pro Tag zum Verlängern

/** PBKDF2-Iterationen. Max. 100000 (Workers-Limit). Über Umgebungsvariable PBKDF2_ITERATIONS änderbar. */
export function iterationsFromEnv(env) {
  const n = Number(env.PBKDF2_ITERATIONS) || 100000;
  return Math.max(10000, Math.min(100000, Math.floor(n)));
}

export async function newPasswordHash(password, iterations) {
  const salt = randomBytes(16);
  return { salt: toBase64(salt), iterations, hash: await pbkdf2(password, salt, iterations) };
}

export async function createSession(env, userId) {
  const token = randomToken();
  const hash = await sha256Hex(token);
  const expires = Date.now() + SESSION_TTL_MS;
  return { token, statement: env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)').bind(hash, userId, expires) };
}

export const sessionCookie = (request, token) => cookieHeader(request, token, SESSION_TTL_MS / 1000);
export const clearCookie = (request) => cookieHeader(request, '', 0);

/**
 * Lädt Sitzung, Benutzer UND Fortschritt mit EINER Abfrage.
 * @returns {null | {tokenHash, user:{id,username,email,createdAt}, progress:{version,data}|null, setCookie:string|null}}
 */
export async function loadSession(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.created_at, s.expires_at, p.data, p.version
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN progress p ON p.user_id = u.id
      WHERE s.token_hash = ?1 AND s.expires_at > ?2`
  ).bind(tokenHash, now).first();
  if (!row) return null;

  let setCookie = null;
  if (row.expires_at - now < SESSION_TTL_MS - EXTEND_AFTER_MS) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ?1 WHERE token_hash = ?2').bind(now + SESSION_TTL_MS, tokenHash).run();
    setCookie = sessionCookie(request, token);
  }
  return {
    tokenHash,
    user: { id: row.id, username: row.username, email: row.email, createdAt: row.created_at },
    progress: row.data != null ? { version: row.version, data: row.data } : null,
    setCookie,
  };
}

export const cookieHeaders = (session) => (session && session.setCookie ? { 'set-cookie': session.setCookie } : {});

/** `{"version":3,"data":{...}}` aus gespeichertem JSON-Text bauen, ohne neu zu parsen. */
export const progressJson = (p) => (p ? `{"version":${p.version},"data":${p.data}}` : 'null');
export const userJson = (u) => JSON.stringify({ username: u.username, email: u.email });
