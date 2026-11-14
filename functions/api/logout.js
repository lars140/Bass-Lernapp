// POST /api/logout  -> löscht die Sitzung in D1 und das Cookie.
import { handle, json, checkOrigin, getCookie, SESSION_COOKIE, methodNotAllowed } from '../_lib/http.js';
import { clearCookie } from '../_lib/auth.js';
import { sha256Hex } from '../_lib/crypto.js';

export const onRequestPost = handle(async ({ request, env }) => {
  checkOrigin(request);
  const token = getCookie(request, SESSION_COOKIE);
  if (token && token.length <= 100) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256Hex(token)).run();
  }
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(request) });
});

export const onRequest = () => methodNotAllowed();
