// GET /api/export -> alle gespeicherten Daten des Benutzers als JSON-Download (DSGVO).
import { handle, fail, methodNotAllowed } from '../_lib/http.js';
import { loadSession } from '../_lib/auth.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const session = await loadSession(request, env);
  if (!session) return fail(401, 'unauthorized', 'Nicht angemeldet.');
  const out = {
    app: 'bass-lernen',
    exportedAt: new Date().toISOString(),
    account: { username: session.user.username, email: session.user.email, createdAt: new Date(session.user.createdAt).toISOString() },
    progressVersion: session.progress ? session.progress.version : null,
    progress: session.progress ? JSON.parse(session.progress.data) : null,
  };
  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': 'attachment; filename="bass-konto-export.json"' },
  });
});

export const onRequest = () => methodNotAllowed();
