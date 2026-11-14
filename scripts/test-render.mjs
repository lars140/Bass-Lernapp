// Rendert jeden Schritt jeder Lektion in jsdom (mit Audio-Stub), klickt alle Buttons und meldet Fehler.
// Aufruf: node scripts/test-render.mjs   (nach Änderungen an exercises/ oder Inhalten)
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window', 'document', 'localStorage', 'navigator', 'HTMLElement', 'CustomEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'Blob', 'URL']) {
  try { Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true }); } catch { /* vorhanden */ }
}
// Audio-Stub: jede Methode/Eigenschaft liefert wieder einen Stub
const fake = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'currentTime' ? 0 : k === 'sampleRate' ? 48000 : k === 'state' ? 'running' : k === 'then' ? undefined : k === 'length' ? 0 : k === 'resume' ? () => Promise.resolve() : k === Symbol.toPrimitive ? () => 0 : fake()),
  apply: () => fake(), set: () => true,
});
w.AudioContext = function () { return fake(); };
globalThis.AudioContext = w.AudioContext;
w.HTMLDialogElement.prototype.showModal = function () {};

const errors = [];
const report = (where, e) => errors.push(`${where}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
process.on('unhandledRejection', (e) => report('unhandledRejection', e));
w.addEventListener('error', (e) => report('window.error', e.error || e.message));
const origErr = console.error; console.error = (...a) => report('console.error', a.join(' '));

const { STEP_TYPES } = await import('../src/exercises/index.js');
const { load } = await import('../src/state/store.js');
load();

let steps = 0;
for (const f of ['level1', 'level2', 'level3', 'level4']) {
  const lv = JSON.parse(readFileSync(`public/content/${f}.json`, 'utf8'));
  for (const m of lv.modules) for (const l of m.lessons) {
    for (const [i, s] of l.steps.entries()) {
      const where = `${l.id}#${i + 1} (${s.type})`;
      steps++;
      try {
        const spec = STEP_TYPES[s.type];
        const inst = spec.create(s, { onDone() {} });
        document.body.append(inst.el);
        for (const b of [...inst.el.querySelectorAll('button')]) {
          if (b.disabled) continue;
          if (/Mikrofon/.test(b.textContent)) continue; // getUserMedia gibt es in jsdom nicht
          b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 5));
        }
        for (const sel of inst.el.querySelectorAll('select')) { sel.dispatchEvent(new w.Event('change', { bubbles: true })); }
        inst.destroy && inst.destroy();
        inst.el.remove();
      } catch (e) { report(where, e); }
    }
  }
}
console.error = origErr;
await new Promise((r) => setTimeout(r, 200));
if (errors.length) { console.error(`✗ ${errors.length} Fehler in ${steps} Schritten:\n` + errors.slice(0, 15).join('\n')); process.exit(1); }
console.log(`✓ ${steps} Schritte gerendert und bedient, keine Fehler`);
process.exit(0);
