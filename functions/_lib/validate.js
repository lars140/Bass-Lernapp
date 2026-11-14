// Serverseitige Eingabevalidierung.
import { HttpError } from './http.js';

const bad = (message) => new HttpError(400, 'invalid_input', message);

export function username(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_.-]{3,24}$/.test(v.trim())) {
    throw bad('Benutzername: 3–24 Zeichen (Buchstaben, Zahlen, _ . -).');
  }
  return v.trim();
}

export function email(v) {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw bad('Bitte eine gültige E-Mail-Adresse angeben.');
  return e;
}

export function password(v) {
  if (typeof v !== 'string' || v.length < 8 || v.length > 128) throw bad('Passwort: 8–128 Zeichen.');
  return v;
}

export function identifier(v) {
  if (typeof v !== 'string' || v.trim().length < 3 || v.length > 254) throw bad('Bitte Benutzername oder E-Mail angeben.');
  return v.trim().toLowerCase();
}

export const ISO_FIELDS = ['xp', 'streak', 'done', 'steps', 'badges', 'records', 'days', 'stats', 'settings'];
export const CURRENT_PROGRESS_VERSION = 2;
const MAX_SRS_CARDS = 600;
const MAX_PROGRESS_BYTES = 60000;

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

/**
 * Prüft und normalisiert den Fortschritt (serverseitige „Migration“).
 * Unbekannte Felder werden verworfen, Typen geprüft. Gibt den JSON-String zum Speichern zurück.
 */
export function progressData(d) {
  if (!isObj(d)) throw bad('Ungültiger Fortschritt.');
  if (!Number.isInteger(d.v) || d.v < 1) throw bad('Ungültige Fortschrittsversion.');
  if (d.v > CURRENT_PROGRESS_VERSION) throw new HttpError(409, 'client_too_new', 'Bitte die App aktualisieren (Seite neu laden).');
  const num = (x, max = 1e9) => Number.isFinite(x) && x >= 0 && x <= max;
  if (!num(d.xp)) throw bad('Ungültige XP.');
  for (const k of ['streak', 'done', 'steps', 'badges', 'records', 'days', 'stats', 'settings']) {
    if (!isObj(d[k])) throw bad(`Ungültiges Feld: ${k}`);
  }
  if (d.pos != null && !isObj(d.pos)) throw bad('Ungültige Position.');
  // Ab Version 2: Wiederholungs-Karten, übersprungene Lektionen, Einstufung (bei v1 leer)
  const srs = d.srs == null ? {} : d.srs;
  const skipped = d.skipped == null ? {} : d.skipped;
  if (!isObj(srs) || !isObj(skipped)) throw bad('Ungültiges Feld: srs');
  const keys = Object.keys(srs);
  if (keys.length > MAX_SRS_CARDS) throw bad('Zu viele Wiederholungs-Karten.');
  for (const k of keys) {
    const v = srs[k];
    if (k.length > 80 || !Array.isArray(v) || v.length !== 4 || !v.every((x) => Number.isFinite(x) && x >= 0 && x <= 1e6)) throw bad('Ungültige Wiederholungs-Karte.');
  }
  if (d.placement != null && !isObj(d.placement)) throw bad('Ungültige Einstufung.');
  const out = {
    v: CURRENT_PROGRESS_VERSION,
    rev: num(d.rev) ? d.rev : 0,
    updatedAt: num(d.updatedAt, 1e14) ? d.updatedAt : 0,
    resetAt: num(d.resetAt, 1e14) ? d.resetAt : 0,
    xp: d.xp,
    streak: d.streak, done: d.done, steps: d.steps, pos: d.pos ?? null,
    badges: d.badges, records: d.records, days: d.days, stats: d.stats, settings: d.settings,
    srs, skipped, placement: d.placement ?? null,
  };
  const text = JSON.stringify(out);
  if (text.length > MAX_PROGRESS_BYTES) throw new HttpError(413, 'too_large', 'Fortschritt zu groß.');
  return text;
}
