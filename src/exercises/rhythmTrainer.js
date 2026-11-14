// Rhythmus-Trainer: Rhythmus im Takt mittippen, mit Timing-Auswertung.
// Ablauf: "Vorspielen" (hören) oder "Starten" (1 Takt Vorzähler, dann tippen).
import { h } from '../ui/dom.js';
import { Sequencer, TPB } from '../audio/sequencer.js';
import { unlock, makeBus, getCtx, outputLatency } from '../audio/engine.js';
import { click, pluck } from '../audio/synth.js';
import { setSpace } from '../ui/shortcuts.js';
import { getSettings } from '../state/store.js';
import { bumpStat, trackActivity } from '../state/gamify.js';

const PERFECT = 0.06, GOOD = 0.11, MISS = 0.16; // Sekunden

/** step = { bpm, sub: 1|2, bars: ["x x - x", ...] }  x = tippen, - = Pause */
export function createRhythmTrainer(step, ctx) {
  const sub = step.sub || 1;
  const beats = 4;
  const tps = TPB / sub;
  const cells = step.bars.flatMap((b) => b.trim().split(/\s+/));
  const total = cells.length;
  const bpm = step.bpm || 70;
  const ticksTotal = total * tps;
  const spb = 60 / bpm;

  let seq = null, bus = null, mode = null, expected = [], taps = [], passed = false;

  const grid = h('div', { class: 'rgrid' }, cells.map((c, i) => h('div', { class: 'rcell' + (c === 'x' ? ' hit' : ''), 'data-i': i }, c === 'x' ? '●' : '·')));
  const result = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const countEl = h('div', { class: 'countin big' }, '');
  const tapBtn = h('button', { class: 'btn primary big tap', onPointerdown: (e) => { e.preventDefault(); doTap(); }, onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); doTap(); } } }, 'TAP');
  const listenBtn = h('button', { class: 'btn ghost', onClick: () => start('listen') }, '👂 Vorspielen');
  const startBtn = h('button', { class: 'btn primary', onClick: () => start('play') }, 'Starten');
  const skipBtn = h('button', { class: 'btn ghost sm', onClick: () => ctx.onDone() }, 'Überspringen');
  const el = h('div', { class: 'rhythm' },
    h('p', { class: 'muted small' }, `${bpm} BPM · Tippe bei jedem ● mit Tap-Button, Bildschirm oder Leertaste.`),
    grid, countEl, tapBtn, h('div', { class: 'row center wrap' }, listenBtn, startBtn), result, h('div', { class: 'row center' }, skipBtn));
  const unsetSpace = setSpace(doTap);

  const cell = (i) => grid.children[i];

  async function start(m) {
    stop();
    await unlock();
    trackActivity();
    mode = m; taps = []; expected = [];
    result.textContent = ''; result.className = 'feedback';
    [...grid.children].forEach((c) => c.classList.remove('perfect', 'good', 'miss', 'now'));
    bus = makeBus();
    const countTicks = beats * TPB;
    seq = new Sequencer({
      bpm: () => bpm,
      totalTicks: ticksTotal + TPB * 1, // 1 Beat Nachlauf für späte Taps
      onTick: (t, time) => {
        if (t < 0) { if (((t % TPB) + TPB) % TPB === 0) click(time, t === -countTicks, bus.node); return; }
        if (t % TPB === 0) click(time, t % (beats * TPB) === 0, bus.node);
        if (t % tps === 0) {
          const i = t / tps;
          if (i < total && cells[i] === 'x') {
            if (mode === 'play') expected.push({ i, time });
            else pluck(33, time, spb / sub * 0.8, 0.9, bus.node);
          }
        }
      },
      onVisual: (t) => {
        if (t < 0) { if (((t % TPB) + TPB) % TPB === 0) countEl.textContent = String(Math.floor((t + countTicks) / TPB) + 1); return; }
        countEl.textContent = '';
        if (t % tps === 0) { [...grid.children].forEach((c) => c.classList.remove('now')); const i = t / tps; if (cell(i)) cell(i).classList.add('now'); }
      },
      onEnd: () => { stop(); if (mode === 'play') evaluate(); },
    });
    seq.start(0, countTicks);
  }

  function stop() {
    if (seq) seq.stop();
    if (bus) bus.kill();
    seq = null; bus = null;
    countEl.textContent = '';
    [...grid.children].forEach((c) => c.classList.remove('now'));
  }

  function doTap() {
    tapBtn.classList.add('pressed');
    setTimeout(() => tapBtn.classList.remove('pressed'), 90);
    const c = getCtx();
    // Auch ohne laufende Übung einen kurzen Ton als Rückmeldung
    unlock();
    if (!seq || mode !== 'play') { pluck(33, c.currentTime + 0.005, 0.12, 0.6); return; }
    const lat = outputLatency() + getSettings().latencyMs / 1000;
    taps.push(c.currentTime - lat);
    pluck(33, c.currentTime + 0.005, 0.12, 0.6);
  }

  function evaluate() {
    const used = new Set();
    let score = 0, perfect = 0;
    const lines = [];
    for (const e of expected) {
      let best = -1, bestD = Infinity;
      taps.forEach((t, k) => { const d = Math.abs(t - e.time); if (!used.has(k) && d < bestD) { bestD = d; best = k; } });
      const c = cell(e.i);
      if (best >= 0 && bestD <= MISS) {
        used.add(best);
        if (bestD <= PERFECT) { score += 1; perfect++; c.classList.add('perfect'); }
        else if (bestD <= GOOD) { score += 0.6; c.classList.add('good'); }
        else { score += 0.3; c.classList.add('miss'); }
        if (bestD > PERFECT) lines.push(taps[best] < e.time ? 'zu früh' : 'zu spät');
      } else c.classList.add('miss');
    }
    const n = expected.length || 1;
    const pct = Math.round((score / n) * 100);
    const early = lines.filter((l) => l === 'zu früh').length, late = lines.length - early;
    let tip = '';
    if (lines.length) tip = early > late ? ' Tendenz: eher zu früh.' : late > early ? ' Tendenz: eher zu spät.' : '';
    const extra = used.size < taps.length ? ' Zusätzliche Taps wurden ignoriert.' : '';
    if (pct >= 60) {
      result.className = 'feedback ok';
      result.textContent = `✔ ${pct}% – ${perfect} von ${n} perfekt.${tip}${extra}`;
      if (pct >= 90) bumpStat('rhythmPerfect');
      if (!passed) { passed = true; ctx.onDone(); }
    } else {
      result.className = 'feedback bad';
      result.textContent = `${pct}% – noch nicht ganz.${tip} Hör dir den Rhythmus mit „Vorspielen“ an und versuch es nochmal.`;
    }
  }

  return { el, destroy() { stop(); unsetSpace(); } };
}
