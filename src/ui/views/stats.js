// Statistik: Übungszeit pro Tag/Woche, Skill-Übersicht, Tempo-Rekorde, Wiederholungen. Alles aus dem lokalen Fortschritt berechnet.
import { h, fmtTime } from '../dom.js';
import { getState } from '../../state/store.js';
import { lastDays } from '../../state/dates.js';
import { srsStats } from '../../state/srs.js';
import { loadAvailableLevels, flattenLessons, loadSkills, loadSongs } from '../../lessons/loader.js';

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Balkendiagramm aus einer Liste { label, value, title }. */
function bars(items, { max, unit = '', label }) {
  const top = Math.max(max, ...items.map((i) => i.value), 1);
  return h('div', { class: 'week stat-bars', role: 'img', 'aria-label': label },
    items.map((i) => h('div', { class: 'wd' },
      h('div', { class: 'wbar' }, h('div', { class: 'wfill', style: `height:${Math.round((i.value / top) * 100)}%`, title: i.title || `${i.value}${unit}` })),
      h('span', { class: 'small muted' }, i.label))));
}

const minutes = (sec) => Math.round(sec / 60);

export async function statsView(root) {
  const s = getState();
  const [levels, skills, songs] = await Promise.all([loadAvailableLevels(), loadSkills(), loadSongs()]);
  const lessons = flattenLessons(levels);

  // ----- Übungszeit -----
  const total = Object.values(s.days).reduce((a, b) => a + b, 0);
  const activeDays = Object.values(s.days).filter((v) => v >= 60).length;
  const days14 = lastDays(14);
  const dayItems = days14.map((d) => ({ label: WD[new Date(d + 'T00:00:00').getDay()], value: minutes(s.days[d] || 0), title: `${d}: ${fmtTime(s.days[d] || 0)}` }));
  const days56 = lastDays(56);
  const weekItems = [];
  for (let w = 0; w < 8; w++) {
    const chunk = days56.slice(w * 7, w * 7 + 7);
    const sec = chunk.reduce((a, d) => a + (s.days[d] || 0), 0);
    const first = new Date(chunk[0] + 'T00:00:00');
    weekItems.push({ label: `${first.getDate()}.${first.getMonth() + 1}.`, value: minutes(sec), title: `Woche ab ${chunk[0]}: ${fmtTime(sec)}` });
  }
  const last7 = days56.slice(-7).reduce((a, d) => a + (s.days[d] || 0), 0);

  // ----- Skills -----
  const areas = Object.entries(skills.areas).map(([key, name]) => {
    const ls = lessons.filter((l) => skills.lessons[l.id] === key);
    const done = ls.filter((l) => s.done[l.id]).length;
    const skipped = ls.filter((l) => s.skipped[l.id]).length;
    return { key, name, total: ls.length, done, skipped };
  });
  const skillRows = areas.map((a) => {
    const pct = a.total ? Math.round((a.done / a.total) * 100) : 0;
    return h('div', { class: 'skill' },
      h('div', { class: 'row between' }, h('strong', null, a.name), h('span', { class: 'muted small' }, `${a.done} von ${a.total}${a.skipped ? ` (${a.skipped} übersprungen)` : ''}`)),
      h('div', { class: 'xpbar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': a.name }, h('div', { class: 'fill', style: `width:${pct}%` })));
  });

  // ----- Tempo-Rekorde -----
  const riffInfo = new Map();
  for (const l of lessons) for (const st of l.steps) if (st.riff && st.riff.id && !riffInfo.has(st.riff.id)) riffInfo.set(st.riff.id, { title: st.riff.title || st.title, where: l.title, start: st.riff.bpm });
  for (const sg of songs) riffInfo.set(sg.riff.id, { title: sg.title, where: 'Song', start: sg.bpm });
  const records = Object.entries(s.records).map(([id, bpm]) => ({ id, bpm, info: riffInfo.get(id) })).sort((a, b) => b.bpm - a.bpm);

  // ----- Wiederholungen -----
  const sr = srsStats(s);

  root.append(h('section', { class: 'view' },
    h('h1', null, 'Statistik'),
    h('div', { class: 'grid3' },
      stat(fmtTime(total), 'Übungszeit gesamt'), stat(String(activeDays), 'Übungstage (≥ 1 Min.)'), stat(fmtTime(last7), 'Letzte 7 Tage')),
    h('div', { class: 'card' }, h('h3', null, 'Übungszeit pro Tag (Minuten, 14 Tage)'), bars(dayItems, { max: Math.max(10, s.settings.goal), unit: ' Min.', label: 'Übungszeit der letzten 14 Tage in Minuten' })),
    h('div', { class: 'card' }, h('h3', null, 'Übungszeit pro Woche (Minuten, 8 Wochen)'), bars(weekItems, { max: 30, unit: ' Min.', label: 'Übungszeit der letzten 8 Wochen in Minuten' })),
    h('div', { class: 'card' }, h('h3', null, 'Skill-Übersicht'),
      h('p', { class: 'muted small' }, 'Wie viele Lektionen pro Bereich du geschafft hast.'), h('div', { class: 'skills' }, skillRows)),
    h('div', { class: 'card' }, h('h3', null, 'Tempo-Rekorde'),
      records.length
        ? h('ul', { class: 'records' }, records.slice(0, 12).map((r) => h('li', { class: 'row between' }, h('span', null, h('strong', null, r.info ? r.info.title : r.id), h('span', { class: 'muted small' }, r.info ? ` · ${r.info.where}` : '')), h('span', { class: 'rec-bpm' }, `${r.bpm} BPM`))))
        : h('p', { class: 'muted' }, 'Noch keine Rekorde. Spiele eine Tempo-Leiter oder markiere in einem Song „Sauber gespielt“.')),
    h('div', { class: 'card' }, h('h3', null, 'Wiederholungen'),
      h('p', null, `${sr.total} Karten im Wiederholungs-System, davon ${sr.due} heute fällig und ${sr.mature} gefestigt (Abstand ab 3 Wochen).`),
      h('p', { class: 'muted small' }, `${s.stats.warmups || 0} Aufwärm-Runden gemacht.`),
      sr.due ? h('a', { class: 'btn primary', href: '#/warmup' }, 'Jetzt aufwärmen') : null),
    h('div', { class: 'card' }, h('h3', null, 'Weitere Zahlen'),
      h('ul', { class: 'plain' },
        h('li', null, `${Object.keys(s.done).length} von ${lessons.length} Lektionen abgeschlossen`),
        h('li', null, `${s.stats.quizCorrect || 0} Quizfragen richtig beantwortet`),
        h('li', null, `${s.stats.earPassed || 0} Gehörbildungen bestanden · ${s.stats.micPassed || 0} Mikrofon-Prüfungen · ${s.stats.jamsDone || 0} Jam-Tracks`),
        h('li', null, `Längste Streak: ${s.streak.best} Tage`))),
    h('p', { class: 'small' }, h('a', { href: '#/profile' }, '← Zurück zum Profil'))));
}

const stat = (big, small) => h('div', { class: 'card center-text' }, h('div', { class: 'stat' }, big), h('div', { class: 'muted small' }, small));
