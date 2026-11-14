// Tempo-Leiter: Riff startet langsam; bei jeder sauberen Wiederholung steigt das Tempo.
import { h } from '../ui/dom.js';
import { createTabPlayer } from './tabPlayer.js';
import { recordTempo, addBonusXp } from '../state/gamify.js';
import { toast } from '../ui/toast.js';

/** step = { riff, start, target, stepBpm } */
export function createTempoLadder(step, ctx) {
  const stepBpm = step.stepBpm || 5;
  let bpm = step.start;
  let finished = false;
  const rungs = Math.ceil((step.target - step.start) / stepBpm) + 1;
  let rung = 1;

  const player = createTabPlayer(step.riff, { bpm, loopAll: true, hideTempo: true });
  const big = h('div', { class: 'ladder-bpm' });
  const info = h('p', { class: 'muted small' });
  const okBtn = h('button', { class: 'btn primary', onClick: up }, '✔ Sauber gespielt');
  const againBtn = h('button', { class: 'btn ghost', onClick: () => toast('Kein Problem – nochmal im gleichen Tempo.', { ms: 1800 }) }, 'Nochmal');
  const downBtn = h('button', { class: 'btn ghost', onClick: down }, 'Etwas langsamer');
  const bar = h('div', { class: 'ladder-bar' }, h('div', { class: 'fill' }));

  function render() {
    big.textContent = `${bpm} BPM`;
    info.textContent = `Stufe ${Math.min(rung, rungs)} von ${rungs} · Ziel: ${step.target} BPM. Spiele das Riff in Schleife und bestätige, wenn es sauber klang.`;
    bar.firstChild.style.width = `${Math.round(((rung - 1) / rungs) * 100)}%`;
    player.setBpm(bpm);
  }

  function up() {
    if (finished) return;
    recordTempo(step.riff.id, bpm);
    if (bpm >= step.target) {
      finished = true;
      player.stop();
      big.textContent = `🎉 ${bpm} BPM geschafft!`;
      bar.firstChild.style.width = '100%';
      addBonusXp(20);
      ctx.onDone();
      return;
    }
    bpm = Math.min(step.target, bpm + stepBpm);
    rung++;
    render();
  }
  function down() { bpm = Math.max(40, bpm - stepBpm); if (rung > 1) rung--; render(); }

  const el = h('div', { class: 'ladder' }, big, bar, player.el, info, h('div', { class: 'row center wrap' }, okBtn, againBtn, downBtn));
  render();
  return { el, destroy: () => player.destroy() };
}
