// Wandelt die FreePats-FLAC-Dateien (24 Bit, 44,1 kHz, ~5 s) in kleine Web-Samples um:
// Pegel angleichen, Stimmung messen, auf 22,05 kHz / 16 Bit verkleinern, nach 3,6 s ausblenden, als FLAC schreiben.
// Aufruf: node build-samples.cjs <Quellordner> <Zielordner>
const fs = require('fs');
const path = require('path');
const Flac = require('libflacjs/dist/libflac.min.js');

const NOTES = ['E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#'];
const MIDI0 = 28;
const OUT_RATE = 22050;
const MAX_SEC = 3.6, FADE_SEC = 0.5;

function decode(buf) {
  const dec = Flac.create_libflac_decoder(false);
  let pos = 0; const chunks = []; let meta = null;
  Flac.init_decoder_stream(dec,
    (n) => { const len = Math.min(n, buf.length - pos); const out = buf.subarray(pos, pos + len); pos += len; return { buffer: out, readDataLength: len, error: false }; },
    (data) => { chunks.push(data[0].slice()); },
    (e, m) => { throw new Error('flac ' + e + ' ' + m); },
    (m) => { meta = m; }, false);
  Flac.FLAC__stream_decoder_process_until_end_of_stream(dec);
  Flac.FLAC__stream_decoder_finish(dec); Flac.FLAC__stream_decoder_delete(dec);
  // libflacjs liefert 4 Byte pro Sample (Int32, vorzeichenerweitert)
  const total = chunks.reduce((a, c) => a + c.length / 4, 0);
  const x = new Float32Array(total); let k = 0; const scale = 2 ** (meta.bitsPerSample - 1);
  for (const c of chunks) for (let i = 0; i < c.length; i += 4) x[k++] = (c[i] | (c[i + 1] << 8) | (c[i + 2] << 16) | (c[i + 3] << 24)) / scale;
  return { x, sr: meta.sampleRate };
}

function corr(seg, lag) { let s = 0, e1 = 0, e2 = 0; for (let i = 0; i + lag < seg.length; i++) { s += seg[i] * seg[i + lag]; e1 += seg[i] * seg[i]; e2 += seg[i + lag] * seg[i + lag]; } return s / Math.sqrt(e1 * e2 + 1e-12); }
function pitchHz(x, sr, from, len) {
  const seg = x.subarray(from, from + len);
  let best = -1, lagBest = 0;
  for (let lag = Math.floor(sr / 150); lag <= Math.floor(sr / 30); lag++) { const r = corr(seg, lag); if (r > best) { best = r; lagBest = lag; } }
  const a = corr(seg, lagBest - 1), b = corr(seg, lagBest), c = corr(seg, lagBest + 1);
  return sr / (lagBest + (a - c) / (2 * (a - 2 * b + c)));
}

// Tiefpass (Fenster-Sinc, 10 kHz) und Halbierung der Abtastrate
function downsample2(x) {
  const N = 63, fc = 0.45; // relativ zur alten Rate: 0.45 * 44100 ≈ 19,8 kHz → wir wollen ≈ 10 kHz, also fc = 0.23
  const h = new Float32Array(N); const f = 0.23; let sum = 0;
  for (let i = 0; i < N; i++) { const m = i - (N - 1) / 2; const s = m === 0 ? 2 * f : Math.sin(2 * Math.PI * f * m) / (Math.PI * m); const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1)); h[i] = s * w; sum += h[i]; }
  for (let i = 0; i < N; i++) h[i] /= sum;
  const out = new Float32Array(Math.floor(x.length / 2));
  for (let o = 0; o < out.length; o++) { let acc = 0; const c = o * 2; for (let i = 0; i < N; i++) { const j = c + i - (N - 1) / 2; if (j >= 0 && j < x.length) acc += x[j] * h[i]; } out[o] = acc; }
  return out;
}

function encode(int16, rate) {
  const enc = Flac.create_libflac_encoder(rate, 1, 16, 8, int16.length, false, 0);
  const parts = [];
  Flac.init_encoder_stream(enc, (data) => { parts.push(Buffer.from(data)); }, () => {}, false);
  const i32 = Int32Array.from(int16);
  Flac.FLAC__stream_encoder_process_interleaved(enc, i32, int16.length);
  Flac.FLAC__stream_encoder_finish(enc); Flac.FLAC__stream_encoder_delete(enc);
  return Buffer.concat(parts);
}

(async () => {
  await new Promise((r) => (Flac.isReady() ? r() : Flac.on('ready', r)));
  const [src, dst] = process.argv.slice(2);
  fs.mkdirSync(dst, { recursive: true });
  const manifest = { sampleRate: OUT_RATE, source: 'FreePats Finger Bass YR (Yamaha RBX), CC0 1.0', notes: [] };
  let totalBytes = 0;
  for (let i = 0; i < NOTES.length; i++) {
    const { x, sr } = decode(fs.readFileSync(path.join(src, NOTES[i] + '.flac')));
    const midi = MIDI0 + i;
    // Stimmung messen (Abweichung von der gleichstufigen Soll-Frequenz)
    let att = 0; const win = Math.floor(sr * 0.02); let m = 0;
    for (let s = 0; s + win < x.length; s += win) { let e = 0; for (let k = s; k < s + win; k++) e += x[k] * x[k]; if (e > m) { m = e; att = s; } }
    const hz = pitchHz(x, sr, att + Math.floor(sr * 0.15), Math.floor(sr * 0.5));
    const cents = 1200 * Math.log2(hz / (440 * 2 ** ((midi - 69) / 12)));
    // Pegel angleichen: RMS der ersten 0,5 s nach dem Anschlag auf gemeinsamen Zielwert
    let ss = 0, n = 0; for (let k = att; k < Math.min(x.length, att + Math.floor(sr * 0.5)); k++) { ss += x[k] * x[k]; n++; }
    const rms = Math.sqrt(ss / n);
    let y = downsample2(x);
    const gainTarget = 0.16 / rms;
    let peak = 0; for (const v of y) peak = Math.max(peak, Math.abs(v));
    const gain = Math.min(gainTarget, 0.92 / peak);
    const len = Math.min(y.length, Math.floor(OUT_RATE * MAX_SEC));
    const out = new Int16Array(len); const fade = Math.floor(OUT_RATE * FADE_SEC);
    for (let k = 0; k < len; k++) {
      let g = gain; const left = len - k; if (left < fade) g *= 0.5 * (1 + Math.cos(Math.PI * (1 - left / fade)));
      out[k] = Math.max(-32768, Math.min(32767, Math.round(y[k] * g * 32767)));
    }
    const file = `m${midi}.flac`;
    const buf = encode(out, OUT_RATE);
    fs.writeFileSync(path.join(dst, file), buf);
    totalBytes += buf.length;
    manifest.notes.push({ midi, file, cents: Math.round(cents) });
    console.log(`${NOTES[i].padEnd(2)} midi ${midi}: ${(len / OUT_RATE).toFixed(2)} s, ${(buf.length / 1024).toFixed(0)} KB, Stimmung ${cents.toFixed(1)} Cent, Gain ${gain.toFixed(2)}`);
  }
  fs.writeFileSync(path.join(dst, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log(`Gesamt: ${(totalBytes / 1024).toFixed(0)} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
