import { h } from '../dom.js';
import { getState } from '../../state/store.js';
import { loadAvailableLevels } from '../../lessons/loader.js';

export async function courseView(root) {
  const s = getState();
  const levels = await loadAvailableLevels();
  const view = h('section', { class: 'view' }, h('h1', null, 'Kurs'),
    h('p', { class: 'muted small' }, 'Du spielst schon? ', h('a', { href: '#/placement' }, s.placement ? 'Einstufungstest wiederholen' : 'Mach den Einstufungstest'), ' und steig auf deinem Niveau ein.'));
  root.append(view);

  for (const lv of levels) {
    if (!lv.data) {
      view.append(h('div', { class: 'card locked' }, h('h2', null, lv.title), h('p', { class: 'muted' }, lv.subtitle), h('span', { class: 'chip' }, 'Bald verfügbar')));
      continue;
    }
    const all = lv.data.modules.flatMap((m) => m.lessons);
    const done = all.filter((l) => s.done[l.id]).length;
    // Level 2 und 3 lassen sich per Kurztest überspringen (Level 1 nicht: Der Einstufungstest deckt es ab)
    const canSkip = ['level2', 'level3'].includes(lv.id) && done < all.length;
    view.append(h('div', { class: 'level-head' }, h('h2', null, lv.data.title), h('p', { class: 'muted' }, lv.data.subtitle), h('p', { class: 'small' }, `${done} von ${all.length} Lektionen`),
      canSkip ? h('a', { class: 'btn ghost sm', href: `#/placement/${lv.id}` }, 'Kenne ich schon: per Kurztest überspringen') : null));
    for (const m of lv.data.modules) {
      view.append(h('h3', { class: 'module' }, m.title));
      view.append(h('ul', { class: 'lessons' }, m.lessons.map((l) => {
        const n = s.steps[l.id] || 0;
        const isDone = !!s.done[l.id];
        const status = isDone ? (s.skipped[l.id] ? '⏭' : '✔') : n > 0 ? `${n}/${l.steps.length}` : '';
        return h('li', null, h('a', { class: 'lesson-card' + (isDone ? ' done' : n ? ' started' : ''), href: `#/lesson/${l.id}` },
          h('span', { class: 'lc-main' }, h('strong', null, l.title), h('span', { class: 'muted small' }, `${l.goal} · ca. ${l.minutes} Min.`)),
          h('span', { class: 'lc-status', 'aria-label': isDone ? (s.skipped[l.id] ? 'übersprungen' : 'abgeschlossen') : n ? `${n} von ${l.steps.length} Schritten` : 'neu' }, status || '›')));
      })));
    }
  }
}
