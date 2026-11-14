// POST /api/reset-password  { identifier, recoveryCode, newPassword }
// Passwort-Reset OHNE E-Mail: mit dem bei der Registrierung angezeigten Wiederherstellungscode.
// Nach Erfolg gibt es einen NEUEN Code (der alte ist verbraucht), alle alten Sitzungen werden beendet.
import { handle, json, checkOrigin, readJson, clientIp, methodNotAllowed, HttpError } from '../_lib/http.js';
import * as v from '../_lib/validate.js';
import { assertNotLimited, recordStatements, clearStatement } from '../_lib/ratelimit.js';
import { iterationsFromEnv, newPasswordHash, createSession, sessionCookie } from '../_lib/auth.js';
import { newRecoveryCode, hashRecoveryCode, safeEqual } from '../_lib/crypto.js';

const GENERIC = 'Die Angaben stimmen nicht.';

export const onRequestPost = handle(async ({ request, env }) => {
  checkOrigin(request);
  const body = await readJson(request);
  const id = v.identifier(body.identifier);
  const newPassword = v.password(body.newPassword);
  if (typeof body.recoveryCode !== 'string' || body.recoveryCode.length > 64) throw new HttpError(400, 'invalid_input', 'Bitte den Wiederherstellungscode angeben.');
  const ip = clientIp(request);
  const keys = [`reset:ip:${ip}`, `reset:id:${id}`];

  await assertNotLimited(env.DB, [[keys[0], 10], [keys[1], 5]]);

  const column = id.includes('@') ? 'email' : 'username_lc';
  const user = await env.DB.prepare(`SELECT id, username, email, recovery_hash FROM users WHERE ${column} = ?1`).bind(id).first();
  const given = await hashRecoveryCode(body.recoveryCode);
  if (!user || !safeEqual(given, user.recovery_hash)) {
    await env.DB.batch(recordStatements(env.DB, keys));
    throw new HttpError(401, 'invalid_recovery', GENERIC);
  }

  const { salt, iterations, hash } = await newPasswordHash(newPassword, iterationsFromEnv(env));
  const recoveryCode = newRecoveryCode();
  const session = await createSession(env, user.id);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?1, salt = ?2, iterations = ?3, recovery_hash = ?4 WHERE id = ?5').bind(hash, salt, iterations, await hashRecoveryCode(recoveryCode), user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(user.id),
    session.statement,
    clearStatement(env.DB, keys[1]),
  ]);
  return json({ ok: true, user: { username: user.username, email: user.email }, recoveryCode }, 200, { 'set-cookie': sessionCookie(request, session.token) });
});

export const onRequest = () => methodNotAllowed();
