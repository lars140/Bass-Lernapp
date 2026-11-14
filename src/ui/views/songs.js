// Songs: kurze, originale Stücke. Jeder Song hat Schwierigkeit, Genre, Tempo und benötigte Skills (= Lektionen).
// Songs werden freigeschaltet, wenn die Lektionen in `requires` geschafft sind. Eigene Songs (Editor) sind sofort frei.
//   #/songs            Liste
//   #/songs/<id>       Song spielen
//   #/songs/editor     Song-Editor (JSON einfügen, prüfen, ansehen, speichern)
import { h, confirmDialog } from '../dom.js';
import { getState } from '../../state/store.js';
import { recordTempo, startPractice } from '../../state/gamify.js';
import { loadSongs, loadOwnSongs, saveOwnSongs, loadAvailableLevels, flattenLessons } from '../../lessons/loader.js';
import { songErrors } from '../../lessons/riffCheck.js';
import { createTabPlayer } from '../../exercises/tabPlayer.js';
import { toast } from '../toast.js';

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const isUnlocked = (song, s) => !song.requires || song.requires.every((id) => s.done[id]);

const TEMPLATE = {
  id: 'mein-song',
  title: 'Mein erster Song',
  genre: 'Rock',
  difficulty: 2,
  bpm: 90,
  key: 'E',
  skills: ['Achtelnoten'],
  description: 'Ein paar Takte in E und A.',
  riff: {
    id: 'mein-song', title: 'Mein erster Song', bpm: 90, beats: 4, sub: 2, drums: 'rock8',
    bars: ['E0 ~ E0 ~ E0 ~ G3 ~', 'A0 ~ A0 ~ A0 ~ E0 -'],
  },
};

export async function songsView(root, [id]) {
  if (id === 'editor') return editorView(root);
  const built = await loadSongs();
  const own = loadOwnSongs();
  if (id) return detailView(root, [...built, ...own.map((o) => ({ ...o, own: true }))].find((x) => x.id === id));

  const s = getState();
  const lessons = new Map(flattenLessons(await loadAvailableLevels()).map((l) => [l.id, l]));
  const open = built.filter((x) => isUnlocked(x, s)).length;

  function card(song, isOwn) {
    const ok = isOwn || isUnlocked(song, s);
    const missing = (song.requires || []).filter((r) => !s.done[r]).map((r) => (lessons.get(r) || { title: r }).title);
    const body = [
      h('div', { class: 'row between' }, h('strong', null, (ok ? '' : '🔒 ') + song.title), h('span', { class: 'chip static' }, song.genre)),
      h('div', { class: 'muted small' }, `${stars(song.difficulty)} · ${song.bpm} BPM${song.key ? ' · ' + song.key : ''}${s.records[song.riff.id] ? ' · Rekord ' + s.records[song.riff.id] + ' BPM' : ''}`),
      song.description ? h('p', { class: 'small' }, song.description) : null,
      h('div', { class: 'row wrap' }, (song.skills || []).map((k) => h('span', { class: 'tag' }, k))),
      ok ? null : h('p', { class: 'muted small' }, 'Wird frei, wenn du diese Lektion(en) geschafft hast: ' + missing.join(', ')),
    ];
    return ok
      ? h('a', { class: 'card link song', href: `#/songs/${song.id}` }, body)
      : h('div', { class: 'card song locked' }, body);
  }

  root.append(h('section', { class: 'view' },
    h('h1', null, 'Songs'),
    h('p', { class: 'muted' }, `${open} von ${built.length} Songs freigeschaltet. Jede geschaffte Lektion schaltet passende Songs frei.`),
    built.map((x) => card(x, false)),
    h('h2', null, 'Eigene Songs'),
    own.length ? own.map((x) => card(x, true)) : h('p', { class: 'muted' }, 'Hier erscheinen Songs, die du im Editor speicherst.'),
    h('a', { class: 'btn ghost', href: '#/songs/editor' }, '＋ Song im Editor erstellen')));
}

