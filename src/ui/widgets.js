import { s, h } from './dom.js';

/** Fortschrittsring für das Tagesziel. */
export function goalRing(sec, goalSec) {
  const pct = Math.min(1, goalSec ? sec / goalSec : 0);
  const R = 34, C = 2 * Math.PI * R;
  const mins = Math.floor(sec / 60);
  return h('div', { class: 'ring', role: 'img', 'aria-label': `${mins} von ${Math.round(goalSec / 60)} Minuten geübt` },
    s('svg', { viewBox: '0 0 80 80' },
      s('circle', { class: 'ring-bg', cx: 40, cy: 40, r: R }),
      s('circle', { class: 'ring-fg', cx: 40, cy: 40, r: R, 'stroke-dasharray': C, 'stroke-dashoffset': C * (1 - pct), transform: 'rotate(-90 40 40)' })),
    h('span', { class: 'ring-text' }, pct >= 1 ? '✔' : `${mins}'`));
}
