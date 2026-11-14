// Lektionsansicht: ein Schritt nach dem anderen. Fortschritt wird nach JEDEM Schritt lokal gespeichert,
// Abbrechen ist jederzeit möglich (Position bleibt erhalten).
import { h } from '../dom.js';
import { getState } from '../../state/store.js';
import { completeStep, setPosition, startPractice } from '../../state/gamify.js';
import { findLesson, loadAvailableLevels, flattenLessons, newlyUnlockedSongs } from '../../lessons/loader.js';
import { STEP_TYPES } from '../../exercises/index.js';
import { go } from '../router.js';
import { register, cardIdFor } from '../../state/srs.js';

export async function lessonView(root, [lessonId]) {
  const lesson = await findLesson(lessonId);
  if (!lesson) { root.append(h('p', null, 'Lektion nicht gefunden.'), h('a', { class: 'btn', href: '#/course' }, 'Zum Kurs')); return; }
  const total = lesson.steps.length;
  const stopPractice = startPractice();
  const s0 = getState();
  const progress = s0.steps[lessonId] || 0;
  let idx = s0.done[lessonId] ? 0 : Math.min(progress, total - 1);
  let current = null;
  let stepDone = false;

  const bar = h('div', { class: 'lbar-fill' });
  const title = h('h1', { class: 'step-title' });
  const body = h('div', { class: 'step-body' });
  const counter = h('span', { class: 'muted small' });
  const back = h('button', { class: 'btn ghost', onClick: () => show(idx - 1) }, '← Zurück');
  const next = h('button', { class: 'btn primary', onClick: advance }, 'Weiter');
  const nav = h('div', { class: 'lesson-nav' }, back, next);

  root.append(h('section', { class: 'view lesson' },
    h('div', { class: 'lesson-top' },
      h('a', { class: 'btn ghost sm', href: '#/course', 'aria-label': 'Lektion verlassen – Fortschritt bleibt gespeichert' }, '✕'),
      h('div', { class: 'lbar', role: 'progressbar', 'aria-label': 'Lektionsfortschritt', 'aria-valuemin': 0, 'aria-valuemax': total }, bar),
      counter),
    h('div', { class: 'card step' }, title, body), nav));

  function cleanupStep() { if (current && current.destroy) current.destroy(); current = null; }

  function updateNav() {
    const spec = STEP_TYPES[lesson.steps[idx].type];
    const completed = idx < (getState().steps[lessonId] || 0);
    next.disabled = spec.interactive && !completed && !stepDone;
    next.textContent = idx === total - 1 ? 'Lektion abschließen' : 'Weiter';
    back.hidden = idx === 0;
  }

  function show(i) {
    if (i < 0 || i >= total) return;
    cleanupStep();
    idx = i; stepDone = false;
    const step = lesson.steps[idx];
    const spec = STEP_TYPES[step.type];
    title.textContent = step.title || lesson.title;
    counter.textContent = `${idx + 1} / ${total}`;
    bar.style.width = `${Math.round(((idx + 1) / total) * 100)}%`;
    body.replaceChildren();
    if (!spec) { body.append(h('p', null, `Unbekannter Schritt-Typ: ${step.type}`)); return; }
    current = spec.create(step, { onDone: () => { stepDone = true; updateNav(); } });
    body.append(current.el);
    setPosition(lessonId, idx);
    updateNav();
    title.focus && title.setAttribute('tabindex', '-1');
  }

  async function advance() {
    // Wiederholungs-Karte für diesen Schritt anlegen (Quiz, Riff, Griffbrett-Quiz)
    register([cardIdFor(lessonId, idx, lesson.steps[idx])]);
    const res = completeStep(lessonId, idx, total);
    if (idx < total - 1) { show(idx + 1); return; }
    cleanupStep();
    await showFinish(res);
  }

  async function showFinish(res) {
    const lessons = flattenLessons(await loadAvailableLevels());
    const i = lessons.findIndex((l) => l.id === lessonId);
    const nextLesson = lessons[i + 1];
    const unlocked = await newlyUnlockedSongs(lessonId, getState().done).catch(() => []);
    title.textContent = 'Lektion geschafft! 🎸';
    counter.textContent = '';
    nav.remove();
    body.replaceChildren(
      h('div', { class: 'prose' },
        h('p', null, `**${lesson.title}** ist abgeschlossen.`.replace(/\*\*/g, '')),
        res.firstTime ? h('p', { class: 'xp-line' }, `+${res.xp} XP`) : h('p', { class: 'muted' }, 'Wiederholt – gut für die Routine!'),
        unlocked.length && res.firstTime ? h('p', null, '🎵 Neu freigeschaltet: ', unlocked.map((s, k) => [k ? ', ' : '', h('a', { href: `#/songs/${s.id}` }, s.title)])) : null),
      h('div', { class: 'row center wrap' },
        nextLesson ? h('a', { class: 'btn primary', href: `#/lesson/${nextLesson.id}` }, `Weiter: ${nextLesson.title}`) : null,
        h('a', { class: 'btn ghost', href: '#/course' }, 'Zurück zum Kurs')));
    if (res.lessonDone) document.dispatchEvent(new CustomEvent('celebrate'));
  }

  show(idx);
  return () => { cleanupStep(); stopPractice(); };
}

export { go };