async function detailView(root, song) {
  if (!song) { root.append(h('p', null, 'Song nicht gefunden.'), h('a', { class: 'btn', href: '#/songs' }, 'Zu den Songs')); return; }
  const s = getState();
  if (!song.own && !isUnlocked(song, s)) { root.append(h('p', null, 'Dieser Song ist noch gesperrt.'), h('a', { class: 'btn', href: '#/songs' }, 'Zu den Songs')); return; }
  const stop = startPractice();
  const player = createTabPlayer(song.riff, { bpm: song.bpm });
  const note = h('p', { class: 'feedback', 'aria-live': 'polite' });
  const rec = s.records[song.riff.id];
  root.append(h('section', { class: 'view' },
    h('p', { class: 'small' }, h('a', { href: '#/songs' }, '← Alle Songs')),
    h('h1', null, song.title),
    h('p', { class: 'muted' }, `${song.genre} · ${stars(song.difficulty)} · ${song.bpm} BPM${song.key ? ' · Tonart ' + song.key : ''}`),
    song.description ? h('p', null, song.description) : null,
    h('div', { class: 'row wrap' }, (song.skills || []).map((k) => h('span', { class: 'tag' }, k))),
    h('div', { class: 'card' }, player.el,
      h('div', { class: 'row center wrap selfcheck' },
        h('button', { class: 'btn primary', onClick: () => {
          const bpm = player.getBpm();
          note.className = 'feedback ok';
          note.textContent = recordTempo(song.riff.id, bpm) ? `Neuer Rekord: ${bpm} BPM! 🎉` : `Notiert: ${bpm} BPM (dein Rekord liegt höher).`;
        } }, '✔ Sauber gespielt (aktuelles Tempo)')),
      note, rec ? h('p', { class: 'muted small' }, `Dein Rekord: ${rec} BPM`) : null),
    song.own ? h('button', { class: 'btn danger', onClick: async () => {
      if (await confirmDialog('Diesen eigenen Song löschen?', 'Löschen')) { saveOwnSongs(loadOwnSongs().filter((x) => x.id !== song.id)); location.hash = '#/songs'; }
    } }, 'Song löschen') : null));
  return () => { player.destroy(); stop(); };
}

function editorView(root) {
  const ta = h('textarea', { class: 'input code', rows: 18, spellcheck: 'false', 'aria-label': 'Song als JSON' });
  ta.value = JSON.stringify(TEMPLATE, null, 2);
  const out = h('div', { 'aria-live': 'polite' });
  let player = null;
  let parsed = null;

  function check() {
    if (player) { player.destroy(); player = null; }
    parsed = null;
    out.replaceChildren();
    let song;
    try { song = JSON.parse(ta.value); } catch (e) { out.append(h('p', { class: 'feedback bad' }, 'Kein gültiges JSON: ' + e.message)); return; }
    const errs = songErrors(song);
    if (errs.length) { out.append(h('p', { class: 'feedback bad' }, 'Bitte korrigieren:'), h('ul', null, errs.slice(0, 12).map((e) => h('li', null, e)))); return; }
    parsed = song;
    player = createTabPlayer(song.riff, { bpm: song.bpm });
    out.append(h('p', { class: 'feedback ok' }, '✔ Song ist gültig. Vorschau:'), player.el);
  }

  async function save() {
    check();
    if (!parsed) return;
    const builtIds = new Set((await loadSongs()).map((x) => x.id));
    if (builtIds.has(parsed.id)) { out.prepend(h('p', { class: 'feedback bad' }, `Die ID „${parsed.id}“ gibt es schon als mitgelieferten Song. Bitte eine andere wählen.`)); return; }
    const list = loadOwnSongs().filter((x) => x.id !== parsed.id);
    if (list.length >= 50) { toast('Maximal 50 eigene Songs.'); return; }
    list.push(parsed);
    if (saveOwnSongs(list)) { toast('Song gespeichert.'); location.hash = '#/songs'; } else toast('Speichern nicht möglich (Browser-Speicher gesperrt).');
  }

  root.append(h('section', { class: 'view' },
    h('p', { class: 'small' }, h('a', { href: '#/songs' }, '← Alle Songs')),
    h('h1', null, 'Song-Editor'),
    h('p', { class: 'muted' }, 'Beschreibe einen Song als JSON. Eigene Songs bleiben in diesem Browser und werden nicht mit deinem Konto synchronisiert. Kopiere den JSON-Text als Sicherung in eine Datei. Das Format steht in der README.'),
    ta,
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onClick: check }, 'Prüfen und ansehen'), h('button', { class: 'btn ghost', onClick: save }, 'Speichern'), h('button', { class: 'btn ghost', onClick: () => { ta.value = JSON.stringify(TEMPLATE, null, 2); out.replaceChildren(); } }, 'Vorlage laden')),
    out));
  return () => { if (player) player.destroy(); };
}

export { editorView };
