import { h } from '../dom.js';
import { getState } from '../../state/store.js';
import { currentStreak, levelInfo, todaySeconds } from '../../state/gamify.js';
import { loadAvailableLevels, flattenLessons } from '../../lessons/loader.js';
import { goalRing } from '../widgets.js';
import { dueCount } from '../../state/srs.js';
import { getUser } from '../../sync/sync.js';

export async function homeView(root) {
  const s = getState();
  const levels = await loadAvailableLevels();
  const lessons = flattenLessons(levels);
  const lv = levelInfo(s.xp);
  const due = dueCount(s);

  // „Weiter, wo du aufgehört hast“
  let target = s.pos && lessons.find((l) => l.id === s.pos.lesson);
  let stepNo = target ? s.pos.step : 0;
  if (!target) target = lessons.find((l) => !s.done[l.id]);
  const allDone = !target;
  if (target && !s.pos) stepNo = s.steps[target.id] || 0;

  const started = Object.keys(s.steps).length > 0;
  const card = allDone
    ? h('div', { class: 'card hero' }, h('h2', null, 'Alle verfügbaren Lektionen geschafft 🎉'), h('p', { class: 'muted' }, 'Du hast den ganzen Kurs durch. Halte dein Können mit den Aufwärm-Wiederholungen frisch, spiele Songs und erfinde eigene Basslines.'), h('div', { class: 'row wrap' }, h('a', { class: 'btn primary', href: '#/songs' }, 'Zu den Songs'), h('a', { class: 'btn ghost', href: '#/course' }, 'Zum Kurs')))
    : h('a', { class: 'card hero link', href: `#/lesson/${target.id}` },
      h('span', { class: 'eyebrow' }, started ? 'Weiter, wo du aufgehört hast' : 'Los geht’s'),
      h('h2', null, target.title),
      h('p', { class: 'muted' }, `${target.moduleTitle} · ca. ${target.minutes} Min.${started ? ` · Schritt ${stepNo + 1} von ${target.steps.length}` : ''}`),
      h('span', { class: 'btn primary' }, started ? 'Weiter üben' : 'Erste Lektion starten'));

  root.append(h('section', { class: 'view' },
    h('h1', null, started ? 'Schön, dass du da bist 👋' : 'Willkommen!'),
    card,
    due ? h('a', { class: 'card link warmup-card', href: '#/warmup' }, h('span', { class: 'eyebrow' }, 'Aufwärmen ☕'), h('p', null, `${due} ${due === 1 ? 'Wiederholung ist' : 'Wiederholungen sind'} fällig. Das dauert nur ein paar Minuten.`)) : null,
    !s.placement && !Object.keys(s.done).length ? h('div', { class: 'card' }, h('h3', null, 'Du spielst schon Bass?'), h('p', { class: 'muted' }, 'Mit dem Einstufungstest steigst du auf deinem Niveau ein und musst nicht bei null anfangen.'), h('a', { class: 'btn ghost', href: '#/placement' }, 'Einstufungstest machen')) : null,
    h('div', { class: 'grid2' },
      h('div', { class: 'card center-text' }, h('h3', null, 'Tagesziel'), goalRing(todaySeconds(s), s.settings.goal * 60), h('p', { class: 'muted small' }, `${s.settings.goal} Min. pro Tag`)),
      h('div', { class: 'card' }, h('h3', null, 'Fortschritt'),
        h('p', null, h('strong', null, `Level ${lv.level}`), ` · ${s.xp} XP`),
        h('div', { class: 'xpbar', role: 'progressbar', 'aria-valuenow': Math.round(lv.pct * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Fortschritt zum nächsten Level' }, h('div', { class: 'fill', style: `width:${Math.round(lv.pct * 100)}%` })),
        h('p', { class: 'muted small' }, `Noch ${lv.to - s.xp} XP bis Level ${lv.level + 1}`),
        h('p', null, `🔥 ${currentStreak(s)} Tage Streak`))),
    h('div', { class: 'card' }, h('h3', null, 'Werkzeuge'),
      h('div', { class: 'row wrap' }, [['tuner', '🎚️ Stimmgerät'], ['metronome', '⏱️ Metronom'], ['drums', '🥁 Drum-Machine'], ['jam', '🎶 Jam-Tracks'], ['ear', '👂 Gehörbildung']].map(([id, label]) => h('a', { class: 'btn ghost', href: `#/tools/${id}` }, label)))),
    getUser() ? null : h('p', { class: 'muted small guest' }, 'Gast-Modus: Dein Fortschritt liegt nur auf diesem Gerät. ', h('a', { href: '#/register' }, 'Konto erstellen'), ' für Sync auf allen Geräten.')));
}
