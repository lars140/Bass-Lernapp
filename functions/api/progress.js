// PUT /api/progress  { version, data }   (POST ist identisch, für navigator.sendBeacon)
// Optimistische Sperre: `version` ist die Server-Version, auf der der Client aufbaut.
//   200 { ok, version }                       gespeichert
//   409 { error: conflict, progress }         Server hat Neueres -> Client führt zusammen und sendet erneut
// D1: Auth-Join (1 Lesen) + 1 Schreiben.
import { handle, json, rawJson, fail, checkOrigin, readJson, methodNotAllowed } from '../_lib/http.js';
import { loadSession, cookieHeaders, progressJson } from '../_lib/auth.js';
import { progressData } from '../_lib/validate.js';

const save = handle(async ({ request, env }) => {
  checkOrigin(request);
  const session = await loadSession(request, env);
  if (!session) return fail(401, 'unauthorized', 'Nicht angemeldet.');
  const body = await readJson(request);
  const base = Number.isInteger(body.version) && body.version >= 0 ? body.version : null;
  if (base === null) return fail(400, 'invalid_input', 'Ungültige Version.');
  const text = progressData(body.data);
  const now = Date.now();
  const uid = session.user.id;

  let changed;
  if (base === 0) {
    changed = (await env.DB.prepare('INSERT OR IGNORE INTO progress (user_id, data, version, updated_at) VALUES (?1, ?2, 1, ?3)').bind(uid, text, now).run()).meta.changes;
  } else {
    changed = (await env.DB.prepare('UPDATE progress SET data = ?1, version = version + 1, updated_at = ?2 WHERE user_id = ?3 AND version = ?4').bind(text, now, uid, base).run()).meta.changes;
  }
  if (changed) return json({ ok: true, version: base + 1 }, 200, cookieHeaders(session));

  // Konflikt: aktuellen Stand mitschicken, damit der Client ohne weiteren Aufruf zusammenführen kann
  const cur = await env.DB.prepare('SELECT data, version FROM progress WHERE user_id = ?1').bind(uid).first();
  const err = '{"code":"conflict","message":"Der Fortschritt wurde auf einem anderen Gerät geändert."}';
  return rawJson(`{"ok":false,"error":${err},"progress":${progressJson(cur)}}`, 409, cookieHeaders(session));
});

export const onRequestPut = save;
export const onRequestPost = save;
export const onRequest = () => methodNotAllowed();
