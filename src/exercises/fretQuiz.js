// Griffbrett-Quiz.
//  mode 'find': „Finde das C auf der A-Saite“ -> Griffbrett antippen
//  mode 'name': Ein Punkt ist markiert -> Notennamen wählen
import { h } from '../ui/dom.js';
import { createFretboard } from '../ui/fretboard.js';
import { midiAt, noteName, isNatural, STRING_NAMES } from '../audio/music.js';
import { unlock, getCtx } from '../audio/engine.js';
import { pluck } from '../audio/synth.js';

const NAT = ['C', 'D', 'E', 'F', 'G', 'A', 'H'];

/** step = { mode, strings: [0,1], maxFret: 5, rounds: 5 } */
export function createFretQuiz(step, ctx) {
  const strings = step.strings || [0, 1];
  const maxFret = step.maxFret || 5;
  const rounds = step.rounds || 5;
  let round = 0, correct = 0, target = null, locked = false;

  const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const prompt = h('p', { class: 'q' });
  const prog = h('p', { class: 'muted small' });
  const board = createFretboard({ frets: maxFret, silent: step.mode === 'name', onTap: onBoardTap });
  const answers = h('div', { class: 'options row wrap' });
  const el = h('div', { class: 'fretquiz' }, prog, prompt, board.el, step.mode === 'name' ? answers : null, fb);

  if (step.mode === 'name') {
    NAT.forEach((n) => answers.append(h('button', { class: 'btn option', onClick: () => answerName(n) }, n)));
  }

  function pick() {
    for (let tries = 0; tries < 50; tries++) {
      const s = strings[(Math.random() * strings.length) | 0];
      const f = (Math.random() * (maxFret + 1)) | 0;
      const m = midiAt(s, f);
      if (isNatural(m) && !(target && target.s === s && target.f === f)) return { s, f, midi: m, name: noteName(m) };
    }
    return { s: strings[0], f: 0, midi: midiAt(strings[0], 0), name: noteName(midiAt(strings[0], 0)) };
  }

  function next() {
    if (round >= rounds) { finish(); return; }
    locked = false;
    target = pick();
    prog.textContent = `Aufgabe ${round + 1} von ${rounds}`;
    fb.textContent = ''; fb.className = 'feedback';
    if (step.mode === 'name') {
      prompt.textContent = 'Welcher Ton ist markiert?';
      board.setMarks([{ s: target.s, f: target.f, kind: 'root', label: '?' }]);
    } else {
      prompt.textContent = `Finde das ${target.name} auf der ${STRING_NAMES[target.s]}-Saite.`;
      board.setMarks([]);
    }
  }

  function good() {
    correct++; round++; locked = true;
    fb.className = 'feedback ok';
    fb.textContent = '✔ Richtig!';
    setTimeout(next, 800);
  }

  function onBoardTap(s, f, midi) {
    if (step.mode !== 'find' || locked) return;
    if (s !== target.s) { fb.className = 'feedback bad'; fb.textContent = `Das war die ${STRING_NAMES[s]}-Saite. Gesucht: ${STRING_NAMES[target.s]}-Saite.`; return; }
    if (noteName(midi) === target.name) good();
    else { fb.className = 'feedback bad'; fb.textContent = `Das war ${noteName(midi)}. Probier es nochmal.`; }
  }

  function answerName(n) {
    if (locked) return;
    unlock(); pluck(target.midi, getCtx().currentTime + 0.01, 0.8);
    if (n === target.name) { board.setMarks([{ s: target.s, f: target.f, kind: 'correct', label: n }]); good(); }
    else { fb.className = 'feedback bad'; fb.textContent = 'Nicht ganz. Hör hin und versuch es nochmal.'; }
  }

  function finish() {
    prompt.textContent = `Geschafft: ${correct} von ${rounds} richtig!`;
    prog.textContent = '';
    board.setMarks([]);
    answers.remove();
    fb.textContent = '';
    ctx.onDone();
  }

  next();
  return { el };
}
