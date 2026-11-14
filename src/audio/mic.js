// Mikrofon-Listener für den Mitspiel-Modus. Alles lokal: Der Ton wird NIE gesendet oder gespeichert.
// Er wird bewusst nicht mit dem Lautsprecher-Ausgang verbunden (keine Rückkopplung).
import { getCtx, unlock, outputLatency } from './engine.js';
import { detectPitch } from './pitch.js';
import { freqToMidi } from './music.js';
import { getSettings } from '../state/store.js';

/** Fragt (nur nach Zustimmung des Nutzers im Browser) das Mikrofon an. Wirft bei Ablehnung. */
export async function startMic() {
  await unlock();
  const ctx = getCtx();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 4096;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  const samples = [];
  const timer = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    const r = detectPitch(buf, ctx.sampleRate);
    samples.push({ t: ctx.currentTime, midi: r ? freqToMidi(r.freq) : null });
    if (samples.length > 800) samples.shift();
  }, 40);
  return {
    samples,
    clear() { samples.length = 0; },
    stop() { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); try { src.disconnect(); } catch { /* ignore */ } },
  };
}

/**
 * Prüft, ob zu jedem geplanten Ton der richtige Ton gespielt wurde.
 * @param {Array<{idx:number,time:number,dur:number,midi:number,ghost?:boolean}>} schedule
 * @returns {{hit:number,total:number,results:Array<{n:object,good:boolean}>}}
 */
export function evaluateNotes(schedule, samples) {
  // Zeitversatz: Ausgabe-Latenz (Klick gehört) + Auswertefenster (~85 ms) + Nutzer-Einstellung
  const offset = outputLatency() + 0.05 + getSettings().latencyMs / 1000;
  const results = [];
  let hit = 0;
  for (const n of schedule) {
    if (n.ghost) continue;
    const from = n.time + offset - 0.1;
    const to = n.time + offset + Math.max(n.dur, 0.15) + 0.15;
    const win = samples.filter((s) => s.midi != null && s.t >= from && s.t <= to);
    const exact = win.filter((s) => Math.round(s.midi) === n.midi).length;
    const octave = win.filter((s) => (Math.round(s.midi) - n.midi) % 12 === 0).length; // Oktavfehler sind bei Bass häufig
    const good = exact >= 2 || octave >= 3;
    if (good) hit++;
    results.push({ n, good });
  }
  return { hit, total: results.length, results };
}
