// Alle Klänge werden synthetisiert. Keine Audio-Dateien.
import { getCtx, out } from './engine.js';
import { midiToFreq } from './music.js';

let noiseBuf = null;
function noise() {
  const c = getCtx();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/**
 * E-Bass-ähnlicher gezupfter Ton. t = AudioContext-Zeit, dur in Sekunden.
 * opts: { ghost, soft (Hammer-on/Pull-off), glideFrom (Slide, MIDI-Startton), vibrato }
 */
export function pluck(midi, t, dur = 0.4, vel = 0.9, dest = out(), opts = {}) {
  const c = getCtx();
  const f = midiToFreq(midi);
  const ghost = !!opts.ghost;
  if (ghost) { dur = 0.07; vel *= 0.6; }
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.9;
  lp.frequency.setValueAtTime(ghost ? f * 1.8 : Math.min(f * 12, 3600), t);
  lp.frequency.setTargetAtTime(ghost ? f * 1.1 : Math.max(f * 2.4, 140), t, ghost ? 0.02 : 0.09);

  const g = c.createGain();
  const peak = 0.5 * vel * (opts.soft ? 0.7 : 1);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + (opts.soft ? 0.02 : 0.008));
  g.gain.setTargetAtTime(peak * 0.55, t + 0.008, 0.22);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.045);

  const parts = [['sawtooth', 0.4], ['triangle', 0.7], ['sine', 0.5]];
  const end = t + dur + 0.4;
  let lfo = null, lfoGain = null;
  if (opts.vibrato) {
    lfo = c.createOscillator(); lfo.frequency.value = 5.5;
    lfoGain = c.createGain(); lfoGain.gain.setValueAtTime(0, t); lfoGain.gain.linearRampToValueAtTime(28, t + Math.min(0.5, dur * 0.6)); // Cent
    lfo.connect(lfoGain); lfo.start(t); lfo.stop(end);
  }
  for (const [type, level] of parts) {
    const osc = c.createOscillator();
    const og = c.createGain();
    osc.type = type;
    if (opts.glideFrom != null) {
      osc.frequency.setValueAtTime(midiToFreq(opts.glideFrom), t);
      osc.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.14, dur * 0.7));
    } else osc.frequency.value = f;
    if (lfoGain) lfoGain.connect(osc.detune);
    og.gain.value = level;
    osc.connect(og).connect(lp);
    osc.start(t);
    osc.stop(end);
  }
  lp.connect(g).connect(dest);
}

/** Weicher Akkord-/Pad-Klang für Jam-Tracks (mehrere MIDI-Töne gleichzeitig). */
export function chord(midis, t, dur = 1, vel = 0.6, dest = out()) {
  const c = getCtx();
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1400;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.14 * vel, t + 0.012);
  g.gain.setTargetAtTime(0.08 * vel, t + 0.012, 0.3);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
  for (const m of midis) {
    for (const type of ['triangle', 'sawtooth']) {
      const osc = c.createOscillator();
      const og = c.createGain();
      osc.type = type; osc.frequency.value = midiToFreq(m); og.gain.value = type === 'sawtooth' ? 0.25 : 0.6;
      osc.connect(og).connect(lp);
      osc.start(t); osc.stop(t + dur + 0.4);
    }
  }
  lp.connect(g).connect(dest);
}

/** Reiner Ton (Referenzton, Gehörbildung). */
export function tone(freq, t, dur = 1, vel = 0.5, dest = out()) {
  const c = getCtx();
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.02);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.06);
  for (const [type, lvl] of [['sine', 1], ['triangle', 0.3]]) {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = type; o.frequency.value = freq; og.gain.value = lvl;
    o.connect(og).connect(g);
    o.start(t); o.stop(t + dur + 0.5);
  }
  g.connect(dest);
}

export function click(t, accent = false, dest = out()) {
  const c = getCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square';
  o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(accent ? 0.35 : 0.22, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + 0.06);
}

export function kick(t, vel = 1, dest = out()) {
  const c = getCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.9 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + 0.4);
}

export function snare(t, vel = 1, dest = out()) {
  const c = getCtx();
  const n = c.createBufferSource();
  n.buffer = noise();
  const hp = c.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 1200;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.5 * vel, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  n.connect(hp).connect(ng).connect(dest);
  n.start(t, Math.random() * 0.5, 0.25);
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(210, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  og.gain.setValueAtTime(0.4 * vel, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(og).connect(dest);
  o.start(t); o.stop(t + 0.15);
}

export function hat(t, open = false, vel = 1, dest = out()) {
  const c = getCtx();
  const n = c.createBufferSource();
  n.buffer = noise();
  const hp = c.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 7000;
  const g = c.createGain();
  const len = open ? 0.22 : 0.045;
  g.gain.setValueAtTime(0.22 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  n.connect(hp).connect(g).connect(dest);
  n.start(t, Math.random() * 0.5, len + 0.02);
}

/** Kleines Belohnungs-Arpeggio (dezent). */
export function chime(kind = 'ok') {
  const c = getCtx();
  const t = c.currentTime + 0.02;
  const notes = kind === 'big' ? [72, 76, 79, 84] : [76, 83];
  notes.forEach((m, i) => tone(midiToFreq(m), t + i * 0.08, 0.25, 0.18));
}
