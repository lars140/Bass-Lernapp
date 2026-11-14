// Registry der Schritt-Typen einer Lektion.
// Jede Factory bekommt (step, ctx) und liefert { el, destroy? }.
// ctx.onDone() meldet „Schritt erledigt“. Passive Schritte brauchen kein onDone.
import { h, md, paragraphs } from '../ui/dom.js';
import { createFretboard, stringMarks } from '../ui/fretboard.js';
import { bassDiagram } from '../ui/bassDiagram.js';
import { renderStaff } from '../ui/staff.js';
import { createTabPlayer } from './tabPlayer.js';
import { createQuiz } from './quiz.js';
import { createFretQuiz } from './fretQuiz.js';
import { createRhythmTrainer } from './rhythmTrainer.js';
import { createTempoLadder } from './tempoLadder.js';
import { createTuner } from './tuner.js';
import { createMetronome } from './metronome.js';
import { createEarTraining } from './earTraining.js';
import { createJamTrack } from './jamTrack.js';
import { OPEN_MIDI, noteName, scaleMarks } from '../audio/music.js';
import { unlock, getCtx } from '../audio/engine.js';
import { pluck } from '../audio/synth.js';
import { startMic, evaluateNotes } from '../audio/mic.js';
import { bumpStat } from '../state/gamify.js';

function text(step) {
  return { el: h('div', { class: 'prose' }, paragraphs(step.body), step.diagram === 'bass' ? bassDiagram() : null) };
}

function theory(step) {
  return {
    el: h('aside', { class: 'theory' },
      h('div', { class: 'theory-title' }, '💡 Warum klingt das so?'),
      paragraphs(step.body)),
  };
}

// step: { text?, string?, frets?, marks?: [[string,fret,label?]], scale?: {root,type,fromFret,toFret,strings,labels}, labels }
function fretboard(step) {
  let marks = [];
  let playable = null;
  if (step.scale) {
    marks = scaleMarks(step.scale);
    playable = [...new Set(marks.map((m) => m.midi))].sort((a, b) => a - b);
  } else if (step.marks) {
    marks = step.marks.map(([s, f, label]) => ({
      s, f, kind: f === 0 ? 'root' : 'note',
      label: label != null ? label : step.labels === 'frets' ? f : noteName(OPEN_MIDI[s] + f),
    }));
  } else if (step.string != null) {
    marks = stringMarks(step.string, step.frets || 5);
  }
  const frets = step.frets || (step.scale ? (step.scale.toFret ?? 12) : 5);
  const fb = createFretboard({ frets, marks });
  let playBtn = null;
  if (playable) {
    playBtn = h('button', { class: 'btn ghost', onClick: async () => {
      await unlock();
      const t0 = getCtx().currentTime + 0.05;
      playable.forEach((m, i) => pluck(m, t0 + i * 0.32, 0.3, 0.8));
    } }, '▶ Töne aufwärts abspielen');
  }
  return {
    el: h('div', null,
      step.text ? h('div', { class: 'prose' }, paragraphs(step.text)) : null, fb.el,
      playBtn ? h('div', { class: 'row' }, playBtn) : null,
      h('p', { class: 'muted small' }, step.scale ? 'Die Wurzel („1“ bzw. Grundton) ist farbig gefüllt. Tippe auf das Griffbrett, um die Töne zu hören.' : 'Tippe auf das Griffbrett, um die Töne zu hören.')),
  };
}

