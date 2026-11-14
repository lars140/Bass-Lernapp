// Drum-Machine-Werkzeug: Genre-Patterns mit Tempo, zum Üben von Grooves.
import { h } from '../ui/dom.js';
import { Sequencer } from '../audio/sequencer.js';
import { unlock, makeBus } from '../audio/engine.js';
import { GRID_PATTERNS as DRUM_PATTERNS, playDrumTick } from '../audio/drums.js';
import { click } from '../audio/synth.js';
import { setSpace } from '../ui/shortcuts.js';
import { trackActivity } from '../state/gamify.js';

export function createDrumMachine() {
  const st = { bpm: 100, pattern: 'rock8', click: false };
  let seq = null, bus = null;

  const bpmOut = h('output', { class: 'ladder-bpm' }, '100');
  const slider = h('input', { type: 'range', min: 50, max: 180, value: 100, 'aria-label': 'Tempo in BPM' });
  slider.addEventListener('input', () => { st.bpm = Number(slider.value); bpmOut.textContent = String(st.bpm); });
  const sel = h('select', { 'aria-label': 'Groove' }, Object.entries(DRUM_PATTERNS).map(([id, p]) => h('option', { value: id }, p.name)));
  sel.addEventListener('change', () => { st.pattern = sel.value; drawGrid(); });
  const grid = h('div', { class: 'dgrid', role: 'img', 'aria-label': 'Drum-Pattern' });
  const playBtn = h('button', { class: 'btn primary big play', 'aria-label': 'Start', onClick: toggle }, '▶');
  const clickBtn = h('button', { class: 'chip', 'aria-pressed': 'false', onClick: () => { st.click = !st.click; clickBtn.setAttribute('aria-pressed', String(st.click)); } }, 'Klick dazu');

  function drawGrid() {
    const p = DRUM_PATTERNS[st.pattern];
    grid.replaceChildren(...[['Hi-Hat', 'h'], ['Snare', 's'], ['Kick', 'k']].map(([label, key]) =>
      h('div', { class: 'drow' }, h('span', { class: 'dl' }, label),
        ...[...p[key]].map((c, i) => h('span', { class: 'dc' + (c !== '.' ? ' on' : '') + (i % 4 === 0 ? ' beat' : ''), 'data-i': i })))));
  }

  async function toggle() {
    if (seq) { stop(); return; }
    await unlock(); trackActivity();
    bus = makeBus();
    seq = new Sequencer({
      bpm: () => st.bpm,
      onTick: (t, time) => {
        playDrumTick(st.pattern, t % 48, time, bus.node);
        if (st.click && t % 12 === 0) click(time, t % 48 === 0, bus.node);
      },
      onVisual: (t) => {
        if (t % 3 !== 0) return;
        const i = (t / 3) % 16;
        grid.querySelectorAll('.dc').forEach((c) => c.classList.toggle('now', Number(c.dataset.i) === i));
      },
    });
    seq.start(0, 0);
    playBtn.textContent = '⏸'; playBtn.setAttribute('aria-label', 'Stopp');
  }
  function stop() {
    if (seq) seq.stop();
    if (bus) bus.kill();
    seq = null; bus = null;
    grid.querySelectorAll('.dc.now').forEach((c) => c.classList.remove('now'));
    playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', 'Start');
  }

  drawGrid();
  const unsetSpace = setSpace(toggle);
  const el = h('div', { class: 'drums' }, bpmOut, h('div', { class: 'muted center-text' }, 'BPM'), slider,
    h('div', { class: 'row center wrap' }, sel, clickBtn), grid, h('div', { class: 'row center' }, playBtn));
  return { el, destroy() { stop(); unsetSpace(); } };
}
