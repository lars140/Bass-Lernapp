// Prüft Theorie-Helfer und die Tonhöhen aller Riffs gegen die beabsichtigten Töne: node scripts/test-music.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Die UI-Module erwarten einen Browser: minimaler Stub, damit reine Logik in Node testbar ist
globalThis.document = { addEventListener() {} };
globalThis.window = globalThis;
const { scaleMarks, noteName } = await import('../src/audio/music.js');
const { parseRiff } = await import('../src/lessons/riff.js');
const { buildBars } = await import('../src/exercises/jamTrack.js');

// Skalen
const names = (o) => [...new Set(scaleMarks(o).map((m) => m.label))].sort().join(' ');
assert.equal(names({ root: 'A', type: 'minorPent', fromFret: 0, toFret: 12, labels: 'names' }), 'A C D E G');
assert.equal(names({ root: 'C', type: 'major', fromFret: 0, toFret: 12, labels: 'names' }), 'A C D E F G H');
assert.equal(names({ root: 'A', type: 'arp-min7', fromFret: 0, toFret: 12, labels: 'names' }), 'A C E G');

// Riffs: erwartete Töne
const note = (riff) => parseRiff(riff).flat.filter((n) => n.type === 'note' && !n.ghost).map((n) => noteName(n.midi));
const riff = (bars, sub = 2) => ({ id: 't', beats: 4, sub, bars });
assert.deepEqual(note(riff(['E5 E8 A5 A7 D5 D7 G5 G7'])), ['A', 'C', 'D', 'E', 'G', 'A', 'C', 'D']);          // A-Moll-Pentatonik
assert.deepEqual(note(riff(['A3 A5 A7 A8 D5 D7 D9 D10'])), ['C', 'D', 'E', 'F', 'G', 'A', 'H', 'C']);        // C-Dur
assert.deepEqual(note(riff(['A0 A3 D2 G0'], 1)), ['A', 'C', 'E', 'G']);                                       // Am7
assert.deepEqual(note(riff(['A5 A8 D7 D10'], 1)), ['D', 'F', 'A', 'C']);                                      // Dm7
assert.deepEqual(note(riff(['D2 ~ D2 ~ D3 ~ G0 ~'])), ['E', 'E', 'F', 'G']);                                  // Ode, Takt 1
assert.deepEqual(note(riff(['D0 ~ ~ A3 A3 ~ ~ ~'])), ['D', 'C', 'C']);                                        // Ode, Schluss
assert.deepEqual(note(riff(['A0 A4 D2 A4'], 1)), ['A', 'C#', 'E', 'C#']);                                      // A-Dur
assert.deepEqual(note(riff(['A0 D7 A0 D7'], 1)), ['A', 'A', 'A', 'A']);                                       // Disco-Oktaven
const p = parseRiff(riff(['E5 ~ E5/ ~ A2h A0p E3v E0g']));
assert.equal(p.flat[2].slide, 'up'); assert.equal(p.flat[4].hammer, true); assert.equal(p.flat[5].pull, true);
assert.equal(p.flat[6].vib, true); assert.equal(p.flat[7].ghost, true);

// Jam-Folgen
const bars = buildBars('A', 'blues12');
assert.equal(bars.length, 12);
assert.deepEqual(bars.slice(0, 1).concat(bars.slice(4, 5), bars.slice(8, 9)).map((b) => b.name), ['A7', 'D7', 'E7']);
assert.deepEqual(buildBars('E', 'rock-145').map((b) => b.name), ['E', 'A', 'H', 'A']);
assert.deepEqual(buildBars('C', 'jazz-251').map((b) => b.nash), ['2m7', '57', '1maj7', '1maj7']);
assert.equal(buildBars('E', 'rock-145')[0].bassMidi, 28);

// Alle Riffs in allen Level-Dateien parsen ohne Warnungen
let warnings = 0; const orig = console.warn; console.warn = (...a) => { warnings++; orig(...a); };
for (const f of ['level1', 'level2', 'level3']) {
  const lv = JSON.parse(readFileSync(`public/content/${f}.json`, 'utf8'));
  for (const m of lv.modules) for (const l of m.lessons) for (const s of l.steps) if (s.riff) parseRiff(s.riff);
}
console.warn = orig;
assert.equal(warnings, 0);
console.log('✓ Musik-Tests bestanden');