// Tab-Player mit Selbsteinschätzung („Hat geklappt / Nochmal“) – funktioniert ohne Mikrofon.
// Optional: „Mit Mikrofon prüfen“ (nur nach Einverständnis, lokal) – dann ist der Bass-Ton stummgeschaltet.
function tab(step, ctx) {
  const mic = { on: false, listener: null, schedule: [] };
  const result = h('p', { class: 'feedback', 'aria-live': 'polite' });
  const player = createTabPlayer(step.riff, {
    bpm: step.bpm,
    muteBass: () => mic.on,
    onNote: (n) => { if (mic.on) mic.schedule.push(n); },
    onStart: () => { mic.schedule = []; result.textContent = ''; result.className = 'feedback'; if (mic.on) mic.listener.clear(); },
    onFinish: () => { if (mic.on) evaluate(); },
  });

  function evaluate() {
    const r = evaluateNotes(mic.schedule, mic.listener.samples);
    const per = player.parsed.stepsPerBar;
    r.results.forEach(({ n, good }) => player.tab.markNote(Math.floor(n.idx / per), n.idx % per, good ? 'hit' : 'miss'));
    const pct = r.total ? Math.round((r.hit / r.total) * 100) : 0;
    if (pct >= 70) {
      result.className = 'feedback ok';
      result.textContent = `✔ ${r.hit} von ${r.total} Tönen erkannt (${pct} %). Sehr gut!`;
      bumpStat('micPassed');
      finish();
    } else {
      result.className = 'feedback bad';
      result.textContent = `${r.hit} von ${r.total} Tönen erkannt (${pct} %). Rot markierte Töne nochmal üben. Tipp: Kopfhörer nutzen, Tempo senken oder Bass näher ans Gerät halten.`;
    }
  }

  const micChip = h('button', { class: 'chip', 'aria-pressed': 'false', onClick: async () => {
    if (mic.on) { mic.listener.stop(); mic.listener = null; mic.on = false; micChip.setAttribute('aria-pressed', 'false'); micNote.textContent = ''; return; }
    try {
      mic.listener = await startMic();
      mic.on = true;
      micChip.setAttribute('aria-pressed', 'true');
      micNote.textContent = 'Mikrofon aktiv (nur lokal). Der Bass-Ton der App ist stumm, Klick und Drums laufen weiter. Am besten mit Kopfhörern spielen.';
    } catch {
      micNote.textContent = 'Kein Zugriff auf das Mikrofon. Kein Problem: Nutze „Hat geklappt / Nochmal“.';
    }
  } }, '🎤 Mit Mikrofon prüfen');
  const micNote = h('p', { class: 'muted small' });
  if (step.mic !== false && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) player.extra.append(micChip);

  const ok = h('button', { class: 'btn primary', onClick: () => finish() }, '✔ Hat geklappt');
  function finish() { ctx.onDone(); ok.textContent = '✔ Hat geklappt'; ok.disabled = true; }
  const again = h('button', { class: 'btn ghost', onClick: () => player.play() }, '↻ Nochmal');
  return {
    el: h('div', null, step.text ? h('div', { class: 'prose' }, paragraphs(step.text)) : null, player.el, micNote, result,
      h('div', { class: 'row center wrap selfcheck' }, again, ok)),
    destroy: () => { player.destroy(); if (mic.listener) mic.listener.stop(); },
  };
}

function tuner(step, ctx) {
  const t = createTuner();
  const ok = h('button', { class: 'btn primary', onClick: () => { ctx.onDone(); ok.disabled = true; ok.textContent = '✔ Gestimmt'; } }, '✔ Mein Bass ist gestimmt');
  return { el: h('div', null, step.text ? h('div', { class: 'prose' }, paragraphs(step.text)) : null, t.el, h('div', { class: 'row center' }, ok)), destroy: t.destroy };
}

function metronome(step, ctx) {
  const m = createMetronome();
  const ok = h('button', { class: 'btn primary', onClick: () => { ctx.onDone(); ok.disabled = true; } }, 'Weiter');
  return { el: h('div', null, step.text ? h('div', { class: 'prose' }, paragraphs(step.text)) : null, m.el, h('div', { class: 'row center' }, ok)), destroy: m.destroy };
}

function ear(step, ctx) {
  const e = createEarTraining(step, ctx);
  return { el: h('div', null, step.text ? h('div', { class: 'prose' }, paragraphs(step.text)) : null, e.el), destroy: e.destroy };
}

function jam(step, ctx) {
  const j = createJamTrack(step, ctx);
  return { el: h('div', null, step.text ? h('div', { class: 'prose' }, paragraphs(step.text)) : null, j.el), destroy: j.destroy };
}

// Notensystem (Bassschlüssel): step { notes: [midi…], names?, text? }
function staffStep(step) {
  return { el: h('div', null, step.text ? h('div', { class: 'prose' }, paragraphs(step.text)) : null, renderStaff(step.notes, { names: !!step.names })) };
}

export const STEP_TYPES = {
  staff:        { create: staffStep, interactive: false },
  text:         { create: text, interactive: false },
  theory:       { create: theory, interactive: false },
  fretboard:    { create: fretboard, interactive: false },
  tab:          { create: tab, interactive: true },
  quiz:         { create: createQuiz, interactive: true },
  fretquiz:     { create: createFretQuiz, interactive: true },
  rhythm:       { create: createRhythmTrainer, interactive: true },
  tempoLadder:  { create: createTempoLadder, interactive: true },
  tuner:        { create: tuner, interactive: true },
  metronome:    { create: metronome, interactive: true },
  ear:          { create: ear, interactive: true },
  jam:          { create: jam, interactive: true },
};

export { md };
