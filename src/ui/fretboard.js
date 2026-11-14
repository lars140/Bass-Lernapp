// Interaktives Griffbrett (SVG). Antippen spielt den Ton.
// Saite 0 = E (unten), 3 = G (oben), wie im Tab. Linkshänder-Modus spiegelt das Griffbrett.
import { s, h } from './dom.js';
import { OPEN_MIDI, STRING_NAMES, midiAt, noteName } from '../audio/music.js';
import { unlock, getCtx } from '../audio/engine.js';
import { pluck } from '../audio/synth.js';
import { getSettings } from '../state/store.js';

const CELL = 54, NUT = 44, ROW = 30, TOP = 26;
const THICK = [3.4, 2.7, 2.1, 1.6];

/**
 * @param {object} o
 * @param {number} [o.frets=12]
 * @param {Array<{s:number,f:number,label?:string,kind?:string}>} [o.marks]
 * @param {(s:number,f:number,midi:number)=>void} [o.onTap]
 * @param {boolean} [o.silent]  kein Ton beim Antippen
 */
export function createFretboard(o = {}) {
  const frets = o.frets || 12;
  const left = getSettings().lefty;
  const W = NUT + frets * CELL + 12;
  const H = TOP + 3 * ROW + 56;
  const X = (px) => (left ? W - px : px);
  const cx = (f) => (f === 0 ? NUT / 2 : NUT + (f - 0.5) * CELL);
  const cy = (str) => TOP + (3 - str) * ROW;

  const svg = s('svg', { class: 'fretboard', viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'Griffbrett des Basses' });
  // Hals
  const x0 = Math.min(X(NUT), X(W - 12)), x1 = Math.max(X(NUT), X(W - 12));
  svg.append(s('rect', { class: 'fb-neck', x: x0, y: 8, width: x1 - x0, height: 3 * ROW + 36, rx: 4 }));
  // Bundstäbchen und Nut
  for (let f = 0; f <= frets; f++) {
    const x = X(NUT + f * CELL);
    svg.append(s('line', { class: f === 0 ? 'fb-nut' : 'fb-fret', x1: x, x2: x, y1: 8, y2: 8 + 3 * ROW + 36 }));
  }
  // Markierungspunkte
  for (const f of [3, 5, 7, 9, 12, 15]) {
    if (f > frets) continue;
    const x = X(cx(f));
    if (f % 12 === 0) {
      svg.append(s('circle', { class: 'fb-dot', cx: x, cy: cy(2) + ROW / 2 - 15, r: 5 }));
      svg.append(s('circle', { class: 'fb-dot', cx: x, cy: cy(2) + ROW / 2 + 15, r: 5 }));
    } else svg.append(s('circle', { class: 'fb-dot', cx: x, cy: cy(2) + ROW / 2 + 0, r: 5 }));
  }
  // Saiten
  for (let i = 0; i < 4; i++) {
    svg.append(s('line', { class: 'fb-string', x1: x0, x2: x1, y1: cy(i), y2: cy(i), 'stroke-width': THICK[i] }));
    svg.append(s('text', { class: 'fb-sname', x: left ? W - 4 : 4, y: cy(i) + 4, 'text-anchor': left ? 'end' : 'start' }, STRING_NAMES[i]));
  }
  // Bundnummern
  for (let f = 1; f <= frets; f++) {
    svg.append(s('text', { class: 'fb-num', x: X(cx(f)), y: TOP + 3 * ROW + 42, 'text-anchor': 'middle' }, String(f)));
  }
  const markLayer = s('g');
  svg.append(markLayer);

  // Tippflächen (auch per Tastatur bedienbar)
  const hit = s('g');
  for (let i = 0; i < 4; i++) {
    for (let f = 0; f <= frets; f++) {
      const w = f === 0 ? NUT : CELL;
      const px = f === 0 ? 0 : NUT + (f - 1) * CELL;
      const rx = left ? W - px - w : px;
      const r = s('rect', {
        class: 'fb-hit', x: rx, y: cy(i) - ROW / 2, width: w, height: ROW,
        tabindex: 0, role: 'button', 'data-own-keys': '',
        'aria-label': `${STRING_NAMES[i]}-Saite, ${f === 0 ? 'leer' : f + '. Bund'}, Ton ${noteName(midiAt(i, f))}`,
      });
      const fire = () => tap(i, f);
      r.addEventListener('pointerdown', (e) => { e.preventDefault(); fire(); });
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); fire(); } });
      hit.append(r);
    }
  }
  svg.append(hit);

  function tap(str, f) {
    const midi = midiAt(str, f);
    if (!o.silent) { unlock(); pluck(midi, getCtx().currentTime + 0.01, 0.9, 0.9); }
    flash(str, f, 'tap');
    o.onTap && o.onTap(str, f, midi);
  }

  function mark(m) {
    const g = s('g', { class: 'fb-mark ' + (m.kind || 'note') });
    g.append(s('circle', { cx: X(cx(m.f)), cy: cy(m.s), r: 12.5 }));
    if (m.label != null) g.append(s('text', { x: X(cx(m.f)), y: cy(m.s) + 4.5, 'text-anchor': 'middle' }, String(m.label)));
    return g;
  }
  function setMarks(marks) {
    while (markLayer.firstChild) markLayer.removeChild(markLayer.firstChild);
    (marks || []).forEach((m) => markLayer.append(mark(m)));
  }
  function flash(str, f, kind) {
    const g = mark({ s: str, f, kind: 'flash ' + kind });
    markLayer.append(g);
    setTimeout(() => g.remove(), 450);
  }
  setMarks(o.marks);

  const el = h('div', { class: 'fb-wrap' }, svg);
  return { el, setMarks, flash };
}

/** Alle Töne einer Saite als Markierungen (bis maxFret), mit Notennamen. */
export function stringMarks(str, maxFret, labelFn) {
  const out = [];
  for (let f = 0; f <= maxFret; f++) out.push({ s: str, f, kind: f === 0 ? 'root' : 'note', label: labelFn ? labelFn(f) : noteName(OPEN_MIDI[str] + f) });
  return out;
}
