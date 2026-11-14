// Aufwärm-Wiederholung (Spaced Repetition): ein paar fällige Karten, jeweils kurz.
import { h } from '../dom.js';
import { go } from '../router.js';
import { getState } from '../../state/store.js';
import { dueIds, grade, parseCardId, dropCards, srsStats } from '../../state/srs.js';
import { completeWarmup, startPractice } from '../../state/gamify.js';
import { loadAvailableLevels, flattenLessons } from '../../lessons/loader.js';
import { createQuiz } from '../../exercises/quiz.js';
import { createFretQuiz } from '../../exercises/fretQuiz.js';
import { createTabPlayer } from '../../exercises/tabPlayer.js';

const MAX_PER_SESSION = 6;

export async function warmupView(root) {
  const lessons = new Map(flattenLessons(await loadAvailableLevels()).map((l) => [l.id, l]));
  const stopPractice = startPractice();
  let current = null;

  // Karten, deren Lektion oder Schritt es nicht mehr gibt, werden entfernt
  const queue = [];
  const stale = [];
  for (const id of dueIds()) {
    const p = parseCardId(id);
    const lesson = p && lessons.get(p.lessonId);
    const step = lesson && lesson.steps[p.idx];
    const ok = step && ((p.kind === 'q' && step.type === 'quiz') || (p.kind === 'f' && step.type === 'fretquiz') || (p.kind === 'r' && step.type === 'tab' && step.riff));
    if (ok) { if (queue.length < MAX_PER_SESSION) queue.push({ id, p, lesson, step, retried: false }); } else stale.push(id);
  }
  dropCards(stale);

  const view = h('section', { class: 'view' }, h('h1', null, 'Aufwärmen'));
  root.append(view);
  const total = srsStats();
  if (!queue.length) {
    view.append(h('div', { class: 'card center-text' },
      h('h2', null, total.total ? 'Alles wiederholt 🎉' : 'Noch nichts zu wiederholen'),
      h('p', { class: 'muted' }, total.total
        ? 'Heute ist nichts mehr fällig. Komm morgen wieder, die nächsten Karten werden automatisch fällig.'
        : 'Sobald du Lektionen abschließt, erscheinen ihre Quizfragen, Riffs und Griffbrett-Übungen hier als kurze Wiederholung.'),
      h('a', { class: 'btn primary', href: '#/course' }, 'Zum Kurs')));
    return () => stopPractice();
  }

  const body = h('div');
  const prog = h('p', { class: 'muted small' });
  view.append(h('p', { class: 'muted' }, 'Kurze Wiederholung von Dingen, die du schon geübt hast. Je besser du sie kannst, desto seltener kommen sie wieder.'), prog, h('div', { class: 'card' }, body));
  let pos = 0, done = 0;

  function cleanup() { if (current && current.destroy) current.destroy(); current = null; }

  function next() {
    cleanup();
    if (pos >= queue.length) { finish(); return; }
    const c = queue[pos];
    prog.textContent = `Karte ${pos + 1} von ${queue.length}`;
    body.replaceChildren(h('p', { class: 'muted small' }, `Aus der Lektion „${c.lesson.title}“`));
    if (c.p.kind === 'q') showQuiz(c); else if (c.p.kind === 'f') showFret(c); else showRiff(c);
  }

  function rate(c, quality) {
    grade(c.id, quality);
    if (quality === 'again' && !c.retried) { c.retried = true; queue.push({ ...c }); } else done++;
    pos++;
    next();
  }

  function nextBtn(label, onClick) { return h('div', { class: 'row center' }, h('button', { class: 'btn primary', onClick }, label)); }

  function showQuiz(c) {
    let wrong = false;
    const q = createQuiz(c.step, {
      onWrong: () => { wrong = true; },
      onDone: () => body.append(nextBtn('Weiter', () => rate(c, wrong ? 'again' : 'good'))),
    });
    current = q; body.append(q.el);
  }

  function showFret(c) {
    const q = createFretQuiz({ ...c.step, rounds: 3 }, { onDone: () => body.append(nextBtn('Weiter', () => rate(c, 'good'))) });
    current = q; body.append(q.el);
  }

  function showRiff(c) {
    const player = createTabPlayer(c.step.riff, { bpm: c.step.bpm });
    current = player;
    body.append(h('p', null, 'Spiele dieses Riff aus dem Kopf oder von der Tab. Wie lief es?'), player.el,
      h('div', { class: 'row center wrap selfcheck' },
        h('button', { class: 'btn ghost', onClick: () => rate(c, 'again') }, '↻ Noch unsicher'),
        h('button', { class: 'btn primary', onClick: () => rate(c, 'good') }, '✔ Hat geklappt'),
        h('button', { class: 'btn ghost', onClick: () => rate(c, 'easy') }, '⚡ Locker')));
  }

  function finish() {
    const xp = completeWarmup(done);
    prog.textContent = '';
    const left = srsStats(getState()).due;
    body.replaceChildren(h('div', { class: 'center-text' },
      h('h2', null, 'Aufgewärmt! ☕'),
      h('p', { class: 'xp-line' }, `+${xp} XP`),
      h('p', { class: 'muted' }, left ? `Es sind noch ${left} weitere Karten fällig.` : 'Für heute ist alles wiederholt.'),
      h('div', { class: 'row center wrap' }, left ? h('button', { class: 'btn primary', onClick: () => { go('/'); setTimeout(() => go('/warmup'), 30); } }, 'Noch eine Runde') : null, h('a', { class: 'btn ghost', href: '#/' }, 'Zur Startseite'))));
    document.dispatchEvent(new CustomEvent('celebrate'));
  }

  next();
  return () => { cleanup(); stopPractice(); };
}
