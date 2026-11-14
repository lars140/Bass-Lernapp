// Jam-Tracks: generierte Begleitung (Drums + Akkorde, optional Bass) zu Akkordfolgen.
// Wähle Genre, Tonart, Akkordfolge und Tempo und spiele mit.
import { h } from '../ui/dom.js';
import { Sequencer } from '../audio/sequencer.js';
import { unlock, makeBus } from '../audio/engine.js';
import { pluck, chord } from '../audio/synth.js';
import { playDrumTick, drumTicks } from '../audio/drums.js';
import { noteName, pcOf } from '../audio/music.js';
import { setSpace } from '../ui/shortcuts.js';
import { trackActivity, bumpStat } from '../state/gamify.js';

const TICKS_BAR = 48;

// [Halbtöne über dem Grundton der Tonart, Akkordtyp]
export const PROGRESSIONS = {
  'rock-145': { name: 'Rock: I – IV – V – IV', bars: [[0, 'M'], [5, 'M'], [7, 'M'], [5, 'M']] },
  'blues12': { name: '12-Takt-Blues', bars: [[0, '7'], [0, '7'], [0, '7'], [0, '7'], [5, '7'], [5, '7'], [0, '7'], [0, '7'], [7, '7'], [5, '7'], [0, '7'], [7, '7']] },
  'pop-1564': { name: 'Pop: I – V – vi – IV', bars: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']] },
  'pop-6415': { name: 'Pop: vi – IV – I – V', bars: [[9, 'm'], [5, 'M'], [0, 'M'], [7, 'M']] },
  'minor-i-VI-III-VII': { name: 'Moll: i – VI – III – VII', bars: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']] },
  'jazz-251': { name: 'Jazz: ii – V – I – I', bars: [[2, 'm7'], [7, '7'], [0, 'maj7'], [0, 'maj7']] },
  'funk-i-IV': { name: 'Funk: i7 – i7 – IV7 – i7', bars: [[0, 'm7'], [0, 'm7'], [5, '7'], [0, 'm7']] },
};

const ticksFrom16 = (idxs) => idxs.map((i) => i * 3);

export const GENRES = {
  rock:   { name: 'Rock',   drums: 'rock8',   bpm: 110, chordTicks: [0, 24], chordBeats: 1.9, bassFrom: 'k' },
  funk:   { name: 'Funk',   drums: 'funk',    bpm: 98,  chordTicks: ticksFrom16([3, 6, 10, 13]), chordBeats: 0.3, bassFrom: 'k' },
  blues:  { name: 'Blues (Shuffle)', drums: 'shuffle', bpm: 90, chordTicks: [0, 8, 24, 32], chordBeats: 0.6, bassTicks: [0, 12, 24, 36] },
  reggae: { name: 'Reggae', drums: 'reggae',  bpm: 76,  chordTicks: ticksFrom16([2, 6, 10, 14]), chordBeats: 0.3, bassTicks: [0, 18, 24, 36] },
  disco:  { name: 'Disco',  drums: 'disco',   bpm: 118, chordTicks: ticksFrom16([2, 6, 10, 14]), chordBeats: 0.3, bassTicks: Array.from({ length: 8 }, (_, i) => i * 6), octaves: true },
  hiphop: { name: 'Hip-Hop', drums: 'hiphop', bpm: 90,  chordTicks: [0], chordBeats: 3.8, bassFrom: 'k' },
};

const QUALITY = {
  M: { sym: '', iv: [0, 4, 7] },
  m: { sym: 'm', iv: [0, 3, 7] },
  7: { sym: '7', iv: [0, 4, 7, 10] },
  m7: { sym: 'm7', iv: [0, 3, 7, 10] },
  maj7: { sym: 'maj7', iv: [0, 4, 7, 11] },
};
const NASH = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
const KEYS = ['E', 'A', 'D', 'G', 'C', 'F', 'H', 'F#'];

/** Wandelt Tonart + Akkordfolge in Takte um: Namen, Nashville-Zahl, Grundton, Griffhilfe. */
export function buildBars(keyName, progId) {
  const key = pcOf(keyName);
  return PROGRESSIONS[progId].bars.map(([off, q]) => {
    const pc = (key + off) % 12;
    const Q = QUALITY[q];
    const nash = NASH[off] + (q === 'm' ? 'm' : q === 'm7' ? 'm7' : q === '7' ? '7' : q === 'maj7' ? 'maj7' : '');
    return {
      pc, q, name: noteName(pc) + Q.sym, nash,
      bassMidi: 28 + ((pc - 4 + 12) % 12),                    // tiefster Grundton im Bassbereich (E1..D#2)
      voicing: Q.iv.map((i) => 48 + pc + i),                  // Akkord ab C3
      fretE: (pc - 4 + 12) % 12, fretA: (pc - 9 + 12) % 12,   // Bund des Grundtons auf E- bzw. A-Saite
    };
  });
}

/**
 * @param {{genre?:string, progression?:string, key?:string, bpm?:number}} step
 * @param {{onDone?:()=>void}} [ctx]
 */
export function createJamTrack(step = {}, ctx = {}) {
  const st = {
    genre: step.genre || 'rock', prog: step.progression || 'rock-145', key: step.key || 'E',
    bpm: step.bpm || (GENRES[step.genre || 'rock'] || GENRES.rock).bpm, bass: false,
  };
  let seq = null, bus = null, bars = buildBars(st.key, st.prog), loops = 0;

  const grid = h('div', { class: 'jam-grid', role: 'list', 'aria-label': 'Akkordfolge' });
  const info = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const bpmOut = h('output', { class: 'bpm-out' }, String(st.bpm));
  const slider = h('input', { type: 'range', min: 60, max: 160, value: st.bpm, 'aria-label': 'Tempo in BPM' });
  slider.addEventListener('input', () => { st.bpm = Number(slider.value); bpmOut.textContent = String(st.bpm); });
  const playBtn = h('button', { class: 'btn primary big play', 'aria-label': 'Start', onClick: toggle }, '▶');

  function sel(label, options, value, onChange) {
    const s = h('select', { 'aria-label': label }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    s.addEventListener('change', () => onChange(s.value));
    return h('label', { class: 'field inline' }, h('span', { class: 'small muted' }, label), s);
  }
  const genreSel = sel('Genre', Object.entries(GENRES).map(([k, g]) => [k, g.name]), st.genre, (v) => {
    st.genre = v; st.bpm = GENRES[v].bpm; slider.value = st.bpm; bpmOut.textContent = String(st.bpm);
  });
  const progSel = sel('Akkordfolge', Object.entries(PROGRESSIONS).map(([k, p]) => [k, p.name]), st.prog, (v) => { st.prog = v; rebuild(); });
  const keySel = sel('Tonart', KEYS.map((k) => [k, k]), st.key, (v) => { st.key = v; rebuild(); });
  const bassChip = h('button', { class: 'chip', 'aria-pressed': 'false', onClick: () => { st.bass = !st.bass; bassChip.setAttribute('aria-pressed', String(st.bass)); } }, '🎸 Bass spielen lassen');

  function rebuild() {
    bars = buildBars(st.key, st.prog);
    grid.replaceChildren(...bars.map((b, i) => h('div', { class: 'jam-bar', role: 'listitem', 'data-i': i },
      h('span', { class: 'jb-name' }, b.name), h('span', { class: 'jb-nash' }, b.nash),
      h('span', { class: 'jb-fret small muted' }, `E: ${b.fretE} · A: ${b.fretA}`))));
    info.textContent = 'Deine Aufgabe: Spiele den Grundton jedes Akkords (Bund-Hilfe unter dem Akkord). Fortgeschrittene nehmen Quinte und Oktave dazu.';
  }

  async function toggle() {
    if (seq) { stop(); return; }
    await unlock(); trackActivity();
    bus = makeBus();
    loops = 0;
    seq = new Sequencer({
      bpm: () => st.bpm,
      onTick: (t, time) => {
        const g = GENRES[st.genre];
        const bi = Math.floor(t / TICKS_BAR) % bars.length;
        const bt = t % TICKS_BAR;
        const bar = bars[bi];
        const beat = 60 / st.bpm;
        playDrumTick(g.drums, bt, time, bus.node);
        if (g.chordTicks.includes(bt)) chord(bar.voicing, time, g.chordBeats * beat, 0.8, bus.node);
        if (st.bass) {
          const ticks = g.bassTicks || drumTicks(g.drums, g.bassFrom || 'k');
          if (ticks.includes(bt)) {
            const up = g.octaves && (bt / 6) % 2 === 1 ? 12 : 0;
            pluck(bar.bassMidi + up, time, beat * 0.45, 0.9, bus.node);
          }
        }
      },
      onVisual: (t) => {
        const bi = Math.floor(t / TICKS_BAR) % bars.length;
        grid.querySelectorAll('.jam-bar').forEach((b, i) => b.classList.toggle('now', i === bi));
        if (t > 0 && t % (TICKS_BAR * bars.length) === 0) loops++;
      },
    });
    seq.start(0, 0);
    playBtn.textContent = '⏸'; playBtn.setAttribute('aria-label', 'Stopp');
  }
  function stop() {
    if (seq) seq.stop();
    if (bus) bus.kill();
    seq = null; bus = null;
    grid.querySelectorAll('.jam-bar.now').forEach((b) => b.classList.remove('now'));
    playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', 'Start');
  }

  rebuild();
  const unsetSpace = setSpace(toggle);
  const done = ctx.onDone ? h('div', { class: 'row center' }, h('button', { class: 'btn primary', onClick: (e) => { bumpStat('jamsDone'); ctx.onDone(); e.target.disabled = true; e.target.textContent = '✔ Mitgespielt'; } }, '✔ Ich habe mitgespielt')) : null;
  const el = h('div', { class: 'jam' },
    h('div', { class: 'row wrap' }, genreSel, keySel, progSel),
    grid, info,
    h('div', { class: 'row tempo' }, slider, h('span', { class: 'bpm' }, bpmOut, ' BPM')),
    h('div', { class: 'row center wrap' }, playBtn, bassChip), done);
  return { el, destroy() { stop(); unsetSpace(); } };
}
