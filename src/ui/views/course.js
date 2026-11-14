import { h } from '../dom.js';
import { getState } from '../../state/store.js';
import { loadAvailableLevels } from '../../lessons/loader.js';

export async function courseView(root) {
  const s = getState();
  const levels = await loadAvailableLevels();
  const view = h('section', { class: 'view' }, h('h1', null, 'Kurs'));
  root.append(view);

  for (const lv of levels) {
    if (!lv.data) {
      view.append(h('div', { class: 'card locked' }, h('h2', null, lv.title), h('p', { class: 'muted' }, lv.subtitle), h('span', { class: 'chip' }, 'Bald verfügbar')));
      continue;
    }
    const all = lv.data.modules.flatMap((m) => m.lessons);
    const done = all.filter((l) => s.done[l.id]).length;
    view.append(h('div', { class: 'level-head' }, h('h2', null, lv.data.title), h('p', { class: 'muted' }, lv.data.subtitle), h('p', { class: 'small' }, `${done} von ${all.length} Lektionen`)));
    for (const m of lv.data.modules) {
      view.append(h('h3', { class: 'module' }, m.title));
      view.append(h('ul', { class: 'lessons' }, m.lessons.map((l) => {
        const n = s.steps[l.id] || 0;
        const isDone = !!s.done[l.id];
        const status = isDone ? '✔' : n > 0 ? `${n}/${l.steps.length}` : '';
        return h('li', null, h('a', { class: 'lesson-card' + (isDone ? ' done' : n ? ' started' : ''), href: `#/lesson/${l.id}` },
          h('span', { class: 'lc-main' }, h('strong', null, l.title), h('span', { class: 'muted small' }, `${l.goal} · ca. ${l.minutes} Min.`)),
          h('span', { class: 'lc-status', 'aria-label': isDone ? 'abgeschlossen' : n ? `${n} von ${l.steps.length} Schritten` : 'neu' }, status || '›')));
      })));
    }
  }
}
