// Optional: Cloudflare Turnstile bei der Registrierung. Aktiv nur, wenn TURNSTILE_SECRET gesetzt ist.
import { HttpError, clientIp } from './http.js';

export async function verifyTurnstile(env, request, token) {
  if (!env.TURNSTILE_SECRET) return; // per Konfiguration abgeschaltet
  if (typeof token !== 'string' || !token || token.length > 2048) throw new HttpError(400, 'captcha', 'Bitte die Bot-Prüfung abschließen.');
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: clientIp(request) });
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (!data.success) throw new HttpError(400, 'captcha', 'Bot-Prüfung fehlgeschlagen. Bitte erneut versuchen.');
}
