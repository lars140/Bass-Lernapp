// Tab-Player: animierte Tab mit Cursor, Playback per Web Audio, Tempo, Loop, Vorzähler.
import { h } from '../ui/dom.js';
import { renderTab } from '../ui/tabview.js';
import { parseRiff } from '../lessons/riff.js';
import { Sequencer, TPB } from '../audio/sequencer.js';
import { unlock, makeBus } from '../audio/engine.js';
import { pluck, click } from '../audio/synth.js';
import { playDrumTick, DRUM_PATTERNS } from '../audio/drums.js';
import { setSpace } from '../ui/shortcuts.js';
import { trackActivity } from '../state/gamify.js';

/**
 * @param {object} riff
 * @param {object} [o]
 * @param {number} [o.bpm]
 * @param {boolean} [o.loopAll]       ganzes Riff endlos wiederholen
 * @param {boolean} [o.hideTempo]
 * @param {()=>boolean} [o.muteBass]  true = Bass-Ton nicht abspielen (Mikrofon-Modus)
 * @param {(n:object)=>void} [o.onNote]   für jeden geplanten Ton { idx, time, dur, midi, ghost }
 * @param {()=>void} [o.onStart]
 * @param {(loops:number)=>void} [o.onLoop]  nach jedem vollständigen Durchlauf
 * @param {()=>void} [o.onFinish]            Ende (ohne Loop)
 * @param {(playing:boolean)=>void} [o.onState]
 */
