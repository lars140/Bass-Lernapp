// Tonhöhenerkennung (McLeod-Verfahren / normierte Autokorrelation).
// Läuft komplett lokal im Browser. Audio verlässt nie das Gerät.

/**
 * @param {Float32Array} buf  Zeitsignal
 * @param {number} sampleRate
 * @returns {{freq:number, clarity:number}|null}
 */
export function detectPitch(buf, sampleRate) {
  // Lautstärke-Gate
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  if (Math.sqrt(sum / buf.length) < 0.008) return null;

  // Auf ca. 12 kHz heruntermitteln: spart Rechenzeit, reicht für Bass (< 400 Hz)
  const dec = Math.max(1, Math.round(sampleRate / 12000));
  const n = Math.floor(buf.length / dec);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (let j = 0; j < dec; j++) a += buf[i * dec + j];
    x[i] = a / dec;
  }
  const sr = sampleRate / dec;
  const minLag = Math.max(2, Math.floor(sr / 400));
  const maxLag = Math.min(Math.floor(sr / 30), Math.floor(n / 2));
  const w = n - maxLag;
  if (w < 256) return null;

  // Normierte quadratische Differenzfunktion (NSDF)
  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag; lag++) {
    let acf = 0, m = 0;
    for (let i = 0; i < w; i++) {
      const a = x[i], b = x[i + lag];
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[lag] = m > 0 ? (2 * acf) / m : 0;
  }

  // Positive Maxima zwischen Nulldurchgängen sammeln
  const peaks = [];
  let lag = minLag;
  while (lag < maxLag && nsdf[lag] > 0) lag++; // erst negativen Bereich abwarten
  while (lag < maxLag) {
    while (lag < maxLag && nsdf[lag] <= 0) lag++;
    let best = -1, bestV = -1;
    while (lag < maxLag && nsdf[lag] > 0) {
      if (nsdf[lag] > bestV) { bestV = nsdf[lag]; best = lag; }
      lag++;
    }
    if (best > 0) peaks.push(best);
  }
  if (!peaks.length) return null;
  const maxV = Math.max(...peaks.map((p) => nsdf[p]));
  const pick = peaks.find((p) => nsdf[p] >= 0.9 * maxV);
  if (nsdf[pick] < 0.7) return null;

  // Parabolische Interpolation für Genauigkeit unter 1 Cent
  const a = nsdf[pick - 1], b = nsdf[pick], c = nsdf[pick + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return { freq: sr / (pick + shift), clarity: nsdf[pick] };
}
