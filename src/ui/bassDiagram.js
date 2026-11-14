// Einfache SVG-Skizze eines E-Basses mit beschrifteten Teilen (keine Bilddatei).
import { s, h } from './dom.js';

export function bassDiagram() {
  const parts = [
    { x: 38, y: 62, tx: 38, ty: 18, label: 'Kopfplatte' },
    { x: 92, y: 62, tx: 100, ty: 112, label: 'Mechaniken' },
    { x: 220, y: 62, tx: 220, ty: 18, label: 'Hals mit Bundstäbchen' },
    { x: 372, y: 58, tx: 372, ty: 16, label: 'Tonabnehmer' },
    { x: 440, y: 62, tx: 440, ty: 112, label: 'Steg' },
    { x: 470, y: 100, tx: 520, ty: 135, label: 'Gurtpin' },
  ];
  const svg = s('svg', { class: 'bass-diagram', viewBox: '0 0 560 150', role: 'img', 'aria-label': 'Schema eines E-Basses mit Kopfplatte, Mechaniken, Hals, Tonabnehmer, Steg und Gurtpin' },
    s('rect', { class: 'bd-body', x: 12, y: 50, width: 66, height: 24, rx: 6 }),
    s('rect', { class: 'bd-neck', x: 78, y: 56, width: 270, height: 12 }),
    s('path', { class: 'bd-body', d: 'M330 62 C340 20 430 14 470 40 C505 60 500 110 450 112 C400 114 380 100 350 80 Z' }),
    s('rect', { class: 'bd-pu', x: 365, y: 48, width: 12, height: 28, rx: 3 }),
    s('rect', { class: 'bd-pu', x: 390, y: 48, width: 12, height: 28, rx: 3 }),
    s('rect', { class: 'bd-bridge', x: 436, y: 50, width: 10, height: 26, rx: 2 }),
    ...[0, 1, 2, 3].map((i) => s('line', { class: 'bd-str', x1: 30, x2: 441, y1: 58 + i * 4, y2: 56 + i * 5 })),
    ...[0, 1, 2, 3].map((i) => s('circle', { class: 'bd-peg', cx: 28 + i * 14, cy: i % 2 ? 46 : 78, r: 4 })),
    ...Array.from({ length: 12 }, (_, i) => s('line', { class: 'bd-fret', x1: 100 + i * 22, x2: 100 + i * 22, y1: 56, y2: 68 })),
    s('circle', { class: 'bd-peg', cx: 470, cy: 100, r: 5 }));
  for (const p of parts) {
    svg.append(s('line', { class: 'bd-lead', x1: p.x, y1: p.y, x2: p.tx, y2: p.ty < 60 ? p.ty + 6 : p.ty - 10 }));
    svg.append(s('text', { class: 'bd-label', x: p.tx, y: p.ty, 'text-anchor': 'middle' }, p.label));
  }
  return h('div', { class: 'bd-wrap' }, svg);
}
