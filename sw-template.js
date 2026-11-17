/* Service Worker (wird beim Build mit Dateiliste und Version befüllt).
   - Alle statischen Dateien werden beim ersten Besuch vorab gecacht -> offline nutzbar.
   - /api/* wird NIE angefasst oder gecacht.
   - Ein Service Worker darf eine Anfrage nie mit einem fehlgeschlagenen Promise beantworten: Der Browser zeigt sonst
     „net::ERR_FAILED“ (bei Navigation sogar eine Fehlerseite statt der App). Darum liefern alle Pfade eine Response. */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;

// Ohne diese Dateien läuft die App nicht: Schlägt ihr Laden fehl, wird die Installation abgebrochen (der alte Worker bleibt aktiv).
const isCritical = (u) => u === '/' || u === '/index.html' || u === '/manifest.webmanifest' || u.startsWith('/assets/');
const isHtmlUrl = (u) => u === '/' || u === '/index.html';
const isHtml = (res) => (res.headers.get('content-type') || '').includes('text/html');

// Gültige Antwort für eine Datei? Hosting-Plattformen liefern für unbekannte Pfade oft die Startseite (200, text/html):
// Das darf nicht unter dem Namen einer JSON-/Audio-/JS-Datei im Cache landen.
const usable = (url, res) => res && res.ok && (isHtmlUrl(url) || !isHtml(res));

// Umgeleitete Antworten (z. B. /index.html -> / bei Cloudflare Pages, 308) dürfen NICHT als Antwort auf eine Seitennavigation
// ausgeliefert werden: Der Browser meldet dann „net::ERR_FAILED“ (erst nach der Installation des Service Workers, daher
// klappt der erste Besuch und danach nicht mehr). Darum wird jede Antwort vor dem Speichern/Ausliefern „glatt gezogen“.
async function plain(res) {
  if (!res || !res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function precache() {
  const cache = await caches.open(VERSION);
  const results = await Promise.allSettled(PRECACHE.map(async (u) => {
    const res = await fetch(new Request(u, { cache: 'reload' }));
    if (!usable(u, res)) throw new Error(`${u}: ${res.status} ${res.headers.get('content-type')}`);
    await cache.put(u, await plain(res));
  }));
  const bad = results.map((r, i) => (r.status === 'rejected' ? PRECACHE[i] : null)).filter(Boolean);
  if (bad.some(isCritical)) throw new Error('Wichtige Dateien nicht ladbar: ' + bad.filter(isCritical).join(', '));
  // Nicht kritische Dateien (z. B. Samples) werden bei Bedarf nachgeladen und dann gespeichert (siehe fetch).
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const OFFLINE_PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Offline</title><body style="font:16px system-ui;padding:24px;background:#0f1318;color:#e8edf3">'
  + '<h1>Gerade keine Verbindung</h1><p>Die App konnte nicht geladen werden. Bitte prüfe deine Internetverbindung und lade die Seite neu.</p>';

async function handleNavigate(req) {
  const cached = await caches.match('/') || await caches.match('/index.html');
  if (cached) return plain(cached);
  try {
    const res = await fetch(req);
    if (res) return await plain(res);
  } catch { /* offline und nichts im Cache */ }
  return new Response(OFFLINE_PAGE, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function handleAsset(req, url) {
  const cached = await caches.match(req, { ignoreSearch: true });
  if (cached) return plain(cached);
  try {
    const res = await fetch(req);
    // Gültige Antworten für spätere Offline-Nutzung merken (nicht die Startseite unter fremdem Namen)
    if (usable(url.pathname, res)) {
      const copy = res.clone();
      plain(copy).then((p) => caches.open(VERSION).then((c) => c.put(req, p))).catch(() => {});
    }
    return await plain(res);
  } catch {
    // Keine Verbindung und nicht im Cache: normale Fehlerantwort statt abgebrochener Anfrage
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // niemals cachen, nie anfassen
  if (req.mode === 'navigate') { e.respondWith(handleNavigate(req)); return; }
  e.respondWith(handleAsset(req, url));
});
