// Lädt Kursinhalte (statische JSON-Dateien). Kein Server, keine Datenbank, nur bei Bedarf.
const cache = new Map();

async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error('Inhalt nicht ladbar: ' + url);
    return r.json();
  });
  cache.set(url, p);
  try { return await p; } catch (e) { cache.delete(url); throw e; }
}

export const loadIndex = () => getJson('/content/index.json');

/** Lädt ein Level (z. B. 'level1'). */
export async function loadLevel(file) { return getJson(`/content/${file}.json`); }

/** Alle verfügbaren Level laden. */
export async function loadAvailableLevels() {
  const idx = await loadIndex();
  const levels = await Promise.all(idx.levels.map(async (l) => (l.available ? { ...l, data: await loadLevel(l.file) } : { ...l, data: null })));
  return levels;
}

/** Flache Liste aller Lektionen (mit Level-/Modul-Infos) in Kursreihenfolge. */
export function flattenLessons(levels) {
  const out = [];
  for (const lv of levels) {
    if (!lv.data) continue;
    for (const m of lv.data.modules) for (const l of m.lessons) out.push({ ...l, levelId: lv.id, moduleId: m.id, moduleTitle: m.title });
  }
  return out;
}

export async function findLesson(id) {
  const levels = await loadAvailableLevels();
  return flattenLessons(levels).find((l) => l.id === id) || null;
}

// ---------- Phase 4: Skills, Songs, Einstufungstest (ebenfalls statische JSON-Dateien) ----------
export const loadSkills = () => getJson('/content/skills.json');
export const loadSongs = async () => (await getJson('/content/songs.json')).songs;
export const loadPlacement = () => getJson('/content/placement.json');

/** Eigene Songs aus dem Song-Editor (nur in diesem Browser gespeichert, nicht im Konto). */
const OWN_KEY = 'bass.songs';
export function loadOwnSongs() {
  try { const v = JSON.parse(localStorage.getItem(OWN_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveOwnSongs(list) {
  try { localStorage.setItem(OWN_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/** Songs, die durch Abschluss einer Lektion neu freigeschaltet wurden. */
export async function newlyUnlockedSongs(lessonId, done) {
  const songs = await loadSongs();
  return songs.filter((s) => (s.requires || []).includes(lessonId) && s.requires.every((id) => done[id]));
}
