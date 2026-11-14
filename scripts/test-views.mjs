// Rendert die Ansichten von Phase 4 in jsdom (Audio- und fetch-Stub) und bedient sie: Aufwärmen, Einstufung, Statistik, Songs, Editor.
// Aufruf: node scripts/test-views.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window', 'document', 'localStorage', 'navigator', 'HTMLElement', 'CustomEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'Blob', 'URL', 'location']) {
  try { Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true }); } catch { /* vorhanden */ }
}
const fake = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'currentTime' ? 0 : k === 'sampleRate' ? 48000 : k === 'state' ? 'running' : k === 'then' ? undefined : k === 'length' ? 0 : k === 'resume' ? () => Promise.resolve() : k === Symbol.toPrimitive ? () => 0 : fake()),
  apply: () => fake(), set: () => true,
});
w.AudioContext = function () { return fake(); };
globalThis.AudioContext = w.AudioContext;
w.HTMLDialogElement.prototype.showModal = function () {};
globalThis.fetch = async (url) => {
  const p = 'public' + String(url).split('?')[0];
  try { const text = readFileSync(p, 'utf8'); return { ok: true, json: async () => JSON.parse(text) }; } catch { return { ok: false, status: 404, json: async () => ({}) }; }
};

const errors = [];
const report = (where, e) => errors.push(`${where}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
process.on('unhandledRejection', (e) => report('unhandledRejection', e));
w.addEventListener('error', (e) => report('window.error', e.error || e.message));
const origErr = console.error; console.error = (...a) => report('console.error', a.join(' '));
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const click = (el) => { if (!el) throw new Error('Element zum Klicken nicht gefunden'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const byText = (root, re, sel = 'button, a') => [...root.querySelectorAll(sel)].find((b) => re.test(b.textContent));

const { load, getState, commit } = await import('../src/state/store.js');
load();
const { homeView } = await import('../src/ui/views/home.js');
const { courseView } = await import('../src/ui/views/course.js');
const { warmupView } = await import('../src/ui/views/warmup.js');
const { placementView } = await import('../src/ui/views/placement.js');
const { statsView } = await import('../src/ui/views/stats.js');
const { songsView } = await import('../src/ui/views/songs.js');
const { lessonView } = await import('../src/ui/views/lesson.js');
const { cardIdFor } = await import('../src/state/srs.js');
const levels = ['level1', 'level2', 'level3', 'level4'].map((f) => JSON.parse(readFileSync(`public/content/${f}.json`, 'utf8')));
const allLessons = levels.flatMap((l) => l.modules.flatMap((m) => m.lessons));
const placement = JSON.parse(readFileSync('public/content/placement.json', 'utf8'));

async function mount(view, args = []) {
  const root = document.createElement('div'); document.body.append(root);
  const cleanup = await view(root, args);
  await tick();
  return { root, done: () => { if (typeof cleanup === 'function') cleanup(); root.remove(); } };
}
// Beantwortet das aktuell angezeigte Quiz richtig (answer aus dem Inhalt), auf Wunsch erst falsch
function answerQuiz(root, answer, wrongFirst = false) {
  const opts = [...root.querySelectorAll('.quiz .option')];
  if (wrongFirst) click(opts[(answer + 1) % opts.length]);
  click(opts[answer]);
}
const nextBtn = (root) => byText(root, /^(Weiter|Ergebnis)$/);

try {
  // ---------- Startseite und Kurs (leer) ----------
  let v = await mount(homeView);
  assert.ok(/Einstufungstest/.test(v.root.textContent), 'Einstufungs-Hinweis auf der Startseite');
  assert.ok(!/Aufwärmen/.test(v.root.textContent), 'Noch nichts fällig');
  v.done();
  v = await mount(courseView);
  assert.equal(v.root.querySelectorAll('a.lesson-card').length, allLessons.length, 'alle Lektionen im Kurs (inkl. Level 4)');
  assert.ok(/Level 4/.test(v.root.textContent) && !/Bald verfügbar/.test(v.root.textContent), 'Level 4 ist verfügbar');
  assert.equal(v.root.querySelectorAll('a[href^="#/placement/level"]').length, 2, 'Überspringen-Links für Level 2 und 3');
  v.done();

  // ---------- Level-4-Lektion: Karte wird beim Abschluss eines Quiz-Schritts angelegt ----------
  const clefLesson = allLessons.find((l) => l.id === 'l4-clef');
  v = await mount(lessonView, ['l4-clef']);
  for (let i = 0; i < clefLesson.steps.length; i++) {
    const st = clefLesson.steps[i];
    if (st.type === 'fretquiz') break;              // Griffbrett-Quiz braucht echte Griffbrett-Taps: hier nicht bedienen
    if (st.type === 'quiz') answerQuiz(v.root, st.answer);
    if (st.type === 'staff') assert.ok(v.root.querySelector('svg.staff'), 'Notensystem wird gezeichnet');
    if (st.type === 'quiz' && st.staff) assert.ok(v.root.querySelector('svg.staff'), 'Quiz mit Notensystem');
    const next = byText(v.root, /^(Weiter|Lektion abschließen)$/);
    assert.ok(next && !next.disabled, `Weiter aktiv bei Schritt ${i + 1} (${st.type})`);
    click(next); await tick(5);
  }
  assert.ok(getState().srs[cardIdFor('l4-clef', 2, clefLesson.steps[2])], 'Quiz-Karte angelegt');
  v.done();

  // ---------- Aufwärmen ----------
  const stepOf = (type, pred = () => true) => { for (const l of allLessons) for (const [i, s] of l.steps.entries()) if (s.type === type && pred(s)) return { l, i, s }; };
  const q = stepOf('quiz'), r = stepOf('tab', (s) => s.riff && s.riff.id), f = stepOf('fretquiz');
  const today = Math.floor(Date.now() / 86400000);
  commit((s) => {
    s.srs[cardIdFor(q.l.id, q.i, q.s)] = [today - 3, 1, 250, 1];
    s.srs[cardIdFor(r.l.id, r.i, r.s)] = [today - 2, 3, 250, 2];
    s.srs[cardIdFor(f.l.id, f.i, f.s)] = [today - 1, 1, 250, 1];
    s.srs['q:gibts-nicht#1'] = [today - 9, 1, 250, 1];         // Karte zu verschwundener Lektion
  });
  v = await mount(homeView);
  assert.ok(/Aufwärmen/.test(v.root.textContent) && /fällig/.test(v.root.textContent), 'Aufwärm-Karte auf der Startseite');
  v.done();
  v = await mount(warmupView);
  assert.ok(!getState().srs['q:gibts-nicht#1'], 'verwaiste Karte entfernt');
  answerQuiz(v.root, q.s.answer, true);                          // erst falsch, dann richtig => „again“
  click(byText(v.root, /^Weiter$/)); await tick(5);
  assert.equal(getState().srs[cardIdFor(q.l.id, q.i, q.s)][3], 0, 'falsche Antwort setzt die Karte zurück');
  click(byText(v.root, /Hat geklappt/)); await tick(5);          // Riff-Karte
  assert.equal(getState().srs[cardIdFor(r.l.id, r.i, r.s)][3], 3, 'Riff: Wiederholungen +1');
  assert.ok(v.root.querySelector('.fretquiz'), 'Griffbrett-Karte wird angezeigt');
  v.done();

  // ---------- Statistik ----------
  commit((s) => { s.records['r-rock-riff'] = 90; });
  v = await mount(statsView);
  assert.ok(/Skill-Übersicht/.test(v.root.textContent) && /Tempo-Rekorde/.test(v.root.textContent));
  assert.equal(v.root.querySelectorAll('.skill').length, 6, 'sechs Skill-Bereiche');
  assert.ok(/90 BPM/.test(v.root.textContent), 'Tempo-Rekord sichtbar');
  v.done();

  // ---------- Songs ----------
  commit((s) => { s.done = {}; });
  v = await mount(songsView, [undefined]);
  assert.equal(v.root.querySelectorAll('.song').length, 11);
  assert.ok(v.root.querySelectorAll('.song.locked').length === 11 && v.root.querySelectorAll('a.song').length === 0, 'ohne Lektionen sind alle gesperrt');
  v.done();
  commit((s) => { s.done['l1-groove'] = 1; s.done['l4-harmtap'] = 1; });
  v = await mount(songsView, [undefined]);
  assert.equal(v.root.querySelectorAll('a.song').length, 2, 'zwei Songs freigeschaltet');
  v.done();
  v = await mount(songsView, ['s-sunday-rock']);
  assert.ok(v.root.querySelector('.player'), 'Song-Player');
  click(byText(v.root, /Sauber gespielt/)); await tick(5);
  assert.ok(getState().records['s-sunday-rock'] >= 40, 'Tempo-Rekord für Song gespeichert');
  v.done();
  v = await mount(songsView, ['s-thumb-town']);
  assert.ok(/gesperrt/.test(v.root.textContent), 'gesperrter Song nicht spielbar');
  v.done();

  // ---------- Song-Editor ----------
  v = await mount(songsView, ['editor']);
  click(byText(v.root, /Prüfen/)); await tick(5);
  assert.ok(/gültig/.test(v.root.textContent) && v.root.querySelector('.player'), 'Vorlage ist gültig');
  const ta = v.root.querySelector('textarea');
  const bad = JSON.parse(ta.value); bad.riff.bars[0] = 'E0 ~ E0'; bad.difficulty = 9; ta.value = JSON.stringify(bad);
  click(byText(v.root, /Prüfen/)); await tick(5);
  assert.ok(/statt 8 Schritte/.test(v.root.textContent) && /difficulty/.test(v.root.textContent), 'Fehler werden gemeldet');
  ta.value = '{ kaputt'; click(byText(v.root, /Prüfen/)); await tick(5);
  assert.ok(/Kein gültiges JSON/.test(v.root.textContent));
  const good = { id: 'eigen-1', title: 'Eigen', genre: 'Rock', difficulty: 1, bpm: 80, skills: [], riff: { id: 'eigen-1', bars: ['E0 ~ E0 ~ E0 ~ E0 ~'], sub: 2 } };
  ta.value = JSON.stringify(good); click(byText(v.root, /Speichern/)); await tick(30);
  assert.equal(JSON.parse(localStorage.getItem('bass.songs')).length, 1, 'eigener Song gespeichert');
  v.done();
  v = await mount(songsView, [undefined]);
  assert.equal(v.root.querySelectorAll('.song').length, 12, 'eigener Song in der Liste');
  v.done();

  // ---------- Einstufungstest: alles richtig ----------
  commit((s) => { s.done = {}; s.skipped = {}; s.steps = {}; });
  v = await mount(placementView, [undefined]);
  click(byText(v.root, /Test starten/));
  for (const lid of ['level1', 'level2', 'level3']) {
    for (const qu of placement.levels[lid].questions) {
      answerQuiz(v.root, qu.answer);
      click(nextBtn(v.root)); await tick(2);
    }
  }
  assert.ok(/Level 4/.test(v.root.textContent), 'nach allen Stufen: Einstieg Level 4');
  click(byText(v.root, /einsteigen/)); await tick(5);
  const st = getState();
  const l123 = allLessons.filter((l) => !l.id.startsWith('l4-'));
  assert.ok(l123.every((l) => st.done[l.id] && st.skipped[l.id]), 'Level 1–3 übersprungen');
  assert.ok(!allLessons.some((l) => l.id.startsWith('l4-') && st.skipped[l.id]), 'Level 4 nicht');
  assert.equal(st.placement.level, 4);
  assert.ok(!st.badges.level1 && !st.badges.level3, 'Übersprungenes gibt keine Level-Abzeichen');
  assert.ok(st.badges.placement, 'Einstufungs-Abzeichen');
  v.done();

  // ---------- Einstufungstest: bei Level 2 durchgefallen ----------
  commit((s) => { s.done = {}; s.skipped = {}; s.steps = {}; s.placement = null; });
  v = await mount(placementView, [undefined]);
  click(byText(v.root, /Test starten/));
  for (const qu of placement.levels.level1.questions) { answerQuiz(v.root, qu.answer); click(nextBtn(v.root)); await tick(2); }
  for (const qu of placement.levels.level2.questions) { answerQuiz(v.root, qu.answer, true); click(nextBtn(v.root)); await tick(2); }
  assert.ok(/Level 2/.test(v.root.querySelector('h2').textContent), 'Einstieg bei Level 2');
  click(byText(v.root, /einsteigen/)); await tick(5);
  assert.ok(getState().done['l1-bass'] && !getState().done['l2-muting'], 'nur Level 1 übersprungen');
  v.done();

  // ---------- Level überspringen (Einzeltest) ----------
  commit((s) => { s.done = {}; s.skipped = {}; s.steps = {}; });
  v = await mount(placementView, ['level3']);
  click(byText(v.root, /Test starten/));
  for (const qu of placement.levels.level3.questions) { answerQuiz(v.root, qu.answer); click(nextBtn(v.root)); await tick(2); }
  click(byText(v.root, /^Überspringen$/)); await tick(5);
  assert.ok(getState().done['l3-finale'] && getState().done['l1-bass'] && !getState().done['l4-slap'], 'Level 1–3 übersprungen, Level 4 offen');
  v.done();
} catch (e) { report('Test', e); }

console.error = origErr;
await tick(100);
if (errors.length) { console.error(`✗ ${errors.length} Fehler:\n` + errors.slice(0, 12).join('\n')); process.exit(1); }
console.log('✓ Ansichten von Phase 4 funktionieren (Aufwärmen, Einstufung, Statistik, Songs, Editor)');
process.exit(0);
