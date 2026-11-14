// Dünner fetch-Wrapper. Wirft nie: Netzwerkfehler und unerwartete Antworten werden zu einem Ergebnisobjekt.
// ok === true NUR, wenn der Server `{ ok: true }` als JSON geliefert hat. Läuft Cloudflare im „Fail open“-Modus
// (Tageslimit erreicht), liefert /api/* keine JSON-Antwort -> die App behandelt das wie „offline“.
export async function api(method, path, body, { keepalive = false } = {}) {
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      keepalive,
    });
    let data = null;
    try { data = await res.json(); } catch { /* keine JSON-Antwort */ }
    const valid = data && typeof data === 'object' && 'ok' in data;
    return { status: res.status, ok: !!(valid && data.ok === true && res.ok), data: valid ? data : null, unavailable: !valid };
  } catch {
    return { status: 0, ok: false, data: null, unavailable: true };
  }
}
