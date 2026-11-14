// Echte Bass-Samples (FreePats „Finger Bass YR“, CC0, siehe public/samples/bass/SOURCE.txt).
// Zwölf Aufnahmen (E1 bis D#2, je ein Halbton). Höhere Töne entstehen durch Tonhöhenverschiebung, tiefere gibt es auf dem Bass nicht.
// Slap, Pop und Flageolett bleiben synthetisiert (dafür gibt es kein freies Sample-Set).
// Solange die Samples nicht geladen sind (oder bei Fehlern, z. B. offline beim ersten Besuch), spielt die Synthese aus synth.js.
import { getCtx, onUnlock } from './engine.js';

const BASE = '/samples/bass/';
export const LOWEST = 28;        // E1: tiefster Ton eines Basses
export const HIGHEST_SAMPLE = 39;  // D#2: höchstes aufgenommenes Sample
export const MAX_MIDI = 57;      // darüber (mehr als 18 Halbtöne Verschiebung) klingt es unnatürlich: Synthese

let buffers = new Map();          // midi -> { buf, cents }
let state = 'idle';               // idle | loading | ready | failed
let failedAt = 0;
let enabled = true;
let loading = null;

export function setSamplesEnabled(v) { enabled = !!v; }
export function samplesReady() { return enabled && state === 'ready'; }
export function samplesState() { return state; }

/** Welches Sample wird für einen Ton verwendet? null = keins (Synthese). Rein, damit testbar. */
export function pickSampleMidi(midi) {
  if (!Number.isFinite(midi) || midi < LOWEST || midi > MAX_MIDI) return null;
  return Math.min(midi, HIGHEST_SAMPLE);
}

/** Abspielgeschwindigkeit, um aus Sample `from` (mit gemessener Abweichung in Cent) den Ton `to` zu erzeugen. */
export function playbackRate(to, from, cents = 0) {
  return 2 ** ((to - from) / 12) * 2 ** (-cents / 1200);
}

export function loadSamples() {
  if (state === 'ready') return Promise.resolve();
  if (state === 'loading') return loading;
  if (state === 'failed' && Date.now() - failedAt < 30000) return Promise.resolve();
  state = 'loading';
  loading = (async () => {
    try {
      const ctx = getCtx();
      const man = await (await fetch(BASE + 'manifest.json')).json();
      const list = await Promise.all(man.notes.map(async (n) => {
        const r = await fetch(BASE + n.file);
        if (!r.ok) throw new Error('Sample fehlt: ' + n.file);
        const buf = await ctx.decodeAudioData(await r.arrayBuffer());
        return [n.midi, { buf, cents: n.cents || 0 }];
      }));
      buffers = new Map(list);
      state = 'ready';
    } catch {
      state = 'failed'; failedAt = Date.now();
    }
  })();
  return loading;
}

// Beim ersten Klick (Audio-Freigabe) laden, höchstens 2 s darauf warten, danach läuft die Synthese als Rückfall.
onUnlock(() => Promise.race([loadSamples(), new Promise((r) => setTimeout(r, 2000))]));

/**
 * Spielt einen Ton mit Sample. Gibt false zurück, wenn kein Sample genutzt werden kann (dann Synthese).
 * opts: { ghost, soft, glideFrom, vibrato }
 */
export function playSample(midi, t, dur, vel, dest, opts = {}) {
  const base = pickSampleMidi(midi);
  const e = base != null && buffers.get(base);
  if (!e) return false;
  try {
    const c = getCtx();
    const ghost = !!opts.ghost;
    if (ghost) { dur = 0.07; vel *= 0.55; }
    const src = c.createBufferSource();
    src.buffer = e.buf;
    const rate = playbackRate(midi, base, e.cents);
    if (opts.glideFrom != null && pickSampleMidi(opts.glideFrom) === base) {
      src.playbackRate.setValueAtTime(playbackRate(opts.glideFrom, base, e.cents), t);
      src.playbackRate.exponentialRampToValueAtTime(rate, t + Math.min(0.14, dur * 0.7));
    } else src.playbackRate.value = rate;

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = ghost ? 520 : opts.soft ? 2600 : 9000;   // Ghost Notes dumpf, Hammer-on/Pull-off weicher
    lp.Q.value = 0.5;

    const g = c.createGain();
    const peak = 0.9 * vel * (opts.soft ? 0.75 : 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + (opts.soft ? 0.012 : 0.003));
    g.gain.setTargetAtTime(0.0001, t + dur, ghost ? 0.02 : 0.07);

    if (opts.vibrato && src.detune) {
      const lfo = c.createOscillator(); lfo.frequency.value = 5.5;
      const lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(28, t + Math.min(0.5, dur * 0.6));
      lfo.connect(lg).connect(src.detune); lfo.start(t); lfo.stop(t + dur + 0.5);
    }
    src.connect(lp).connect(g).connect(dest);
    src.start(t);
    src.stop(t + dur + 0.6);
    return true;
  } catch {
    return false;
  }
}
