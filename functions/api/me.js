// GET /api/me -> { ok, user, progress: { version, data } | null }
// Benutzer und Fortschritt in EINER Antwort, 1 D1-Lesevorgang (Join).
import { handle, rawJson, fail, methodNotAllowed } from '../_lib/http.js';
import { loadSession, cookieHeaders, progressJson, userJson } from '../_lib/auth.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const session = await loadSession(request, env);
  if (!session) return fail(401, 'unauthorized', 'Nicht angemeldet.');
  return rawJson(`{"ok":true,"user":${userJson(session.user)},"progress":${progressJson(session.progress)}}`, 200, cookieHeaders(session));
});

export const onRequest = () => methodNotAllowed();
