// Prüft alle Lektions-JSONs: Riff-Takte haben die richtige Schrittzahl, Schritt-Typen sind bekannt, IDs eindeutig.
import { readFileSync, readdirSync } from 'node:fs';

const dir = 'public/content';
const TYPES = new Set(['text', 'theory', 'fretboard', 'tab', 'quiz', 'fretquiz', 'rhythm', 'tempoLadder', 'tuner', 'metronome', 'ear', 'jam']);
const SCALES = new Set(['major', 'minor', 'majorPent', 'minorPent', 'blues', 'dorian', 'mixolydian', 'arp-maj', 'arp-min', 'arp-dom7', 'arp-min7', 'arp-maj7']);
const PROGS = new Set(['rock-145', 'blues12', 'pop-1564', 'pop-6415', 'minor-i-VI-III-VII', 'jazz-251', 'funk-i-IV']);
const GENRES = new Set(['rock', 'funk', 'blues', 'reggae', 'disco', 'hiphop']);
const TOKEN = /^([EADG]\d{1,2}[ghpv/\\]*|-|~)$/; // Technik-Suffixe: g h p v / \
let errors = 0;
const err = (m) => { console.error('✗ ' + m); errors++; };
const ids = new Set();

function checkRiff(r, where) {
  const steps = (r.beats || 4) * (r.sub || 1);
  if (!r.id) err(`${where}: Riff ohne id`);
  r.bars.forEach((b, i) => {
    const t = b.trim().split(/\s+/);
    if (t.length !== steps) err(`${where} / ${r.id} Takt ${i + 1}: ${t.length} statt ${steps} Schritte`);
    t.forEach((x) => { if (!TOKEN.test(x)) err(`${where} / ${r.id} Takt ${i + 1}: ungültiges Token "${x}"`); });
  });
}

for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
  const lv = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  for (const m of lv.modules) for (const l of m.lessons) {
    if (ids.has(l.id)) err(`doppelte Lektions-ID ${l.id}`);
    ids.add(l.id);
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
      if (s.type === 'quiz' && !(s.answer >= 0 && s.answer < s.options.length)) err(`${where}: answer außerhalb der Optionen`);
    });
  }
}
console.log(errors ? `${errors} Fehler` : `✓ Inhalte in Ordnung (${ids.size} Lektionen)`);
process.exit(errors ? 1 : 0);
