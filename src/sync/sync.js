// Local-first Sync. Der Fortschritt wird immer zuerst lokal gespeichert; hier wird nur gebündelt gesendet.
//
// Zeitpunkte für Server-Anfragen (Ziel: wenige pro Übungssession):
//   1. App-Start / Login:                 GET  /api/me
//   2. Lektion beendet oder verlassen:    PUT  /api/progress   (nur wenn sich etwas geändert hat)
//   3. Seite verlassen/verstecken:        PUT  /api/progress   (keepalive)
//   4. Alle 3 Minuten bei langen Sitzungen, ebenfalls nur bei Änderungen
// Bei Fehlern (offline, Tageslimit, 5xx) bleibt alles lokal; später wird automatisch erneut versucht.
import { getState, isDirty, markClean, setDirty, replaceState, clearLocal, migrate } from '../state/store.js';
import { mergeProgress, sameContent } from './merge.js';
import { api } from './api.js';
import { emit } from '../state/events.js';

const USER_KEY = 'bass.user';
const MIN_INTERVAL = 3 * 60 * 1000;

let user = null;            // { username, email, version }
let status = 'guest';       // guest | synced | pending | syncing
let busy = false;
let again = false;
let lastPush = 0;
let retryTimer = null;
let retryDelay = 30000;

function loadUser() { try { user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { user = null; } }
function saveUser() { try { user ? localStorage.setItem(USER_KEY, JSON.stringify(user)) : localStorage.removeItem(USER_KEY); } catch { /* ignore */ } }
function setStatus(s) { if (s !== status) { status = s; emit('sync', { status, user }); } }

export const getUser = () => user;
export const getSyncStatus = () => status;

/** Server-Antwort `progress` ({version,data}) mit dem lokalen Stand zusammenführen. */
function applyServer(progress) {
  if (!progress) { user.version = 0; saveUser(); setDirty(true); return; } // Server hat noch nichts: lokalen Stand senden
  user.version = progress.version;
  saveUser();
  const local = getState();
  const remote = migrate(progress.data);
  const merged = mergeProgress(local, remote);
  const needsPush = !sameContent(merged, remote);
  if (!sameContent(merged, local) || needsPush) replaceState(merged, { dirty: needsPush });
  else if (!needsPush) setDirty(false);
}

/** Beim Start: bei vorhandener Anmeldung den Serverstand holen. */
export async function boot() {
  loadUser();
  if (!user) { setStatus('guest'); wire(); return; }
  setStatus(isDirty() ? 'pending' : 'synced');
  wire();
  await pull();
}

export async function pull() {
  if (!user) return;
  const res = await api('GET', '/api/me');
  if (res.ok) { applyServer(res.data.progress); setStatus(isDirty() ? 'pending' : 'synced'); if (isDirty()) push(); }
  else if (res.status === 401) { user = null; saveUser(); setStatus('guest'); }
  else setStatus(isDirty() ? 'pending' : 'synced');
}

/** Nach Login/Registrierung/Reset aufrufen. */
export function startSession(userInfo, progress) {
  user = { username: userInfo.username, email: userInfo.email, version: 0 };
  saveUser();
  applyServer(progress);
  setStatus(isDirty() ? 'pending' : 'synced');
  if (isDirty()) push();
}

/** Sitzung ohne mitgeliefertes Fortschrittsobjekt (z. B. nach Passwort-Reset): Serverstand holen. */
export async function startSessionPull(userInfo) {
  user = { username: userInfo.username, email: userInfo.email, version: 0 };
  saveUser();
  setStatus('pending');
  await pull();
}

export async function push({ keepalive = false, force = false } = {}) {
  if (!user || !isDirty()) return;
  if (!force && !keepalive && Date.now() - lastPush < 2000) return; // Doppelauslösung vermeiden
  if (busy) { again = true; return; }
  busy = true;
  setStatus('syncing');
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const revAtSend = getState().rev;
      const res = await api('PUT', '/api/progress', { version: user.version, data: getState() }, { keepalive });
      lastPush = Date.now();
      if (res.ok) {
        user.version = res.data.version; saveUser();
        if (getState().rev === revAtSend) markClean();
        retryDelay = 30000;
        break;
      }
      if (res.status === 409 && res.data && res.data.progress) {
        // Anderes Gerät war schneller: zusammenführen und erneut senden
        applyServer(res.data.progress);
        continue;
      }
      if (res.status === 401) { user = null; saveUser(); break; }
      scheduleRetry();
      break;
    }
  } finally {
    busy = false;
    setStatus(!user ? 'guest' : isDirty() ? 'pending' : 'synced');
    if (again) { again = false; if (isDirty()) push(); }
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => push({ force: true }), retryDelay);
  retryDelay = Math.min(retryDelay * 2, 10 * 60 * 1000);
}

/** Aus der UI nach „Lektion fertig/verlassen“. */
export function requestSync() { if (user && isDirty()) push(); }

/** Abmelden. Vorher wird (wenn möglich) gesendet; lokale Daten werden entfernt (geteilte Geräte). */
export async function logout() {
  await push({ force: true });
  const unsynced = !!user && isDirty();
  return { unsynced, finish: async () => { await api('POST', '/api/logout', {}); user = null; saveUser(); clearLocal(); setStatus('guest'); } };
}

/** Nach dem Löschen des Kontos: lokal als Gast weitermachen. */
export function accountDeleted() { user = null; saveUser(); setStatus('guest'); }

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push({ keepalive: true }); });
  window.addEventListener('pagehide', () => push({ keepalive: true }));
  window.addEventListener('online', () => { if (user && isDirty()) push({ force: true }); });
  setInterval(() => { if (user && isDirty() && Date.now() - lastPush >= MIN_INTERVAL && document.visibilityState === 'visible') push(); }, 60000);
}

export function initGuestWiring() { wire(); }
