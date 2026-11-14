// Einstufungstest und Level-Überspringen per Kurztest.
//  #/placement          Einstufungstest: Level 1, 2, 3 nacheinander. Du steigst bei dem Level ein, das du noch nicht kannst.
//  #/placement/level2   Nur den Test für ein Level (Überspringen). Bestanden = dieses und alle früheren Level gelten als erledigt.
// Übersprungene Lektionen geben keine XP und zählen nicht für Level-Abzeichen (siehe skipLessons in gamify.js).
import { h, confirmDialog } from '../dom.js';
import { getState } from '../../state/store.js';
import { skipLessons } from '../../state/gamify.js';
import { loadAvailableLevels, loadPlacement } from '../../lessons/loader.js';
import { createQuiz } from '../../exercises/quiz.js';
import { toast } from '../toast.js';

export async function placementView(root, [levelArg]) {
  const [pl, levels] = await Promise.all([loadPlacement(), loadAvailableLevels()]);
  const levelNo = (id) => Number(id.replace('level', ''));
  const testIds = Object.keys(pl.levels).sort((a, b) => levelNo(a) - levelNo(b));
  const single = levelArg && pl.levels[levelArg] ? levelArg : null;
  const sequence = single ? [single] : testIds;
  const view = h('section', { class: 'view' }, h('h1', null, single ? 'Level überspringen' : 'Einstufungstest'));
  const card = h('div', { class: 'card' });
  view.append(card);
  root.append(view);
  let current = null;
  const cleanup = () => { if (current && current.destroy) current.destroy(); current = null; };

  const lessonsUpTo = (n) => levels.filter((l) => l.data && levelNo(l.id) <= n).flatMap((l) => l.data.modules.flatMap((m) => m.lessons));
  const titleOf = (id) => (levels.find((l) => l.id === id) || {}).title || id;

  function intro() {
    card.replaceChildren(
      h('p', null, single
        ? `Du kennst den Stoff von „${titleOf(single)}“ schon? Beantworte ${pl.levels[single].questions.length} Fragen. Wenn du fast alle richtig hast, überspringst du dieses Level und alle davor.`
        : `Wie viel kannst du schon? Der Test geht Level für Level vor (${testIds.length} Stufen mit je ${pl.levels[testIds[0]].questions.length} Fragen). Sobald eine Stufe nicht klappt, weißt du, wo du einsteigen solltest. Du entscheidest danach selbst, ob du die Lektionen davor überspringst.`),
      h('p', { class: 'muted small' }, `Zum Bestehen einer Stufe brauchst du mindestens ${Math.round(pl.passRatio * 100)} % richtige Antworten beim ersten Versuch. Du kannst den Test jederzeit wiederholen.`),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onClick: () => runLevel(0, 0) }, 'Test starten'), h('a', { class: 'btn ghost', href: '#/course' }, 'Lieber ganz normal lernen')));
  }

  function runLevel(si, passed) {
    const lid = sequence[si];
    const qs = pl.levels[lid].questions;
    let qi = 0, right = 0;
    function ask() {
      cleanup();
      if (qi >= qs.length) { evaluate(); return; }
      let wrong = false;
      const q = createQuiz(qs[qi], {
        onWrong: () => { wrong = true; },
        onDone: () => {
          if (!wrong) right++;
          body.append(h('div', { class: 'row center' }, h('button', { class: 'btn primary', onClick: () => { qi++; ask(); } }, qi === qs.length - 1 ? 'Ergebnis' : 'Weiter')));
        },
      });
      current = q;
      head.textContent = `${pl.levels[lid].title} · Frage ${qi + 1} von ${qs.length}`;
      body.replaceChildren(q.el);
    }
    function evaluate() {
      const ok = right / qs.length >= pl.passRatio;
      if (ok && si + 1 < sequence.length) { runLevel(si + 1, passed + 1); return; }
      result(ok, passed + (ok ? 1 : 0), right, qs.length, lid);
    }
    const head = h('p', { class: 'muted small' });
    const body = h('div');
    card.replaceChildren(head, body);
    ask();
  }

  function result(ok, passedCount, right, total, lid) {
    if (single) {
      if (ok) {
        const n = lessonsUpTo(levelNo(single)).length;
        card.replaceChildren(
          h('h2', null, `Bestanden: ${right} von ${total} ✔`),
          h('p', null, `Du kannst ${titleOf(single)} und alle Level davor überspringen (${n} Lektionen, bereits erledigte nicht mitgezählt). Dafür gibt es keine XP und keine Level-Abzeichen.`),
          h('div', { class: 'row wrap' },
            h('button', { class: 'btn primary', onClick: () => { skipLessons(lessonsUpTo(levelNo(single))); toast('Level übersprungen.'); location.hash = '#/course'; } }, 'Überspringen'),
            h('a', { class: 'btn ghost', href: '#/course' }, 'Doch lieber durcharbeiten')));
      } else {
        card.replaceChildren(
          h('h2', null, `${right} von ${total} richtig`),
          h('p', null, 'Das reicht noch nicht zum Überspringen. Das ist völlig in Ordnung: Das Level zeigt dir genau das, was noch fehlt.'),
          h('div', { class: 'row wrap' }, h('a', { class: 'btn primary', href: '#/course' }, 'Zum Kurs'), h('button', { class: 'btn ghost', onClick: intro }, 'Test wiederholen')));
      }
      return;
    }
    // Einstiegslevel: nach n bestandenen Stufen starten wir bei Level n + 1
    const start = passedCount + 1;
    const startTitle = (levels.find((l) => levelNo(l.id) === start) || {}).title || `Level ${start}`;
    const allPassed = passedCount >= testIds.length;
    const buttons = [];
    if (passedCount > 0) {
      buttons.push(h('button', { class: 'btn primary', onClick: async () => {
        skipLessons(lessonsUpTo(passedCount), start);
        toast(`Eingestuft: ${startTitle}`);
        location.hash = '#/course';
      } }, `Bei „${startTitle}“ einsteigen`));
      buttons.push(h('button', { class: 'btn ghost', onClick: async () => {
        if (await confirmDialog('Ohne Überspringen beginnst du bei Level 1 und kannst alles in Ruhe durcharbeiten. Das Testergebnis wird gespeichert.', 'Bei Level 1 beginnen')) { skipLessons([], 1); location.hash = '#/course'; }
      } }, 'Trotzdem bei Level 1 beginnen'));
    } else {
      buttons.push(h('button', { class: 'btn primary', onClick: () => { skipLessons([], 1); location.hash = '#/course'; } }, 'Mit Level 1 starten'));
    }
    buttons.push(h('button', { class: 'btn ghost', onClick: intro }, 'Test wiederholen'));
    card.replaceChildren(
      h('h2', null, allPassed ? 'Sehr stark! Du steigst in Level 4 ein.' : `Dein Einstieg: ${startTitle}`),
      h('p', null, passedCount === 0
        ? `In ${titleOf(lid)} hast du ${right} von ${total} richtig. Beginne mit Level 1: Dort wiederholst du die Grundlagen und baust sauber auf.`
        : `Du hast ${passedCount} von ${testIds.length} Stufen bestanden${allPassed ? '' : `; in ${titleOf(lid)} waren es ${right} von ${total}`}. Wenn du magst, überspringst du die ${lessonsUpTo(passedCount).length} Lektionen davor. Dafür gibt es keine XP und keine Level-Abzeichen. Du kannst sie später jederzeit trotzdem öffnen.`),
      h('div', { class: 'row wrap' }, buttons));
  }

  const had = getState().placement;
  intro();
  if (!single && had) card.prepend(h('p', { class: 'feedback ok' }, `Du hast den Test schon gemacht (Einstieg: Level ${had.level}). Du kannst ihn wiederholen.`));
  return cleanup;
}
