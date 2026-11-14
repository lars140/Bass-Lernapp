// Musik-Grundlagen: Stimmung, Notennamen, Frequenzen, Tonleitern.
// Saiten-Index: 0 = E (tief) ... 3 = G (hoch). Im Tab steht G oben.

export const STRING_NAMES = ['E', 'A', 'D', 'G'];
export const OPEN_MIDI = [28, 33, 38, 43]; // E1 A1 D2 G2

// Deutsche Notennamen: H = B (international). A# wird als "A#" angezeigt.
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'];
const PCS = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, H: 11, B: 11 };

export function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
export function freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }
export function noteName(midi) { return NAMES[((midi % 12) + 12) % 12]; }
export function noteWithOctave(midi) { return noteName(midi) + (Math.floor(midi / 12) - 1); }
export function midiAt(string, fret) { return OPEN_MIDI[string] + fret; }
export function nameAt(string, fret) { return noteName(midiAt(string, fret)); }
export function isNatural(midi) { return !noteName(midi).includes('#'); }
export function stringLabel(i) { return STRING_NAMES[i] + '-Saite'; }
export function pcOf(name) { return PCS[name] ?? 0; }

/** Tonleitern und Arpeggios als Halbton-Abstände zum Grundton. */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  majorPent: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  'arp-maj': [0, 4, 7],
  'arp-min': [0, 3, 7],
  'arp-dom7': [0, 4, 7, 10],
  'arp-min7': [0, 3, 7, 10],
  'arp-maj7': [0, 4, 7, 11],
};

const DEGREE_LABEL = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

/**
 * Markierungen für das Griffbrett: alle Töne einer Tonleiter im Bereich fromFret..toFret.
 * @param {{root:string,type:string,fromFret?:number,toFret?:number,strings?:number[],labels?:'names'|'degrees'}} o
 */
export function scaleMarks(o) {
  const pc = pcOf(o.root);
  const set = SCALES[o.type] || SCALES.major;
  const out = [];
  for (const s of o.strings || [0, 1, 2, 3]) {
    for (let f = o.fromFret ?? 0; f <= (o.toFret ?? 12); f++) {
      const midi = OPEN_MIDI[s] + f;
      const rel = (((midi - pc) % 12) + 12) % 12;
      if (!set.includes(rel)) continue;
      out.push({ s, f, kind: rel === 0 ? 'root' : 'note', label: o.labels === 'degrees' ? DEGREE_LABEL[rel] : noteName(midi), midi });
    }
  }
  return out;
}

export const INTERVAL_NAMES = {
  1: 'Kleine Sekunde', 2: 'Große Sekunde', 3: 'Kleine Terz', 4: 'Große Terz', 5: 'Quarte', 6: 'Tritonus',
  7: 'Quinte', 8: 'Kleine Sexte', 9: 'Große Sexte', 10: 'Kleine Septime', 11: 'Große Septime', 12: 'Oktave',
};
