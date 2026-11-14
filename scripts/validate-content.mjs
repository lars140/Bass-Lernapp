// Prüft alle Inhalte: Lektionen (Taktlängen, Typen, IDs), Skill-Zuordnung, Songs und Einstufungstest.
import { readFileSync, readdirSync } from 'node:fs';
import { riffErrors, songErrors } from '../src/lessons/riffCheck.js';

const dir = 'public/content';
const TYPES = new Set(['staff', 'text', 'theory', 'fretboard', 'tab', 'quiz', 'fretquiz', 'rhythm', 'tempoLadder', 'tuner', 'metronome', 'ear', 'jam']);
const SCALES = new Set(['major', 'minor', 'majorPent', 'minorPent', 'blues', 'dorian', 'mixolydian', 'lydian', 'phrygian', 'locrian', 'arp-maj', 'arp-min', 'arp-dom7', 'arp-min7', 'arp-maj7']);
const PROGS = new Set(['rock-145', 'blues12', 'pop-1564', 'pop-6415', 'minor-i-VI-III-VII', 'jazz-251', 'funk-i-IV']);
const GENRES = new Set(['rock', 'funk', 'blues', 'reggae', 'disco', 'hiphop']);
let errors = 0;
const err = (m) => { console.error('✗ ' + m); errors++; };
const ids = new Set();
const riffIds = new Set();
const json = (f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));

function checkRiff(r, where) {
  for (const m of riffErrors(r, `${where} / ${r.id}`)) err(m);
  if (r.id) riffIds.add(r.id); // dieselbe Riff-ID darf in mehreren Schritten vorkommen (z. B. Tab + Tempo-Leiter, gemeinsamer Tempo-Rekord)
}

function checkQuiz(s, where) {
  if (!Array.isArray(s.options) || s.options.length < 2) err(`${where}: Quiz braucht mindestens 2 Optionen`);
  else if (!(s.answer >= 0 && s.answer < s.options.length)) err(`${where}: answer außerhalb der Optionen`);
  if (s.staff && !(Array.isArray(s.staff.notes) && s.staff.notes.every(Number.isInteger))) err(`${where}: staff.notes muss eine Liste von MIDI-Zahlen sein`);
}

const levelFiles = readdirSync(dir).filter((x) => /^level\d+\.json$/.test(x));
for (const f of levelFiles) {
  const lv = json(f);
  for (const m of lv.modules) for (const l of m.lessons) {
    if (ids.has(l.id)) err(`doppelte Lektions-ID ${l.id}`);
    ids.add(l.id);
    if (!/^l\d-/.test(l.id) || !l.id.startsWith('l' + f.match(/\d+/)[0] + '-')) err(`${l.id}: ID passt nicht zur Datei ${f} (Präfix l${f.match(/\d+/)[0]}-)`);
    l.steps.forEach((s, i) => {
      const where = `${l.id} Schritt ${i + 1}`;
      if (!TYPES.has(s.type)) err(`${where}: unbekannter Typ ${s.type}`);
      if (s.riff) checkRiff(s.riff, where);
      if (s.type === 'rhythm') {
        const n = (s.sub || 1) * 4;
        s.bars.forEach((b, k) => { if (b.trim().split(/\s+/).length !== n) err(`${where}: Rhythmus-Takt ${k + 1} hat nicht ${n} Zellen`); });
      }
      if (s.scale && !SCALES.has(s.scale.type)) err(`${where}: unbekannte Skala ${s.scale.type}`);
      if (s.type === 'jam') { if (s.progression && !PROGS.has(s.progression)) err(`${where}: unbekannte Akkordfolge`); if (s.genre && !GENRES.has(s.genre)) err(`${where}: unbekanntes Genre`); }
      if (s.type === 'ear' && !['interval', 'quality', 'line'].includes(s.mode)) err(`${where}: unbekannter Ear-Modus`);
      if (s.type === 'quiz') checkQuiz(s, where);
      if (s.type === 'staff' && !(Array.isArray(s.notes) && s.notes.length && s.notes.every(Number.isInteger))) err(`${where}: staff braucht notes (MIDI-Zahlen)`);
    });
  }
}

// Level-Index: jede Datei muss im Index stehen, verfügbare Level müssen existieren
const index = json('index.json');
for (const lv of index.levels) {
  if (lv.available && !levelFiles.includes(lv.file + '.json')) err(`index.json: Level ${lv.id} ist verfügbar, aber ${lv.file}.json fehlt`);
}
for (const f of levelFiles) if (!index.levels.some((l) => l.file + '.json' === f)) err(`${f} fehlt in index.json`);

// Skill-Zuordnung: jede Lektion hat genau einen bekannten Bereich
const skills = json('skills.json');
for (const id of ids) if (!skills.lessons[id]) err(`skills.json: Lektion ${id} ist keinem Bereich zugeordnet`);
for (const [id, area] of Object.entries(skills.lessons)) {
  if (!ids.has(id)) err(`skills.json: unbekannte Lektion ${id}`);
  if (!skills.areas[area]) err(`skills.json: unbekannter Bereich „${area}“ bei ${id}`);
}

// Songs
const songs = json('songs.json');
const songIds = new Set();
for (const s of songs.songs) {
  for (const m of songErrors(s, ids)) err(m);
  if (songIds.has(s.id)) err(`doppelte Song-ID ${s.id}`);
  songIds.add(s.id);
  if (s.riff && riffIds.has(s.riff.id) && s.riff.id !== s.id) err(`Song ${s.id}: Riff-ID ${s.riff.id} kommt schon in einer Lektion vor`);
}

// Einstufungstest
const pl = json('placement.json');
if (!(pl.passRatio > 0 && pl.passRatio <= 1)) err('placement.json: passRatio muss zwischen 0 und 1 liegen');
for (const [lid, lv] of Object.entries(pl.levels)) {
  if (!index.levels.some((l) => l.id === lid)) err(`placement.json: unbekanntes Level ${lid}`);
  lv.questions.forEach((q, i) => {
    checkQuiz(q, `placement ${lid} Frage ${i + 1}`);
    if (q.riff) for (const m of riffErrors(q.riff, `placement ${lid} Frage ${i + 1}`)) err(m);
  });
}

console.log(errors ? `${errors} Fehler` : `✓ Inhalte in Ordnung (${ids.size} Lektionen, ${songs.songs.length} Songs)`);
process.exit(errors ? 1 : 0);
