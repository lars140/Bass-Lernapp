// POST /api/login  { identifier (Benutzername oder E-Mail), password }
// -> { ok, user, progress: { version, data } | null }   (Benutzer + Fortschritt in EINER Antwort)
import { handle, rawJson, checkOrigin, readJson, clientIp, methodNotAllowed, HttpError } from '../_lib/http.js';
import * as v from '../_lib/validate.js';
import { assertNotLimited, recordStatements, clearStatement, cleanupStatements } from '../_lib/ratelimit.js';
import { iterationsFromEnv, newPasswordHash, createSession, sessionCookie, progressJson, userJson } from '../_lib/auth.js';
import { pbkdf2, fromBase64, safeEqual } from '../_lib/crypto.js';

const DUMMY_SALT = new Uint8Array(16);
const GENERIC = 'Benutzername oder Passwort stimmt nicht.';

export const onRequestPost = handle(async ({ request, env }) => {
  checkOrigin(request);
  const body = await readJson(request);
  const id = v.identifier(body.identifier);
  const password = v.password(body.password);
  const ip = clientIp(request);
  const keys = [`login:ip:${ip}`, `login:id:${id}`];

  await assertNotLimited(env.DB, [[keys[0], 20], [keys[1], 8]]);

  const column = id.includes('@') ? 'email' : 'username_lc';
  const user = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.password_hash, u.salt, u.iterations, p.data, p.version
       FROM users u LEFT JOIN progress p ON p.user_id = u.id WHERE u.${column} = ?1`
  ).bind(id).first();

  // Auch bei unbekanntem Benutzer rechnen -> gleiche Antwortzeit, keine Benutzer-Erkennung
  const computed = await pbkdf2(password, user ? fromBase64(user.salt) : DUMMY_SALT, user ? user.iterations : iterationsFromEnv(env));
  if (!user || !safeEqual(computed, user.password_hash)) {
    await env.DB.batch(recordStatements(env.DB, keys));
    throw new HttpError(401, 'invalid_credentials', GENERIC);
  }

  const session = await createSession(env, user.id);
  const stmts = [session.statement, clearStatement(env.DB, keys[1]), ...cleanupStatements(env.DB)];

  // Hash-Upgrade: wurden die Iterationen erhöht, wird der Hash beim nächsten Login erneuert
  const target = iterationsFromEnv(env);
  if (user.iterations < target) {
    const n = await newPasswordHash(password, target);
    stmts.push(env.DB.prepare('UPDATE users SET password_hash = ?1, salt = ?2, iterations = ?3 WHERE id = ?4').bind(n.hash, n.salt, n.iterations, user.id));
  }
  await env.DB.batch(stmts);

  const progress = user.data != null ? { version: user.version, data: user.data } : null;
  return rawJson(`{"ok":true,"user":${userJson(user)},"progress":${progressJson(progress)}}`, 200, { 'set-cookie': sessionCookie(request, session.token) });
});

export const onRequest = () => methodNotAllowed();
