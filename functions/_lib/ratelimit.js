// Rate-Limiting über die Tabelle login_attempts (kein KV/Durable Object nötig).
// Es werden nur Fehlversuche gezählt -> ein normaler Login verursacht keine zusätzlichen Schreibvorgänge.
import { HttpError } from './http.js';

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Wirft 429, wenn für einen der Schlüssel das Limit erreicht ist.
 * @param {Array<[string, number, number?]>} rules  [key, limit, windowMs]
 */
export async function assertNotLimited(db, rules) {
  const now = Date.now();
  const stmts = rules.map(([key, , win]) => db.prepare('SELECT COUNT(*) AS c FROM login_attempts WHERE key = ?1 AND ts > ?2').bind(key, now - (win || WINDOW_MS)));
  const results = await db.batch(stmts);
  results.forEach((r, i) => {
    if ((r.results[0]?.c || 0) >= rules[i][1]) {
      const secs = Math.ceil((rules[i][2] || WINDOW_MS) / 1000);
      throw new HttpError(429, 'rate_limited', 'Zu viele Versuche. Bitte später erneut versuchen.', { error: { code: 'rate_limited', message: 'Zu viele Versuche. Bitte später erneut versuchen.' }, retryAfter: secs });
    }
  });
}

export function recordStatements(db, keys) {
  const now = Date.now();
  return keys.map((k) => db.prepare('INSERT INTO login_attempts (key, ts) VALUES (?1, ?2)').bind(k, now));
}

export const clearStatement = (db, key) => db.prepare('DELETE FROM login_attempts WHERE key = ?1').bind(key);

/** Aufräumen nebenbei bei erfolgreichen Logins (kein Cron nötig). */
export function cleanupStatements(db) {
  const now = Date.now();
  return [
    db.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now),
    db.prepare('DELETE FROM login_attempts WHERE ts < ?1').bind(now - 24 * 3600 * 1000),
  ];
}
