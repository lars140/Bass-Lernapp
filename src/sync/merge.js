// Zusammenführen zweier Fortschrittsstände (Gerät A + Gerät B, oder Gast + Konto).
// Regeln: abgeschlossene Lektionen und Abzeichen vereinigen, jeweils höchste XP/Rekorde/Schritte behalten,
// neueste Position und Einstellungen nehmen. Ein neuerer „Zurücksetzen“-Zeitpunkt gewinnt komplett.
import { migrate } from '../state/store.js';

const maxMerge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] || 0, v);
  return out;
};
const minMerge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = out[k] ? Math.min(out[k], v) : v;
  return out;
};

/** Wiederholungs-Karten: pro Karte den Stand mit mehr Wiederholungen behalten (bei Gleichstand den später fälligen). */
function mergeSrs(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const o = out[k];
    if (!o || v[3] > o[3] || (v[3] === o[3] && v[0] > o[0])) out[k] = v;
  }
  return out;
}

function mergeStreak(a, b) {
  const [x, y] = (a.last || '') >= (b.last || '') ? [a, b] : [b, a]; // x = aktuellere Streak
  return {
    count: x.last === y.last ? Math.max(x.count, y.count) : x.count,
    best: Math.max(a.best, b.best),
    last: x.last || y.last,
    freezes: x.freezes,
    freezeWeek: x.freezeWeek,
  };
}

export function mergeProgress(localRaw, remoteRaw) {
  const a = migrate(localRaw);
  const b = migrate(remoteRaw);
  // Ein späteres „Zurücksetzen“ ersetzt alles, was davor passiert ist
  if (a.resetAt > b.resetAt) return a;
  if (b.resetAt > a.resetAt) return b;

  const newer = a.updatedAt >= b.updatedAt ? a : b;
  return {
    ...newer,
    v: Math.max(a.v, b.v),
    rev: Math.max(a.rev, b.rev),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    resetAt: a.resetAt,
    xp: Math.max(a.xp, b.xp),
    streak: mergeStreak(a.streak, b.streak),
    done: minMerge(a.done, b.done),
    steps: maxMerge(a.steps, b.steps),
    pos: newer.pos || a.pos || b.pos,
    badges: minMerge(a.badges, b.badges),
    records: maxMerge(a.records, b.records),
    days: maxMerge(a.days, b.days),
    stats: maxMerge(a.stats, b.stats),
    srs: mergeSrs(a.srs, b.srs),
    skipped: minMerge(a.skipped, b.skipped),
    placement: (a.placement && b.placement) ? (a.placement.at >= b.placement.at ? a.placement : b.placement) : (a.placement || b.placement),
    settings: { ...newer.settings },
  };
}

/** Gleicher Inhalt? (rev/updatedAt zählen nicht) – bestimmt, ob nach dem Merge noch gesendet werden muss. */
export function sameContent(x, y) {
  const strip = (o) => { const c = { ...o }; delete c.rev; delete c.updatedAt; return JSON.stringify(sortKeys(c)); };
  return strip(x) === strip(y);
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
