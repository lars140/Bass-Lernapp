// Drum-Patterns. 4/4-Takt = 48 Ticks (12 pro Viertel).
//  - 16tel-Patterns: k/s/h als 16 Zeichen (x = Schlag, o = offene Hi-Hat, . = Pause)
//  - Swing-/Shuffle-Patterns: `ticks` mit expliziten Tick-Positionen (Triolen-Raster)
import { kick, snare, hat } from './synth.js';

export const DRUM_PATTERNS = {
  rock8:  { name: 'Rock (Achtel)',  k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  rock4:  { name: 'Rock (Viertel)', k: 'x.......x.......', s: '....x.......x...', h: 'x...x...x...x...' },
  funk:   { name: 'Funk',           k: 'x..x..x...x..x..', s: '....x..x.x..x...', h: 'xxxxxxxxxxxxxxxx' },
  disco:  { name: 'Disco',          k: 'x...x...x...x...', s: '....x.......x...', h: '..o...o...o...o.' },
  reggae: { name: 'Reggae',         k: '........x.......', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
  hiphop: { name: 'Hip-Hop',        k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  shuffle: { name: 'Shuffle (Swing)', ticks: { k: [0, 24], s: [12, 36], h: [0, 8, 12, 20, 24, 32, 36, 44] } },
};

/** Patterns, die im 16tel-Raster der Drum-Machine angezeigt werden können. */
export const GRID_PATTERNS = Object.fromEntries(Object.entries(DRUM_PATTERNS).filter(([, p]) => p.k));

/** Spielt, was zum Tick `tickInBar` (0..47) im Pattern liegt. */
export function playDrumTick(patternId, tickInBar, time, dest) {
  const p = DRUM_PATTERNS[patternId];
  if (!p) return;
  if (p.ticks) {
    if (p.ticks.k.includes(tickInBar)) kick(time, 1, dest);
    if (p.ticks.s.includes(tickInBar)) snare(time, 1, dest);
    if (p.ticks.h.includes(tickInBar)) hat(time, false, 0.9, dest);
    return;
  }
  if (tickInBar % 3 !== 0) return;
  const i = tickInBar / 3;
  if (p.k[i] === 'x') kick(time, 1, dest);
  if (p.s[i] === 'x') snare(time, 1, dest);
  if (p.h[i] === 'x') hat(time, false, 0.9, dest);
  else if (p.h[i] === 'o') hat(time, true, 0.9, dest);
}

/** Tick-Positionen eines Instruments (k, s, h) für Begleitungen (z. B. Bass auf der Bassdrum). */
export function drumTicks(patternId, inst) {
  const p = DRUM_PATTERNS[patternId];
  if (!p) return [];
  if (p.ticks) return p.ticks[inst];
  return [...p[inst]].flatMap((c, i) => (c !== '.' ? [i * 3] : []));
}
