// Zentrale Web-Audio-Engine: ein AudioContext, ein Master-Ausgang.
// iOS/Safari erlauben Audio erst nach einer Nutzeraktion -> immer unlock() im Klick-Handler aufrufen.

let ctx = null;
let master = null;
let volume = 0.8;

export function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
  }
  return ctx;
}

/** Muss direkt in einem Klick/Touch-Handler aufgerufen werden. */
export function unlock() {
  const c = getCtx();
  const ready = c.state !== 'running' ? c.resume().then(() => c).catch(() => c) : Promise.resolve(c);
  // Zusätzliche Vorbereitung (z. B. Bass-Samples laden), die beim ersten Klick starten darf
  return Promise.all([ready, ...unlockHooks.map((fn) => { try { return fn(); } catch { return null; } })]).then(([ctx]) => ctx);
}

const unlockHooks = [];
/** Registriert eine Funktion, die bei der Audio-Freigabe läuft (darf ein Promise liefern). */
export function onUnlock(fn) { unlockHooks.push(fn); }

export function out() { getCtx(); return master; }
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

/** Eigener Ausgangs-Bus pro Wiedergabe: beim Stoppen sofort stumm schaltbar. */
export function makeBus() {
  const c = getCtx();
  const g = c.createGain();
  g.connect(out());
  return {
    node: g,
    kill() {
      try { g.gain.setTargetAtTime(0, c.currentTime, 0.015); } catch { /* ignore */ }
      setTimeout(() => { try { g.disconnect(); } catch { /* ignore */ } }, 200);
    },
  };
}

/** Gehörte Latenz (Sekunden), für die Timing-Auswertung. */
export function outputLatency() {
  const c = getCtx();
  return c.outputLatency || c.baseLatency || 0;
}
