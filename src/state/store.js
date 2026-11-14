// Lokaler Fortschrittsspeicher (local-first).
// - Jede Änderung wird SOFORT in localStorage gespeichert.
// - `dirty` markiert, dass der Server noch nicht aktuell ist (wird in Phase 2 vom Sync genutzt).
// - Das Format ist versioniert (`v`) und wird per migrate() auf den aktuellen Stand gebracht.
import { emit } from './events.js';

export const SCHEMA_VERSION = 1;
const KEY = 'bass.progress';
const META_KEY = 'bass.meta';

export function defaults() {
  return {
    v: SCHEMA_VERSION,
    rev: 0,             // zählt jede lokale Änderung (für den Sync in Phase 2)
    updatedAt: 0,       // ms seit 1970
    resetAt: 0,         // Zeitpunkt eines „Fortschritt zurücksetzen“ (Merge: neuerer Reset gewinnt)
    xp: 0,
    streak: { count: 0, best: 0, last: null, freezes: 1, freezeWeek: null },
    done: {},           // lessonId -> Zeitstempel des Abschlusses
    steps: {},          // lessonId -> Anzahl abgeschlossener Schritte
    pos: null,          // { lesson, step }: aktuelle Position
    badges: {},         // badgeId -> Zeitstempel
    records: {},        // riffId -> höchstes sauberes Tempo (BPM)
    days: {},           // 'YYYY-MM-DD' -> Übungssekunden
    stats: { rhythmPerfect: 0, quizCorrect: 0, earPassed: 0, micPassed: 0, jamsDone: 0 },
    settings: { theme: 'dark', lefty: false, goal: 10, volume: 0.8, sounds: true, latencyMs: 0 },
  };
}

/** Bringt ältere Formate auf den aktuellen Stand. Neue Felder werden mit Defaults aufgefüllt. */
export function migrate(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...raw };
  out.streak = { ...base.streak, ...(raw.streak || {}) };
  out.settings = { ...base.settings, ...(raw.settings || {}) };
  out.stats = { ...base.stats, ...(raw.stats || {}) };
  for (const k of ['done', 'steps', 'badges', 'records', 'days']) out[k] = { ...(raw[k] || {}) };
  // zukünftige Versionssprünge hier einfügen: if (raw.v < 2) { ... }
  out.v = SCHEMA_VERSION;
  return out;
}

let state = defaults();
let meta = { dirty: false, lastSyncedRev: 0 };
const listeners = new Set();
let memoryFallback = null;

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return memoryFallback && memoryFallback[key]; }
}
function writeStorage(key, val) {
  try { localStorage.setItem(key, val); } catch {
    memoryFallback = memoryFallback || {};
    memoryFallback[key] = val;
  }
}

export function load() {
  try { state = migrate(JSON.parse(readStorage(KEY) || 'null')); } catch { state = defaults(); }
  try { meta = { ...meta, ...JSON.parse(readStorage(META_KEY) || '{}') }; } catch { /* ignore */ }
  return state;
}

export function getState() { return state; }
export function getSettings() { return state.settings; }
export function isDirty() { return meta.dirty; }
export function markClean() { meta.dirty = false; meta.lastSyncedRev = state.rev; writeStorage(META_KEY, JSON.stringify(meta)); }

/** Ändert den Zustand: mutate(state) ausführen, speichern, Listener informieren. */
export function commit(mutate) {
  mutate(state);
  state.rev++;
  state.updatedAt = Date.now();
  meta.dirty = true;
  writeStorage(KEY, JSON.stringify(state));
  writeStorage(META_KEY, JSON.stringify(meta));
  listeners.forEach((fn) => fn(state));
  emit('state', state);
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function exportJson() {
  return JSON.stringify({ app: 'bass-lernen', exportedAt: new Date().toISOString(), progress: state }, null, 2);
}

/** Importiert eine Export-Datei. Wirft bei ungültigem Inhalt. */
export function importJson(text) {
  const data = JSON.parse(text);
  const p = data && data.progress ? data.progress : data;
  if (!p || typeof p !== 'object' || typeof p.xp !== 'number') throw new Error('Ungültige Datei');
  const next = migrate(p);
  commit((s) => { Object.assign(s, next, { rev: s.rev }); });
}

export function resetAll() {
  const keepSettings = state.settings;
  commit((s) => { Object.assign(s, defaults(), { rev: s.rev, settings: keepSettings, resetAt: Date.now() }); });
}

/** Ersetzt den lokalen Stand (z. B. nach dem Zusammenführen mit dem Server). */
export function replaceState(next, { dirty }) {
  state = migrate(next);
  state.rev = Math.max(state.rev, 0) + 1;
  meta.dirty = !!dirty;
  writeStorage(KEY, JSON.stringify(state));
  writeStorage(META_KEY, JSON.stringify(meta));
  listeners.forEach((fn) => fn(state));
  emit('state', state);
}

export function setDirty(v) { meta.dirty = !!v; writeStorage(META_KEY, JSON.stringify(meta)); }

/** Lokale Daten entfernen (z. B. beim Abmelden auf einem geteilten Gerät); Einstellungen bleiben. */
export function clearLocal() {
  const keep = state.settings;
  state = { ...defaults(), settings: keep, rev: state.rev + 1 };
  meta = { dirty: false, lastSyncedRev: 0 };
  writeStorage(KEY, JSON.stringify(state));
  writeStorage(META_KEY, JSON.stringify(meta));
  listeners.forEach((fn) => fn(state));
  emit('state', state);
}
