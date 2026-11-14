// Gehörbildung: Intervalle, Dur/Moll und kurze Basslines erkennen. Alle Töne werden synthetisiert.
import { h } from '../ui/dom.js';
import { renderTab } from '../ui/tabview.js';
import { unlock, getCtx } from '../audio/engine.js';
import { pluck, chord } from '../audio/synth.js';
import { INTERVAL_NAMES } from '../audio/music.js';
import { bumpStat } from '../state/gamify.js';

const rand = (n) => (Math.random() * n) | 0;
const pick = (arr) => arr[rand(arr.length)];

/**
 * @param {{mode:'interval'|'quality'|'line', rounds?:number, intervals?:number[]}} step
 * @param {{onDone?:()=>void}} [ctx]
 */
export function createEarTraining(step, ctx = {}) {
  const mode = step.mode || 'interval';
  const rounds = step.rounds || 6;
  let round = 0, correct = 0, answered = false, current = null, finished = false;

  const prog = h('p', { class: 'muted small' });
  const prompt = h('p', { class: 'q' });
  const opts = h('div', { class: 'options' });
  const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const again = h('button', { class: 'btn ghost', onClick: () => play() }, '🔊 Nochmal hören');
  const nextBtn = h('button', { class: 'btn primary', onClick: next, hidden: true }, 'Weiter');
  const el = h('div', { class: 'ear' }, prog, prompt, h('div', { class: 'row center' }, again), opts, fb, h('div', { class: 'row center' }, nextBtn));

  // ----- Aufgaben erzeugen -----
  function makeRound() {
    if (mode === 'interval') {
      const set = step.intervals || [3, 4, 5, 7, 12];
      const semis = pick(set);
      const root = 36 + rand(10); // C2..A2, gute Bass-Lage
      return {
        answer: semis,
        options: set.map((s) => ({ key: s, label: INTERVAL_NAMES[s] })),
        question: 'Welches Intervall hörst du? (Zwei Töne nacheinander)',
        play: (t) => { pluck(root, t, 0.6); pluck(root + semis, t + 0.75, 0.8); },
        explain: `Das war eine ${INTERVAL_NAMES[semis]} (${semis} Halbtöne).`,
      };
    }
    if (mode === 'quality') {
      const major = Math.random() < 0.5;
      const root = 36 + rand(10);
      const notes = [root, root + (major ? 4 : 3), root + 7];
      return {
        answer: major ? 'dur' : 'moll',
        options: [{ key: 'dur', label: 'Dur (hell)' }, { key: 'moll', label: 'Moll (dunkel)' }],
        question: 'Dur oder Moll? (Grundton, Terz, Quinte nacheinander, dann zusammen)',
        play: (t) => { notes.forEach((m, i) => pluck(m, t + i * 0.5, 0.5)); chord(notes.map((m) => m + 12), t + 1.7, 1.2, 0.8); },
        explain: major ? 'Dur: große Terz (4 Halbtöne) – klingt hell.' : 'Moll: kleine Terz (3 Halbtöne) – klingt dunkler.',
      };
    }
    // mode === 'line': welche der drei Tabs wurde gespielt?
    const pool = ['E0', 'E3', 'E5', 'A0', 'A2', 'A3', 'A5', 'D0', 'D2', 'D3'];
    const mk = () => { const l = []; while (l.length < 4) { const t = pick(pool); if (t !== l[l.length - 1]) l.push(t); } return l; };
    const lines = [];
    while (lines.length < 3) { const l = mk(); if (!lines.some((x) => x.join() === l.join())) lines.push(l); }
    const answer = rand(3);
    const midi = (tok) => ({ E: 28, A: 33, D: 38, G: 43 }[tok[0]] + Number(tok.slice(1)));
    return {
      answer,
      lines,
      options: lines.map((l, i) => ({ key: i, label: String.fromCharCode(65 + i), tab: l })),
      question: 'Welche Bassline hörst du?',
      play: (t) => lines[answer].forEach((tok, i) => pluck(midi(tok), t + i * 0.55, 0.5)),
      explain: 'Das war Variante ' + String.fromCharCode(65 + answer) + '.',
    };
  }

  async function play() {
    await unlock();
    current.play(getCtx().currentTime + 0.05);
  }

  function next() {
    if (round >= rounds) { finish(); return; }
    answered = false;
    current = makeRound();
    prog.textContent = `Aufgabe ${round + 1} von ${rounds}`;
    prompt.textContent = current.question;
    fb.textContent = ''; fb.className = 'feedback';
    nextBtn.hidden = true;
    opts.replaceChildren(...current.options.map((o) => {
      const b = h('button', { class: 'btn option' + (o.tab ? ' linebtn' : ''), onClick: () => choose(o.key, b) },
        o.tab ? h('span', { class: 'lb-label' }, o.label) : o.label,
        o.tab ? renderTab({ id: 'ear', beats: 4, sub: 1, bars: [o.tab.join(' ')] }).el : null);
      b.dataset.key = String(o.key);
      return b;
    }));
    play();
  }

  function choose(key, btn) {
    if (answered) return;
    answered = true;
    round++;
    const ok = key === current.answer;
    if (ok) correct++;
    btn.classList.add(ok ? 'right' : 'wrong');
    opts.querySelectorAll('button').forEach((b) => { if (b.dataset.key === String(current.answer)) b.classList.add('right'); b.disabled = true; });
    fb.className = 'feedback ' + (ok ? 'ok' : 'bad');
    fb.textContent = (ok ? '✔ Richtig! ' : 'Nicht ganz. ') + current.explain;
    nextBtn.textContent = round >= rounds ? 'Ergebnis' : 'Weiter';
    nextBtn.hidden = false;
  }

  function finish() {
    finished = true;
    prog.textContent = '';
    again.remove(); opts.remove(); nextBtn.hidden = true;
    const pct = Math.round((correct / rounds) * 100);
    prompt.textContent = `${correct} von ${rounds} richtig (${pct} %)`;
    fb.className = 'feedback ' + (pct >= 60 ? 'ok' : 'bad');
    fb.textContent = pct >= 60 ? 'Stark! Dein Gehör wird besser.' : 'Übung macht den Meister – probier es gleich noch einmal.';
    if (pct >= 60) { bumpStat('earPassed'); ctx.onDone && ctx.onDone(); }
    else {
      const retry = h('button', { class: 'btn primary', onClick: () => { round = 0; correct = 0; finished = false; el.replaceChildren(prog, prompt, h('div', { class: 'row center' }, again), opts, fb, h('div', { class: 'row center' }, nextBtn)); next(); } }, 'Nochmal versuchen');
      const skip = ctx.onDone ? h('button', { class: 'btn ghost', onClick: () => ctx.onDone() }, 'Trotzdem weiter') : null;
      el.append(h('div', { class: 'row center wrap' }, retry, skip));
    }
  }

  next();
  return { el, destroy() { finished = true; } };
}

/** Freies Üben im Werkzeug-Menü: Modus wählbar. */
export function createEarTool() {
  const modes = [['interval', 'Intervalle'], ['quality', 'Dur / Moll'], ['line', 'Basslines']];
  const holder = h('div');
  let comp = null;
  const chips = modes.map(([m, label]) => h('button', { class: 'chip', 'aria-pressed': String(m === 'interval'), onClick: () => select(m) }, label));
  function select(m) {
    chips.forEach((c, i) => c.setAttribute('aria-pressed', String(modes[i][0] === m)));
    comp && comp.destroy();
    comp = createEarTraining({ mode: m, rounds: 8, intervals: m === 'interval' ? [2, 3, 4, 5, 7, 9, 12] : undefined });
    holder.replaceChildren(comp.el);
  }
  select('interval');
  return { el: h('div', null, h('div', { class: 'row wrap', style: 'margin-bottom:12px' }, chips), holder), destroy: () => comp && comp.destroy() };
}
