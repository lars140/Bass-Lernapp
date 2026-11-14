// Tab-Darstellung eines Riffs als SVG (ein SVG pro Takt, umbrechend).
// Oben steht die hohe G-Saite, unten die tiefe E-Saite, wie in jeder Bass-Tab.
import { s, h } from './dom.js';
import { parseRiff } from '../lessons/riff.js';

const PAD_L = 24, LINE = 16, TOP = 20, STRINGS = 4;
const COUNTS = {
  1: ['1'],
  2: ['', '+'],
  3: ['', 'la', 'li'],
  4: ['', 'e', '+', 'a'],
};
const STRING_LABEL = ['G', 'D', 'A', 'E'];

/**
 * @param {object} riff
 * @param {object} [o]
 * @param {(barIndex:number)=>void} [o.onBarClick]
 */
export function renderTab(riff, o = {}) {
  const p = parseRiff(riff);
  const stepW = { 1: 52, 2: 32, 3: 28, 4: 22 }[p.sub] || 30;
  const W = PAD_L + p.stepsPerBar * stepW + 8;
  const H = TOP + (STRINGS - 1) * LINE + 34;
  const wrap = h('div', { class: 'tab', role: 'img', 'aria-label': `Tabulatur: ${riff.title || 'Riff'}` });
  const bars = [];

  p.bars.forEach((steps, bi) => {
    const svg = s('svg', { class: 'tab-bar', viewBox: `0 0 ${W} ${H}`, 'data-bar': bi });
    const cursor = s('rect', { class: 'tab-cursor', x: 0, y: TOP - 10, width: stepW, height: (STRINGS - 1) * LINE + 20, rx: 4, opacity: 0 });
    svg.append(cursor);
    svg.append(s('text', { class: 'tab-barnum', x: 2, y: 10 }, String(bi + 1)));
    for (let i = 0; i < STRINGS; i++) {
      const y = TOP + i * LINE;
      svg.append(s('line', { class: 'tab-line', x1: PAD_L - 4, x2: W - 4, y1: y, y2: y }));
      svg.append(s('text', { class: 'tab-slabel', x: 8, y: y + 4, 'text-anchor': 'middle' }, STRING_LABEL[i]));
    }
    for (const x of [PAD_L - 4, W - 4]) svg.append(s('line', { class: 'tab-barline', x1: x, x2: x, y1: TOP, y2: TOP + (STRINGS - 1) * LINE }));

    const noteEls = [];
    steps.forEach((st, i) => {
      const x = PAD_L + (i + 0.5) * stepW;
      // Zählhilfe unter der Tab
      const beat = Math.floor(i / p.sub);
      const c = COUNTS[p.sub] ? (i % p.sub === 0 ? String(beat + 1) : COUNTS[p.sub][i % p.sub]) : '';
      svg.append(s('text', { class: 'tab-count' + (i % p.sub === 0 ? ' beat' : ''), x, y: H - 6, 'text-anchor': 'middle' }, c));
      if (st.type === 'note') {
        const row = 3 - st.string;
        const y = TOP + row * LINE;
        const label = String(st.fret);
        const g = s('g', { class: 'tab-note' });
        if (st.len > 1) g.append(s('line', { class: 'tab-hold', x1: x + 8, x2: x + (st.len - 1) * stepW + 4, y1: y, y2: y }));
        g.append(s('rect', { x: x - 8, y: y - 8, width: 16, height: 16, rx: 5 }));
        g.append(s('text', { x, y: y + 4.5, 'text-anchor': 'middle' }, st.ghost ? 'x' : label));
        // Technik-Zeichen: H/P = Hammer-on/Pull-off, Slide-Linie, ~ = Vibrato
        const tech = st.hammer ? 'H' : st.pull ? 'P' : st.slap ? 'S' : st.pop ? '↑' : st.harm ? '◇' : st.vib ? '~' : '';
        if (tech) g.append(s('text', { class: 'tab-tech', x, y: y - 11, 'text-anchor': 'middle' }, tech));
        if (st.slide) g.append(s('line', { class: 'tab-slide', x1: x - 15, x2: x - 9, y1: st.slide === 'up' ? y + 5 : y - 5, y2: st.slide === 'up' ? y - 5 : y + 5 }));
        svg.append(g);
        noteEls[i] = g;
      }
    });

    svg.addEventListener('click', () => o.onBarClick && o.onBarClick(bi));
    wrap.append(svg);
    bars.push({ svg, cursor, noteEls, stepW });
  });

  let activeBar = -1, activeStep = -1;
  return {
    el: wrap,
    /** Aktuellen Schritt hervorheben (bar/step) oder null zum Zurücksetzen. */
    setActive(bar, step) {
      if (activeBar >= 0) {
        const b = bars[activeBar];
        b.cursor.classList.remove('show');
        b.noteEls[activeStep] && b.noteEls[activeStep].classList.remove('on');
      }
      activeBar = bar == null ? -1 : bar;
      activeStep = step;
      if (activeBar >= 0) {
        const b = bars[activeBar];
        b.cursor.setAttribute('x', PAD_L + step * b.stepW);
        b.cursor.classList.add('show');
        b.noteEls[step] && b.noteEls[step].classList.add('on');
      }
    },
    /** Ergebnis der Mikrofon-Prüfung am Ton anzeigen. */
    markNote(bar, step, cls) { const el = bars[bar] && bars[bar].noteEls[step]; if (el) el.classList.add(cls); },
    clearMarks() { bars.forEach((b) => b.noteEls.forEach((el) => el && el.classList.remove('hit', 'miss'))); },
    setLoopBar(i) { bars.forEach((b, k) => b.svg.classList.toggle('loop', k === i)); },
    barCount: bars.length,
  };
}
