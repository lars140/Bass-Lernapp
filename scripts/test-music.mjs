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
for (const f of ['level1', 'level2', 'level3', 'level4']) {
  const lv = JSON.parse(readFileSync(`public/content/${f}.json`, 'utf8'));
  for (const m of lv.modules) for (const l of m.lessons) for (const s of l.steps) if (s.riff) parseRiff(s.riff);
}
for (const sg of JSON.parse(readFileSync('public/content/songs.json', 'utf8')).songs) parseRiff(sg.riff);
console.warn = orig;
assert.equal(warnings, 0);

// ---------- Phase 4: Technik-Zeichen, Modi, Walking, Notenschrift ----------
{
  const all = (bars, sub = 1, beats = 4) => parseRiff({ id: 't', beats, sub, bars }).flat.filter((n) => n.type === 'note');
  // Flageolett klingt relativ zur leeren Saite: E12* = E2 (40), E7* = H2 (47), E5* = E3 (52)
  assert.deepEqual(all(['E12* E7* E5* A12*']).map((n) => n.midi), [40, 47, 52, 45]);
  assert.ok(all(['E12* - - -'])[0].harm);
  // Flageolett an einem anderen Bund ist kein Flageolett (Check meldet es zusätzlich)
  assert.equal(all(['E9* - - -'])[0].harm, false);
  // Slap (t) und Pop (o): Pop liegt eine Oktave über dem Slap
  const sp = all(['E0t - D2o - A0t - G2o -'], 2);
  assert.equal(sp[0].slap, true); assert.equal(sp[1].pop, true);
  assert.equal(sp[1].midi - sp[0].midi, 12); assert.equal(sp[3].midi - sp[2].midi, 12);
  // Modi: alle Töne der Riffs gehören zur Tonleiter
  const inScale = (bars, root, type, sub = 2) => {
    const set = new Set(scaleMarks({ root, type, fromFret: 0, toFret: 24 }).map((m) => noteName(m.midi)));
    return all(bars, sub).every((n) => set.has(noteName(n.midi)));
  };
  assert.ok(inScale(['A0 ~ A0 A3 ~ A5 A9 A7', 'D0 ~ D0 D4 ~ D7 ~ A3'].slice(0, 1), 'A', 'dorian'));
  assert.ok(inScale(['D0 ~ D0 D4 ~ D7 D5 D4', 'D0 ~ D0 D4 ~ D7 ~ A3'], 'D', 'mixolydian'));
  assert.ok(inScale(['E1 ~ E1 E5 ~ E7 ~ E5', 'E1 ~ E1 E5 ~ E7 E8 E7'], 'F', 'lydian'));
  assert.ok(inScale(['E0 ~ E0 E1 ~ E0 ~ E3', 'E0 ~ E0 E1 ~ E3 E5 E3'], 'E', 'phrygian'));
  assert.deepEqual([...scaleMarks({ root: 'E', type: 'phrygian', fromFret: 0, toFret: 5, strings: [0] })].map((m) => m.label), ['E', 'F', 'G', 'A']);
  // Walking-Blues: Takt 1 = A H Cis E, Takt 4 endet auf Es (Annäherung an D), Takt 12 endet auf Gis (Annäherung an A)
  const wb = JSON.parse(readFileSync('public/content/level4.json', 'utf8')).modules[1].lessons[1].steps[1].riff;
  const wn = (bar) => all([wb.bars[bar]]).map((n) => noteName(n.midi));
  assert.deepEqual(wn(0), ['A', 'H', 'C#', 'E']);
  assert.equal(wn(3)[3], 'D#'); assert.equal(wn(4)[0], 'D');
  assert.equal(wn(11)[3], 'G#'); assert.equal(wn(0)[0], 'A');
  assert.equal(wb.bars.length, 12);
  // Noten im Bassschlüssel (notiert eine Oktave höher): leere Saiten E A D G
  const { staffPos } = await import('../src/ui/staff.js');
  assert.deepEqual([28, 33, 38, 43].map((m) => staffPos(m).pos), [16, 19, 22, 25]);   // 1. Hilfslinie, 1. Zwischenraum, mittlere Linie, oberster Zwischenraum
  assert.equal(staffPos(36).pos, 21);                                                  // C: zweiter Zwischenraum
  assert.equal(staffPos(29).sharp, false); assert.equal(staffPos(30).sharp, true);     // Fis wird mit Kreuz gezeichnet
}
console.log('✓ Musik-Tests bestanden');
