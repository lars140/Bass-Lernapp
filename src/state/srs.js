// Wiederholungssystem (Spaced Repetition, vereinfachtes SM-2).
// Jede abgeschlossene Quiz-/Riff-/Griffbrett-Übung wird zu einer „Karte“. Karten werden in wachsenden Abständen
// als kurze Aufwärm-Übung wiederholt. Alles liegt im normalen Fortschritt (state.srs), es gibt keine eigenen API-Aufrufe.
//
// Karte: srs[id] = [fälligTag, Intervall in Tagen, Ease×100, Wiederholungen]
// Karten-IDs: "q:<lektion>#<schritt>" (Quiz), "r:<lektion>#<schritt>" (Riff), "f:<lektion>#<schritt>" (Griffbrett-Quiz)
import { commit, getState } from './store.js';
import { dayNumber } from './dates.js';

export const MAX_CARDS = 500;   // Server erlaubt 600
const MAX_INTERVAL = 180;

const KINDS = { quiz: 'q', tab: 'r', fretquiz: 'f' };

/** Karten-ID zu einem Lektionsschritt oder null, wenn der Schritt keine Karte ergibt. */
export function cardIdFor(lessonId, idx, step) {
  const k = KINDS[step.type];
  if (!k) return null;
  if (step.type === 'tab' && !(step.riff && step.riff.id)) return null;
  return `${k}:${lessonId}#${idx}`;
}

export function parseCardId(id) {
  const m = /^([qrf]):([\w-]+)#(\d+)$/.exec(id);
  return m ? { kind: m[1], lessonId: m[2], idx: Number(m[3]) } : null;
}

/** Neue Karten anlegen (erste Wiederholung morgen). Gibt die Anzahl neuer Karten zurück. */
export function register(ids) {
  const s = getState();
  const fresh = ids.filter((id) => id && !s.srs[id]);
  if (!fresh.length) return 0;
  const room = MAX_CARDS - Object.keys(s.srs).length;
  const take = fresh.slice(0, Math.max(0, room));
  if (!take.length) return 0;
  const today = dayNumber();
  commit((st) => { for (const id of take) st.srs[id] = [today + 1, 1, 250, 0]; });
  return take.length;
}

/** Fällige Karten, die am längsten überfälligen zuerst. */
export function dueIds(max = Infinity, s = getState()) {
  const today = dayNumber();
  return Object.entries(s.srs).filter(([, c]) => c[0] <= today).sort((a, b) => a[1][0] - b[1][0]).slice(0, max).map(([id]) => id);
}

export function dueCount(s = getState()) {
  const today = dayNumber();
  let n = 0;
  for (const c of Object.values(s.srs)) if (c[0] <= today) n++;
  return n;
}

/** Nächster Zustand einer Karte nach einer Bewertung ('again' | 'good' | 'easy'). Rein, damit testbar. */
export function nextCard(card, quality, today = dayNumber()) {
  let [, ivl, ease, reps] = card;
  if (quality === 'again') {
    reps = 0; ivl = 1; ease = Math.max(130, ease - 20);
  } else if (quality === 'easy') {
    reps += 1; ease += 10;
    ivl = reps === 1 ? 3 : Math.round(Math.max(ivl, 1) * (ease / 100) * 1.3);
  } else {
    reps += 1;
    ivl = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(Math.max(ivl, 1) * (ease / 100));
  }
  ivl = Math.min(MAX_INTERVAL, Math.max(1, ivl));
  return [today + ivl, ivl, ease, reps];
}

export function grade(id, quality) {
  commit((st) => {
    const c = st.srs[id];
    if (c) st.srs[id] = nextCard(c, quality);
  });
}

/** Karte entfernen (z. B. wenn die Lektion nicht mehr existiert). */
export function dropCards(ids) {
  if (!ids.length) return;
  commit((st) => { for (const id of ids) delete st.srs[id]; });
}

/** Kennzahlen für die Statistik. */
export function srsStats(s = getState()) {
  const cards = Object.values(s.srs);
  return { total: cards.length, due: dueCount(s), mature: cards.filter((c) => c[1] >= 21).length };
}
