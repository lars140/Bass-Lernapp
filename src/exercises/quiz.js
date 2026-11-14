// Mini-Quiz (Theorie, immer bezogen auf das gerade Gespielte). Optional mit statischer Tab.
import { h, md } from '../ui/dom.js';
import { renderTab } from '../ui/tabview.js';
import { bumpStat } from '../state/gamify.js';

/** step = { question, options: [..], answer: index, explain?, riff? } */
export function createQuiz(step, ctx) {
  let solved = false;
  const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const btns = step.options.map((opt, i) =>
    h('button', {
      class: 'btn option', onClick: () => {
        if (solved) return;
        if (i === step.answer) {
          solved = true;
          btns[i].classList.add('right');
          fb.className = 'feedback ok';
          fb.replaceChildren(md('✔ Richtig! ' + (step.explain || '')));
          bumpStat('quizCorrect');
          ctx.onDone();
        } else {
          btns[i].classList.add('wrong');
          btns[i].disabled = true;
          fb.className = 'feedback bad';
          fb.textContent = 'Fast – probier es nochmal.';
        }
      },
    }, opt));
  const el = h('div', { class: 'quiz' },
    step.riff ? renderTab(step.riff).el : null,
    h('p', { class: 'q' }, md(step.question)),
    h('div', { class: 'options' }, btns), fb);
  return { el };
}
