// Stimmgerät: Mikrofon (nur mit Einverständnis, komplett lokal) + Referenztöne.
import { h } from '../ui/dom.js';
import { detectPitch } from '../audio/pitch.js';
import { freqToMidi, midiToFreq, noteName, OPEN_MIDI, STRING_NAMES } from '../audio/music.js';
import { unlock, getCtx } from '../audio/engine.js';
import { tone } from '../audio/synth.js';

export function createTuner() {
  let stream = null, ac = null, analyser = null, raf = 0, last = 0;
  const hist = [];

  const note = h('div', { class: 'tuner-note', 'aria-live': 'polite' }, '–');
  const hz = h('div', { class: 'muted' }, 'Tippe auf „Mikrofon starten“ und spiele eine leere Saite.');
  const needle = h('div', { class: 'tuner-needle' });
  const meter = h('div', { class: 'tuner-meter', role: 'img', 'aria-label': 'Abweichung in Cent' },
    h('div', { class: 'tick c' }), needle);
  const hint = h('div', { class: 'tuner-hint', 'aria-live': 'polite' }, '');
  const micBtn = h('button', { class: 'btn primary', onClick: toggleMic }, '🎤 Mikrofon starten');
  const refs = h('div', { class: 'row wrap center' }, STRING_NAMES.map((n, i) =>
    h('button', { class: 'btn ghost', 'aria-label': `Referenzton ${n}-Saite`, onClick: () => { unlock().then(() => tone(midiToFreq(OPEN_MIDI[i]), getCtx().currentTime + 0.02, 1.8, 0.5)); } }, n)));

  const el = h('div', { class: 'tuner' },
    h('p', { class: 'muted small' }, 'Das Mikrofon wird nur nach deiner Zustimmung genutzt. Die Auswertung passiert lokal in deinem Browser – es wird kein Ton gespeichert oder gesendet.'),
    note, hz, meter, hint, h('div', { class: 'row center' }, micBtn),
    h('h3', null, 'Referenztöne'), refs);

  async function toggleMic() {
    if (stream) { stopMic(); return; }
    try {
      await unlock();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      hz.textContent = 'Kein Zugriff auf das Mikrofon. Du kannst stattdessen die Referenztöne nutzen.';
      return;
    }
    ac = getCtx();
    const src = ac.createMediaStreamSource(stream);
    analyser = ac.createAnalyser();
    analyser.fftSize = 8192;
    src.connect(analyser); // bewusst NICHT mit dem Ausgang verbunden (keine Rückkopplung)
    micBtn.textContent = '⏹ Mikrofon stoppen';
    const buf = new Float32Array(analyser.fftSize);
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 80) return;
      last = now;
      analyser.getFloatTimeDomainData(buf);
      const r = detectPitch(buf, ac.sampleRate);
      show(r);
    };
    raf = requestAnimationFrame(loop);
  }

  function show(r) {
    if (!r || r.freq < 28 || r.freq > 420) {
      hist.length = 0;
      return;
    }
    hist.push(r.freq);
    if (hist.length > 5) hist.shift();
    const f = [...hist].sort((a, b) => a - b)[hist.length >> 1];
    const m = freqToMidi(f);
    const nearest = Math.round(m);
    const cents = Math.round((m - nearest) * 100);
    note.textContent = noteName(nearest);
    hz.textContent = `${f.toFixed(1)} Hz · ${cents > 0 ? '+' : ''}${cents} Cent`;
    needle.style.left = `${50 + Math.max(-50, Math.min(50, cents)) }%`;
    const ok = Math.abs(cents) <= 5;
    meter.classList.toggle('ok', ok);
    hint.textContent = ok ? '✔ Gestimmt!' : cents < 0 ? 'Zu tief – Saite spannen' : 'Zu hoch – Saite lockern';
  }

  function stopMic() {
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; analyser = null;
    micBtn.textContent = '🎤 Mikrofon starten';
  }

  return { el, destroy: stopMic };
}
