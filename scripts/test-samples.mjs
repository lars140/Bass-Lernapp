// Prüft die Bass-Samples: Manifest, Dateien, Lizenz, Zuordnung Ton -> Sample, Abspielgeschwindigkeit. node scripts/test-samples.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
globalThis.window = globalThis;
globalThis.document = { addEventListener() {} };
const { pickSampleMidi, playbackRate, LOWEST, HIGHEST_SAMPLE, MAX_MIDI, playSample, samplesReady } = await import('../src/audio/samples.js');

const dir = 'public/samples/bass';
const man = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
assert.equal(man.notes.length, 12);
assert.deepEqual(man.notes.map((n) => n.midi), Array.from({ length: 12 }, (_, i) => 28 + i), 'ein Sample pro Halbton E1 bis D#2');
let bytes = 0;
for (const n of man.notes) {
  assert.ok(existsSync(`${dir}/${n.file}`), n.file);
  assert.equal(readFileSync(`${dir}/${n.file}`).subarray(0, 4).toString(), 'fLaC', n.file + ' ist keine FLAC-Datei');
  assert.ok(Math.abs(n.cents) < 30, `Stimmung ${n.file}: ${n.cents} Cent`);
  bytes += statSync(`${dir}/${n.file}`).size;
}
assert.ok(bytes < 600 * 1024, 'Samples zusammen unter 600 KB: ' + bytes);
assert.ok(existsSync(`${dir}/LICENSE-CC0.txt`) && /CC0 1.0/.test(readFileSync(`${dir}/LICENSE-CC0.txt`, 'utf8')), 'Lizenztext vorhanden');
assert.ok(/CC0/.test(readFileSync(`${dir}/SOURCE.txt`, 'utf8')) && /FreePats/.test(readFileSync(`${dir}/SOURCE.txt`, 'utf8')), 'Quellenangabe vorhanden');

// Zuordnung: tiefste Saite leer bis D#2 direkt, darüber D#2 hochgeschoben, über 57 keine Samples
assert.equal(LOWEST, 28); assert.equal(HIGHEST_SAMPLE, 39); assert.equal(MAX_MIDI, 57);
assert.equal(pickSampleMidi(28), 28); assert.equal(pickSampleMidi(33), 33); assert.equal(pickSampleMidi(39), 39);
assert.equal(pickSampleMidi(40), 39); assert.equal(pickSampleMidi(55), 39); assert.equal(pickSampleMidi(57), 39);
assert.equal(pickSampleMidi(58), null); assert.equal(pickSampleMidi(27), null); assert.equal(pickSampleMidi(NaN), null);
// Geschwindigkeit: Oktave = ×2, gleicher Ton = 1, Stimmungsausgleich: Sample 10 Cent zu hoch -> minimal langsamer
assert.equal(playbackRate(45, 33), 2); assert.equal(playbackRate(33, 33), 1);
assert.ok(playbackRate(33, 33, 10) < 1 && playbackRate(33, 33, 10) > 0.99);
assert.ok(Math.abs(playbackRate(40, 39) - 2 ** (1 / 12)) < 1e-12);
// Ohne geladene Samples: keine Wiedergabe, Synthese übernimmt
assert.equal(samplesReady(), false);
assert.equal(playSample(40, 0, 0.3, 0.9, null), false);
console.log(`✓ Sample-Tests bestanden (${(bytes / 1024).toFixed(0)} KB, 12 Töne, CC0)`);