export function createTabPlayer(riff, o = {}) {
  const p = parseRiff(riff);
  const st = { bpm: o.bpm || riff.bpm || 80, metro: true, drums: !!riff.drums, countIn: true, loopBar: null, loops: 0, playing: false };
  let seq = null, bus = null;

  const tab = renderTab(riff, { onBarClick: (i) => setLoopBar(st.loopBar === i ? null : i) });

  // ----- Bedienelemente -----
  const playBtn = h('button', { class: 'btn primary big play', 'aria-label': 'Abspielen', onClick: toggle }, '▶');
  const countEl = h('span', { class: 'countin', 'aria-live': 'off' }, '');
  const bpmOut = h('output', { class: 'bpm-out' }, String(st.bpm));
  const slider = h('input', { type: 'range', min: 40, max: 200, step: 1, value: st.bpm, 'aria-label': 'Tempo in BPM' });
  slider.addEventListener('input', () => setBpm(Number(slider.value)));
  const minus = h('button', { class: 'btn ghost sm', 'aria-label': 'Langsamer', onClick: () => setBpm(st.bpm - 1) }, '−');
  const plus = h('button', { class: 'btn ghost sm', 'aria-label': 'Schneller', onClick: () => setBpm(st.bpm + 1) }, '+');

  function toggleBtn(label, key, enabled = true) {
    if (!enabled) return null;
    const b = h('button', { class: 'chip', 'aria-pressed': String(st[key]), onClick: () => { st[key] = !st[key]; b.setAttribute('aria-pressed', String(st[key])); } }, label);
    return b;
  }
  const loopHint = h('span', { class: 'muted small' }, p.bars.length > 1 ? 'Tipp: Takt antippen = nur diesen Takt wiederholen' : '');
  const extra = h('div', { class: 'row wrap' });

  const controls = h('div', { class: 'player-controls' },
    h('div', { class: 'row center' }, playBtn, countEl),
    o.hideTempo ? null : h('div', { class: 'row tempo' }, minus, slider, plus, h('span', { class: 'bpm' }, bpmOut, ' BPM')),
    h('div', { class: 'row wrap' }, toggleBtn('Metronom', 'metro'), toggleBtn('Drums', 'drums', !!riff.drums), toggleBtn('Vorzähler', 'countIn'), loopHint),
    extra,
    riff.drums && DRUM_PATTERNS[riff.drums] ? h('p', { class: 'muted small' }, `Drums: ${DRUM_PATTERNS[riff.drums].name}`) : null);

  const el = h('div', { class: 'player' }, riff.title ? h('div', { class: 'riff-title' }, riff.title) : null, tab.el, controls);
  const unsetSpace = setSpace(toggle);

  // ----- Logik -----
  function setBpm(v) {
    st.bpm = Math.max(40, Math.min(200, Math.round(v)));
    bpmOut.textContent = String(st.bpm);
    slider.value = st.bpm;
  }

  function setLoopBar(i) {
    st.loopBar = i;
    tab.setLoopBar(i);
    if (seq) seq.setLoop(currentLoop());
  }

  function currentLoop() {
    if (st.loopBar != null) return { from: st.loopBar * p.ticksPerBar, to: (st.loopBar + 1) * p.ticksPerBar };
    if (o.loopAll) return { from: 0, to: p.totalTicks };
    return null;
  }

  function onTick(t, time) {
    if (t < 0) {
      if (((t % TPB) + TPB) % TPB === 0) click(time, t === -p.beats * TPB, bus.node);
      return;
    }
    if (st.metro && t % TPB === 0) click(time, t % (p.beats * TPB) === 0, bus.node);
    if (st.drums && riff.drums) playDrumTick(riff.drums, t % (4 * TPB), time, bus.node);
    if (t % p.tps === 0) {
      const idx = t / p.tps;
      const n = p.flat[idx];
      if (n && n.type === 'note') {
        const stepDur = (60 / st.bpm) / p.sub;
        const dur = n.len * stepDur * 0.92;
        o.onNote && o.onNote({ idx, time, dur, midi: n.midi, ghost: n.ghost });
        if (!(o.muteBass && o.muteBass())) {
          pluck(n.midi, time, dur, 0.9, bus.node, {
            ghost: n.ghost, soft: n.hammer || n.pull, vibrato: n.vib, slap: n.slap, pop: n.pop, harmonic: n.harm,
            glideFrom: n.slide ? (n.prevMidi != null ? n.prevMidi : n.midi + (n.slide === 'up' ? -3 : 3)) : null,
          });
        }
      }
    }
  }

  function onVisual(t, wrapped) {
    if (wrapped) {
      st.loops++;
      o.onLoop && o.onLoop(st.loops);
    }
    if (t < 0) {
      const beat = Math.floor((t + p.beats * TPB) / TPB) + 1;
      if (((t % TPB) + TPB) % TPB === 0) countEl.textContent = String(beat);
      return;
    }
    countEl.textContent = '';
    const idx = Math.floor(t / p.tps);
    if (t % p.tps === 0) tab.setActive(Math.floor(idx / p.stepsPerBar), idx % p.stepsPerBar);
  }

  async function play() {
    if (st.playing) return;
    await unlock();
    trackActivity();
    tab.clearMarks();
    o.onStart && o.onStart();
    bus = makeBus();
    st.loops = 0;
    seq = new Sequencer({
      bpm: () => st.bpm, onTick, onVisual, totalTicks: p.totalTicks, loop: currentLoop(),
      onEnd: () => { halt(); o.onLoop && o.onLoop(++st.loops); o.onFinish && o.onFinish(); },
    });
    const from = st.loopBar != null ? st.loopBar * p.ticksPerBar : 0;
    seq.start(from, st.countIn ? p.beats * TPB : 0);
    setPlaying(true);
  }

  function halt() {
    if (seq) seq.stop();
    if (bus) bus.kill();
    seq = null; bus = null;
    countEl.textContent = '';
    tab.setActive(null);
    setPlaying(false);
  }

  function setPlaying(v) {
    st.playing = v;
    playBtn.textContent = v ? '⏸' : '▶';
    playBtn.setAttribute('aria-label', v ? 'Stopp' : 'Abspielen');
    o.onState && o.onState(v);
  }

  function toggle() { st.playing ? halt() : play(); }

  setBpm(st.bpm);
  return {
    el, tab, parsed: p, extra,
    play, stop: halt, setBpm,
    getBpm: () => st.bpm,
    isPlaying: () => st.playing,
    destroy() { halt(); unsetSpace(); },
  };
}
