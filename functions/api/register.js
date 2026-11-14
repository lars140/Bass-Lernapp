// POST /api/register  { username, email, password, progress?, turnstile? }
// -> { ok, user, recoveryCode, progress: { version } | null }
// D1: 1x Rate-Check (Batch), 1x Insert user, 1x Batch (Fortschritt + Session + Zähler) = 3 Aufrufe.
import { handle, json, checkOrigin, readJson, clientIp, cookieHeader, methodNotAllowed, HttpError } from '../_lib/http.js';
import * as v from '../_lib/validate.js';
import { assertNotLimited, recordStatements } from '../_lib/ratelimit.js';
import { newPasswordHash, iterationsFromEnv, createSession, sessionCookie } from '../_lib/auth.js';
import { newRecoveryCode, hashRecoveryCode } from '../_lib/crypto.js';
import { verifyTurnstile } from '../_lib/turnstile.js';

export const onRequestPost = handle(async ({ request, env }) => {
  checkOrigin(request);
  const body = await readJson(request);
  const username = v.username(body.username);
  const email = v.email(body.email);
  const password = v.password(body.password);
  const progressText = body.progress ? v.progressData(body.progress) : null;

  const ip = clientIp(request);
  await assertNotLimited(env.DB, [[`reg:ip:${ip}`, 5, 3600 * 1000]]);
  await verifyTurnstile(env, request, body.turnstile);

  const { salt, iterations, hash } = await newPasswordHash(password, iterationsFromEnv(env));
  const recoveryCode = newRecoveryCode();
  const recoveryHash = await hashRecoveryCode(recoveryCode);
  const now = Date.now();

  let userId;
  try {
    const row = await env.DB.prepare(
      'INSERT INTO users (username, username_lc, email, password_hash, salt, iterations, recovery_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id'
    ).bind(username, username.toLowerCase(), email, hash, salt, iterations, recoveryHash, now).first();
    userId = row.id;
  } catch (e) {
    if (String(e && e.message).includes('UNIQUE')) {
      await env.DB.batch(recordStatements(env.DB, [`reg:ip:${ip}`]));
      throw new HttpError(409, 'taken', 'Benutzername oder E-Mail ist bereits vergeben.');
    }
    throw e;
  }

  const session = await createSession(env, userId);
  const stmts = [session.statement, ...recordStatements(env.DB, [`reg:ip:${ip}`])];
  if (progressText) {
    stmts.push(env.DB.prepare('INSERT INTO progress (user_id, data, version, updated_at) VALUES (?1, ?2, 1, ?3)').bind(userId, progressText, now));
  }
  await env.DB.batch(stmts);

  return json({ ok: true, user: { username, email }, recoveryCode, progress: progressText ? { version: 1 } : null }, 201, { 'set-cookie': sessionCookie(request, session.token) });
});

export const onRequest = () => methodNotAllowed();
