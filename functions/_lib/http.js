// HTTP-Helfer: einheitliche JSON-Antworten, Fehlerformat, Origin-Prüfung (CSRF), Cookies.
//
// Erfolg: { ok: true, ... }        Fehler: { ok: false, error: { code, message } }

export const SESSION_COOKIE = 'bass_session';

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const BASE_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

/** Antwort aus bereits serialisiertem JSON (spart parse+stringify der Fortschrittsdaten). */
export function rawJson(text, status = 200, headers = {}) {
  return new Response(text, { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function fail(status, code, message, extra = {}) {
  return json({ ok: false, error: { code, message }, ...extra }, status);
}

/** Umschließt einen Handler: HttpError -> sauberes JSON, alles andere -> 500 ohne Details. */
export function handle(fn) {
  return async (ctx) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.code, e.message, e.extra);
      console.error('API-Fehler:', e && e.message);
      return fail(500, 'server_error', 'Unerwarteter Fehler. Bitte später erneut versuchen.');
    }
  };
}

export const methodNotAllowed = () => fail(405, 'method_not_allowed', 'Methode nicht erlaubt');

/**
 * CSRF-Schutz zusätzlich zu SameSite=Lax: Anfragen, die etwas ändern, müssen vom
 * eigenen Origin kommen. Fehlt der Origin-Header, muss Sec-Fetch-Site "same-origin" sein.
 */
export function checkOrigin(request) {
  const origin = request.headers.get('origin');
  const self = new URL(request.url).origin;
  if (origin) {
    if (origin !== self) throw new HttpError(403, 'bad_origin', 'Anfrage nicht erlaubt');
    return;
  }
  const site = request.headers.get('sec-fetch-site');
  if (site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'bad_origin', 'Anfrage nicht erlaubt');
}

export async function readJson(request, maxBytes = 70000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'too_large', 'Anfrage zu groß');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'Anfrage zu groß');
  try {
    const v = JSON.parse(text);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('kein Objekt');
    return v;
  } catch {
    throw new HttpError(400, 'bad_json', 'Ungültige Anfrage');
  }
}

export const clientIp = (request) => request.headers.get('cf-connecting-ip') || 'unknown';

export function getCookie(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** HttpOnly + SameSite=Lax; Secure nur über https (auf http://localhost sonst unbrauchbar). */
export function cookieHeader(request, token, maxAgeSeconds) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}
