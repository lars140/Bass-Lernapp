// Notensystem im Bassschlüssel (SVG), für „Noten lesen“.
// Der E-Bass klingt eine Oktave TIEFER als notiert (wie der Kontrabass). Darum wird hier immer
// „klingender Ton + 12 Halbtöne“ gezeichnet: Die leere E-Saite steht auf der ersten Hilfslinie unter dem System.
import { s, h } from './dom.js';
import { noteName } from '../audio/music.js';

const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];   // C C# D D# E F F# G G# A A# H
const SHARP = [false, true, false, true, false, false, true, false, true, false, true, false];
const BOTTOM_LINE = 18;     // G (G2) = unterste Linie im Bassschlüssel, Position = Oktave·7 + Stufe
const GAP = 12;             // Abstand zweier Linien
const Y_BOTTOM = 100;

/** Position auf der diatonischen Leiter (Linien/Zwischenräume) für den NOTIERTEN Ton. */
export function staffPos(midi) {
  const w = midi + 12;
  const pc = ((w % 12) + 12) % 12;
  return { pos: (Math.floor(w / 12) - 1) * 7 + LETTER[pc], sharp: SHARP[pc] };
}

const yOf = (pos) => Y_BOTTOM - (pos - BOTTOM_LINE) * (GAP / 2);

/**
 * @param {number[]} midis  klingende Töne (MIDI), nacheinander von links nach rechts
 * @param {{names?: boolean}} [o]  names: Notennamen unter den Noten anzeigen
 */
export function renderStaff(midis, o = {}) {
  const W = 78 + midis.length * 36;
  const H = o.names ? 140 : 126;
  const svg = s('svg', { class: 'staff', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Notensystem im Bassschlüssel' });
  for (let i = 0; i < 5; i++) {
    const y = yOf(BOTTOM_LINE + i * 2);
    svg.append(s('line', { class: 'staff-line', x1: 4, x2: W - 4, y1: y, y2: y }));
  }
  // Bassschlüssel (vereinfacht gezeichnet): Punkt auf der F-Linie, Bogen nach unten, zwei Punkte rechts
  const yF = yOf(BOTTOM_LINE + 6);
  svg.append(s('path', { class: 'staff-clef', d: `M 14 ${yF} C 14 ${yF - 13}, 38 ${yF - 13}, 38 ${yF + 3} C 38 ${yF + 18}, 24 ${yF + 30}, 10 ${yF + 40}`, fill: 'none' }));
  svg.append(s('circle', { class: 'staff-dot', cx: 13, cy: yF, r: 3.6 }));
  svg.append(s('circle', { class: 'staff-dot', cx: 44, cy: yF - 6, r: 2.3 }));
  svg.append(s('circle', { class: 'staff-dot', cx: 44, cy: yF + 6, r: 2.3 }));

  midis.forEach((m, i) => {
    const x = 78 + i * 36 - 4;
    const { pos, sharp } = staffPos(m);
    for (let p = BOTTOM_LINE - 2; p >= pos; p -= 2) svg.append(s('line', { class: 'staff-line', x1: x - 12, x2: x + 12, y1: yOf(p), y2: yOf(p) }));
    for (let p = BOTTOM_LINE + 10; p <= pos; p += 2) svg.append(s('line', { class: 'staff-line', x1: x - 12, x2: x + 12, y1: yOf(p), y2: yOf(p) }));
    const y = yOf(pos);
    svg.append(s('ellipse', { class: 'staff-note', cx: x, cy: y, rx: 7.5, ry: 5.6, transform: `rotate(-18 ${x} ${y})` }));
    const up = pos < BOTTOM_LINE + 4;   // Hals nach oben bei tiefen Noten, sonst nach unten
    svg.append(s('line', { class: 'staff-stem', x1: up ? x + 7 : x - 7, x2: up ? x + 7 : x - 7, y1: y, y2: up ? y - 34 : y + 34 }));
    if (sharp) svg.append(s('text', { class: 'staff-acc', x: x - 21, y: y + 5, 'text-anchor': 'middle' }, '♯'));
    if (o.names) svg.append(s('text', { class: 'staff-name', x, y: H - 6, 'text-anchor': 'middle' }, noteName(m)));
  });
  return h('div', { class: 'staff-wrap' }, svg);
}
