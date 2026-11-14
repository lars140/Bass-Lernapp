// Globale Tastaturkürzel: Leertaste = Play/Pause (bzw. Tap im Rhythmus-Trainer).
// Es gibt immer höchstens einen aktiven Handler (die gerade sichtbare Übung).
let spaceHandler = null;

export function setSpace(fn) {
  spaceHandler = fn;
  return () => { if (spaceHandler === fn) spaceHandler = null; };
}

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || !spaceHandler) return;
  const t = e.target;
  // Bei Formularelementen/Buttons gilt das normale Verhalten (Barrierefreiheit)
  if (t.closest && t.closest('input,select,textarea,button,a,[data-own-keys],dialog')) return;
  e.preventDefault();
  spaceHandler();
});
