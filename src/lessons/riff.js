// Riff-Format parsen. Siehe docs/CONTENT.md bzw. README.
//
// riff = { id, title, bpm, beats: 4, sub: 2, drums?: 'rock8', bars: ["E0 ~ E0 ~ ...", ...] }
// Tokens pro Schritt:
//   E0       Saite E, Bund 0           -   Pause           ~   Ton halten
// Technik-Suffixe am Ton (kombinierbar):
//   g  Ghost Note (gedämpft, perkussiv)   h  Hammer-on ZU diesem Ton   p  Pull-off ZU diesem Ton
//   /  Slide hoch ZU diesem Ton           \  Slide runter ZU diesem Ton   v  Vibrato
import { midiAt } from '../audio/music.js';
import { TPB } from '../audio/sequencer.js';

const STRING_INDEX = { E: 0, A: 1, D: 2, G: 3 };
const TOKEN = /^([EADG])(\d{1,2})([ghpv/\\]*)$/;

export function parseRiff(riff) {
  const beats = riff.beats || 4;
  const sub = riff.sub || 1;
  const stepsPerBar = beats * sub;
  const bars = riff.bars.map((str, bi) => {
    const toks = str.trim().split(/\s+/);
    if (toks.length !== stepsPerBar) {
      console.warn(`Riff ${riff.id}: Takt ${bi + 1} hat ${toks.length} statt ${stepsPerBar} Schritte`);
    }
    return toks.map((t) => {
      if (t === '-') return { type: 'rest' };
      if (t === '~') return { type: 'hold' };
      const m = TOKEN.exec(t);
      if (!m) { console.warn(`Riff ${riff.id}: ungültiges Token „${t}“`); return { type: 'rest' }; }
      const string = STRING_INDEX[m[1]];
      const fret = Number(m[2]);
      const fl = m[3];
      return {
        type: 'note', string, fret, midi: midiAt(string, fret),
        ghost: fl.includes('g'), hammer: fl.includes('h'), pull: fl.includes('p'),
        slide: fl.includes('/') ? 'up' : fl.includes('\\') ? 'down' : null, vib: fl.includes('v'),
      };
    });
  });
  const flat = bars.flat();
  let prev = null;
  flat.forEach((n, i) => {
    if (n.type !== 'note') return;
    let len = 1;
    while (flat[i + len] && flat[i + len].type === 'hold') len++;
    n.len = len;
    n.prevMidi = prev; // für Slides: Startton
    prev = n.midi;
  });
  return {
    beats, sub, stepsPerBar, bars, flat,
    totalSteps: flat.length,
    tps: TPB / sub,                 // Ticks pro Schritt
    ticksPerBar: stepsPerBar * (TPB / sub),
    totalTicks: flat.length * (TPB / sub),
  };
}
