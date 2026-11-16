// Testet den Service Worker mit Stubs: Er darf nie eine abgelehnte Antwort liefern (sonst „net::ERR_FAILED“ auf dem Handy)
// und keine Hosting-Fallback-Seite unter dem Namen einer Datei speichern. node scripts/test-sw.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/assets/app-1.js', '/content/level1.json', '/samples/bass/m28.flac'];
const src = readFileSync('sw-template.js', 'utf8').replace('__VERSION__', 'bass-test').replace('__PRECACHE__', JSON.stringify(PRECACHE));

function makeWorker(net) {
  const stores = new Map();
  const path = (r) => new URL(typeof r === 'string' ? r : r.url, 'https://x.test').pathname;
  const open = (name) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); };
  const caches = {
    open: async (n) => { const s = open(n); return { put: async (r, res) => { s.set(path(r), res); }, addAll: async (rs) => { for (const r of rs) s.set(path(r), await fetchStub(r)); } }; },
    match: async (r, o = {}) => { for (const s of stores.values()) { const hit = s.get(path(r)); if (hit) return hit.clone ? hit.clone() : hit; } return undefined; },
    keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n),
  };
  const handlers = {};
  const self = { location: { origin: 'https://x.test' }, addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() } };
  const fetchStub = async (r) => net(new URL(typeof r === 'string' ? r : r.url, 'https://x.test').pathname, r);
  class SwRequest extends Request { constructor(u, o) { super(new URL(u, 'https://x.test'), o); } }
  vm.runInNewContext(src, { self, caches, fetch: fetchStub, Request: SwRequest, Response, URL, Promise, console });
  const run = async (type, extra = {}) => { let p; handlers[type]({ waitUntil: (x) => { p = x; }, respondWith: (x) => { p = x; }, ...extra }); return p; };
  return { run, stores, handlers };
}
const ok = (body, type) => new Response(body, { status: 200, headers: { 'content-type': type } });
const html = () => ok('<!doctype html>app', 'text/html; charset=utf-8');
const healthy = (p) => p.endsWith('.js') ? ok('x', 'application/javascript') : p.endsWith('.json') ? ok('{}', 'application/json') : p.endsWith('.flac') ? ok('fLaC', 'audio/x-flac') : p === '/manifest.webmanifest' ? ok('{}', 'application/manifest+json') : html();
const nav = (url = 'https://x.test/') => ({ request: { method: 'GET', url, mode: 'navigate' } });
const get = (url) => ({ request: { method: 'GET', url, mode: 'no-cors' } });

// 1) Normale Installation, danach läuft alles aus dem Cache – auch ohne Netz
{
  const w = makeWorker(async (p) => healthy(p));
  await w.run('install');
  w.handlers.fetch && 0;
  const offline = makeWorker(async () => { throw new TypeError('Failed to fetch'); });
  offline.stores.set('bass-test', w.stores.get('bass-test'));
  const r = await offline.run('fetch', nav());
  assert.equal(r.status, 200); assert.match(await r.text(), /app/);
  assert.equal((await offline.run('fetch', get('https://x.test/content/level1.json'))).status, 200);
}
// 2) Navigation ohne Cache und ohne Netz: Hinweisseite statt abgelehnter Antwort
{
  const w = makeWorker(async () => { throw new TypeError('Failed to fetch'); });
  const r = await w.run('fetch', nav());
  assert.equal(r.status, 503); assert.match(await r.text(), /keine Verbindung/);
}
// 3) Datei nicht im Cache, Netz weg: normale 504-Antwort statt Fehlschlag
{
  const w = makeWorker(async () => { throw new TypeError('Failed to fetch'); });
  const r = await w.run('fetch', get('https://x.test/favicon.ico'));
  assert.equal(r.status, 504);
}
// 4) Datei nicht im Cache, Netz da: Antwort kommt durch und wird für später gespeichert
{
  const w = makeWorker(async (p) => healthy(p));
  await w.run('install');
  const r = await w.run('fetch', get('https://x.test/content/neu.json'));
  assert.equal(r.status, 200);
  await new Promise((x) => setTimeout(x, 5));
  assert.ok(w.stores.get('bass-test').has('/content/neu.json'));
}
// 5) Hosting-Fallback (Startseite statt Datei) wird nicht unter dem Dateinamen gespeichert; unkritische Dateien brechen die Installation nicht ab
{
  const w = makeWorker(async (p) => (p === '/samples/bass/m28.flac' || p === '/content/level1.json' ? html() : healthy(p)));
  await w.run('install');                                   // darf nicht werfen
  const s = w.stores.get('bass-test');
  assert.ok(!s.has('/samples/bass/m28.flac') && !s.has('/content/level1.json'), 'Fallback-HTML nicht gespeichert');
  assert.ok(s.has('/assets/app-1.js') && s.has('/index.html'));
}
// 6) Kritische Datei fehlt: Installation schlägt fehl (der alte Worker bleibt aktiv)
{
  const w = makeWorker(async (p) => (p === '/assets/app-1.js' ? html() : healthy(p)));
  await assert.rejects(w.run('install'), /Wichtige Dateien/);
  const w2 = makeWorker(async (p) => { if (p === '/assets/app-1.js') throw new TypeError('Failed to fetch'); return healthy(p); });
  await assert.rejects(w2.run('install'), /Wichtige Dateien/);
}
// 7) Die API wird nie angefasst; andere Methoden und fremde Hosts auch nicht
{
  const w = makeWorker(async (p) => healthy(p));
  let called = false;
  w.handlers.fetch({ request: { method: 'GET', url: 'https://x.test/api/me', mode: 'cors' }, respondWith: () => { called = true; } });
  w.handlers.fetch({ request: { method: 'POST', url: 'https://x.test/x', mode: 'cors' }, respondWith: () => { called = true; } });
  w.handlers.fetch({ request: { method: 'GET', url: 'https://fremd.test/x.js', mode: 'cors' }, respondWith: () => { called = true; } });
  assert.equal(called, false);
}
// 8) Alter Cache wird beim Aktivieren gelöscht
{
  const w = makeWorker(async (p) => healthy(p));
  w.stores.set('bass-alt', new Map());
  await w.run('activate');
  assert.ok(!w.stores.has('bass-alt'));
}
console.log('✓ Service-Worker-Tests bestanden');
