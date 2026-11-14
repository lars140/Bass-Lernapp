// DELETE /api/account  { password }  -> löscht Konto, Sitzungen und Fortschritt unwiderruflich.
import { handle, json, checkOrigin, readJson, clientIp, methodNotAllowed, HttpError } from '../_lib/http.js';
import * as v from '../_lib/validate.js';
import { loadSession, clearCookie } from '../_lib/auth.js';
import { assertNotLimited, recordStatements } from '../_lib/ratelimit.js';
import { pbkdf2, fromBase64, safeEqual } from '../_lib/crypto.js';

export const onRequestDelete = handle(async ({ request, env }) => {
  checkOrigin(request);
  const session = await loadSession(request, env);
  if (!session) throw new HttpError(401, 'unauthorized', 'Nicht angemeldet.');
  const password = v.password((await readJson(request, 2000)).password);
  const keys = [`del:id:${session.user.id}`];
  await assertNotLimited(env.DB, [[keys[0], 5]]);

  const u = await env.DB.prepare('SELECT password_hash, salt, iterations FROM users WHERE id = ?1').bind(session.user.id).first();
  const computed = await pbkdf2(password, fromBase64(u.salt), u.iterations);
  if (!safeEqual(computed, u.password_hash)) {
    await env.DB.batch(recordStatements(env.DB, keys));
    throw new HttpError(401, 'invalid_credentials', 'Das Passwort stimmt nicht.');
  }
  const uid = session.user.id;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM progress WHERE user_id = ?1').bind(uid),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(uid),
    env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(uid),
  ]);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(request) });
});

export const onRequest = () => methodNotAllowed();
