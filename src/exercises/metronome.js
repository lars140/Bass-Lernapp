// Metronom-Werkzeug: Tempo, Taktart, Achtel, Tap-Tempo.
import { h } from '../ui/dom.js';
import { Sequencer, TPB } from '../audio/sequencer.js';
import { unlock, makeBus } from '../audio/engine.js';
import { click } from '../audio/synth.js';
import { setSpace } from '../ui/shortcuts.js';
import { trackActivity } from '../state/gamify.js';

export function createMetronome() {
  const st = { bpm: 90, beats: 4, eighths: false };
  let seq = null, bus = null;

  const bpmOut = h('output', { class: 'ladder-bpm' }, '90');
  const slider = h('input', { type: 'range', min: 30, max: 240, value: 90, 'aria-label': 'Tempo in BPM' });
  slider.addEventListener('input', () => setBpm(Number(slider.value)));
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
  const playBtn = h('button', { class: 'btn primary big play', 'aria-label': 'Start', onClick: toggle }, '▶');
  const beatsSel = h('select', { 'aria-label': 'Taktart' }, [2, 3, 4, 5, 6, 7].map((n) => h('option', { value: n, selected: n === 4 }, `${n}/4`)));
  beatsSel.addEventListener('change', () => { st.beats = Number(beatsSel.value); drawDots(); });
  const eighthBtn = h('button', { class: 'chip', 'aria-pressed': 'false', onClick: () => { st.eighths = !st.eighths; eighthBtn.setAttribute('aria-pressed', String(st.eighths)); } }, 'Achtel-Klicks');
  let taps = [];
  const tapBtn = h('button', { class: 'btn ghost', onClick: tapTempo }, 'Tap-Tempo');

  function drawDots() { dots.replaceChildren(...Array.from({ length: st.beats }, () => h('span', { class: 'dot' }))); }
  function setBpm(v) { st.bpm = Math.max(30, Math.min(240, Math.round(v))); bpmOut.textContent = String(st.bpm); slider.value = st.bpm; }
  function tapTempo() {
    const now = performance.now();
    taps = taps.filter((t) => now - t < 2500); taps.push(now);
    if (taps.length >= 2) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
  }

  async function toggle() {
    if (seq) { stop(); return; }
    await unlock(); trackActivity();
    bus = makeBus();
    seq = new Sequencer({
      bpm: () => st.bpm,
      onTick: (t, time) => {
        const half = TPB / 2;
        if (t % TPB === 0) click(time, t % (st.beats * TPB) === 0, bus.node);
        else if (st.eighths && t % half === 0) click(time, false, bus.node);
        if (t >= st.beats * TPB) { /* Takt läuft endlos; Position über Modulo */ }
      },
      onVisual: (t) => {
        if (t % TPB === 0) {
          const b = (t / TPB) % st.beats;
          [...dots.children].forEach((d, i) => d.classList.toggle('on', i === b));
        }
      },
    });
    seq.start(0, 0);
    playBtn.textContent = '⏸'; playBtn.setAttribute('aria-label', 'Stopp');
  }
  function stop() {
    if (seq) seq.stop();
    if (bus) bus.kill();
    seq = null; bus = null;
    [...dots.children].forEach((d) => d.classList.remove('on'));
    playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', 'Start');
  }

  drawDots();
  const unsetSpace = setSpace(toggle);
  const el = h('div', { class: 'metronome' }, bpmOut, h('div', { class: 'muted center-text' }, 'BPM'), slider,
    h('div', { class: 'row center wrap' }, h('button', { class: 'btn ghost sm', 'aria-label': 'Langsamer', onClick: () => setBpm(st.bpm - 1) }, '−'), h('button', { class: 'btn ghost sm', 'aria-label': 'Schneller', onClick: () => setBpm(st.bpm + 1) }, '+'), tapBtn),
    dots, h('div', { class: 'row center wrap' }, beatsSel, eighthBtn), h('div', { class: 'row center' }, playBtn));
  return { el, destroy() { stop(); unsetSpace(); } };
}
