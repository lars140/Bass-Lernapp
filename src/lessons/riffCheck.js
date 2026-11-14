// Prüft Riffs und Songs (reine Logik ohne DOM). Wird vom Inhalts-Check (npm run check) und vom Song-Editor genutzt.
export const DRUM_IDS = ['rock8', 'rock4', 'funk', 'disco', 'reggae', 'hiphop', 'shuffle'];
export const TOKEN = /^([EADG]\d{1,2}[ghpvto*/\\]*|-|~)$/; // Technik-Suffixe: g h p v t o * / \
const HARMONIC_FRETS = new Set([5, 7, 12]);

/** Gibt eine Liste von Fehlertexten zurück (leer = in Ordnung). */
export function riffErrors(r, where = 'Riff') {
  const errs = [];
  if (!r || typeof r !== 'object') return [`${where}: kein Riff-Objekt`];
  if (typeof r.id !== 'string' || !r.id) errs.push(`${where}: Riff ohne id`);
  const beats = r.beats == null ? 4 : r.beats;
  const sub = r.sub == null ? 1 : r.sub;
  if (!Number.isInteger(beats) || beats < 1 || beats > 16) errs.push(`${where}: beats muss 1–16 sein`);
  if (![1, 2, 3, 4].includes(sub)) errs.push(`${where}: sub muss 1, 2, 3 oder 4 sein`);
  if (r.bpm != null && !(r.bpm >= 40 && r.bpm <= 200)) errs.push(`${where}: bpm muss 40–200 sein`);
  if (r.drums != null && !DRUM_IDS.includes(r.drums)) errs.push(`${where}: unbekanntes Drum-Pattern „${r.drums}“`);
  if (!Array.isArray(r.bars) || !r.bars.length) { errs.push(`${where}: bars fehlt oder ist leer`); return errs; }
  if (r.bars.length > 64) errs.push(`${where}: höchstens 64 Takte`);
  const steps = beats * sub;
  r.bars.forEach((b, i) => {
    if (typeof b !== 'string') { errs.push(`${where} Takt ${i + 1}: kein Text`); return; }
    const t = b.trim().split(/\s+/);
    if (t.length !== steps) errs.push(`${where} Takt ${i + 1}: ${t.length} statt ${steps} Schritte`);
    for (const x of t) {
      if (!TOKEN.test(x)) { errs.push(`${where} Takt ${i + 1}: ungültiges Token „${x}“`); continue; }
      const m = /^[EADG](\d{1,2})(.*)$/.exec(x);
      if (m && m[2].includes('*') && !HARMONIC_FRETS.has(Number(m[1]))) errs.push(`${where} Takt ${i + 1}: Flageolett (*) geht nur im 5., 7. oder 12. Bund („${x}“)`);
      if (m && Number(m[1]) > 24) errs.push(`${where} Takt ${i + 1}: Bund über 24 („${x}“)`);
    }
  });
  return errs;
}

export const SONG_DIFFICULTY = [1, 2, 3, 4, 5];

/**
 * Prüft einen Song: { id, title, genre, difficulty 1–5, bpm, requires: [lessonIds], skills: [Text], riff, key?, description? }
 * @param {Set<string>} [lessonIds] bekannte Lektions-IDs (optional: dann wird `requires` geprüft)
 */
export function songErrors(song, lessonIds) {
  const where = `Song ${song && song.id ? song.id : '?'}`;
  if (!song || typeof song !== 'object' || Array.isArray(song)) return ['Kein Song-Objekt'];
  const errs = [];
  if (typeof song.id !== 'string' || !/^[\w-]{2,40}$/.test(song.id)) errs.push(`${where}: id fehlt oder ist ungültig (nur Buchstaben, Zahlen, - und _)`);
  if (typeof song.title !== 'string' || !song.title.trim() || song.title.length > 80) errs.push(`${where}: title fehlt`);
  if (typeof song.genre !== 'string' || !song.genre.trim()) errs.push(`${where}: genre fehlt`);
  if (!SONG_DIFFICULTY.includes(song.difficulty)) errs.push(`${where}: difficulty muss 1–5 sein`);
  if (!(song.bpm >= 40 && song.bpm <= 200)) errs.push(`${where}: bpm muss 40–200 sein`);
  if (!Array.isArray(song.skills) || !song.skills.every((x) => typeof x === 'string')) errs.push(`${where}: skills muss eine Liste von Texten sein`);
  if (song.requires != null) {
    if (!Array.isArray(song.requires)) errs.push(`${where}: requires muss eine Liste sein`);
    else if (lessonIds) for (const id of song.requires) if (!lessonIds.has(id)) errs.push(`${where}: unbekannte Lektion „${id}“ in requires`);
  }
  errs.push(...riffErrors(song.riff, `${where} Riff`));
  return errs;
}
