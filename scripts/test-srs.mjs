// Tests für Wiederholungssystem, Merge v2 (Karten/Übersprungenes/Einstufung), Migration und Server-Validierung.
// Aufruf: node scripts/test-srs.mjs
import assert from 'node:assert/strict';
const { nextCard, cardIdFor, parseCardId } = await import('../src/state/srs.js');
const { mergeProgress, sameContent } = await import('../src/sync/merge.js');
const { defaults, migrate, SCHEMA_VERSION } = await import('../src/state/store.js');
const { progressData, CURRENT_PROGRESS_VERSION } = await import('../functions/_lib/validate.js');
const { BADGES } = await import('../src/state/badges.js');

// ----- Intervalle (heute = Tag 1000) -----
const T = 1000;
let c = [T + 1, 1, 250, 0];
c = nextCard(c, 'good', T);   assert.deepEqual(c, [T + 1, 1, 250, 1]);        // erste Wiederholung: 1 Tag
c = nextCard(c, 'good', T);   assert.deepEqual(c, [T + 3, 3, 250, 2]);        // dann 3 Tage
c = nextCard(c, 'good', T);   assert.equal(c[1], 8); assert.equal(c[3], 3);    // 3 × 2,5 = 7,5 → 8
c = nextCard(c, 'good', T);   assert.equal(c[1], 20);
const hard = nextCard(c, 'again', T);
assert.deepEqual(hard, [T + 1, 1, 230, 0]);                                    // zurück auf Anfang, Ease sinkt
assert.equal(nextCard([T, 1, 130, 0], 'again', T)[2], 130);                    // Ease nie unter 1,30
const easy = nextCard([T, 8, 250, 3], 'easy', T);
assert.ok(easy[1] > 20 && easy[2] === 260);
let big = [T, 150, 250, 5]; big = nextCard(big, 'good', T); assert.equal(big[1], 180);   // Obergrenze 180 Tage

// ----- Karten-IDs -----
assert.equal(cardIdFor('l1-tabs', 1, { type: 'quiz' }), 'q:l1-tabs#1');
assert.equal(cardIdFor('l1-tabs', 2, { type: 'tab', riff: { id: 'r' } }), 'r:l1-tabs#2');
assert.equal(cardIdFor('l1-tabs', 2, { type: 'tab' }), null);                  // Tab ohne Riff-ID
assert.equal(cardIdFor('l1-tabs', 0, { type: 'text' }), null);
assert.deepEqual(parseCardId('f:l2-notes2#3'), { kind: 'f', lessonId: 'l2-notes2', idx: 3 });
assert.equal(parseCardId('x:y#1'), null);

// ----- Migration v1 -> v2 -----
const old = { v: 1, xp: 120, done: { a: 1 }, steps: { a: 3 }, badges: {}, records: {}, days: {}, stats: { quizCorrect: 2 }, streak: {}, settings: {} };
const mig = migrate(old);
assert.equal(mig.v, SCHEMA_VERSION); assert.deepEqual(mig.srs, {}); assert.deepEqual(mig.skipped, {}); assert.equal(mig.placement, null);
assert.equal(mig.stats.warmups, 0); assert.equal(mig.xp, 120);

// ----- Merge -----
const a = { ...defaults(), updatedAt: 100, srs: { x: [10, 3, 250, 2], y: [5, 1, 250, 1] }, skipped: { l1: 50 }, placement: { at: 10, level: 2 } };
const b = { ...defaults(), updatedAt: 200, srs: { x: [20, 8, 250, 3], z: [7, 1, 250, 0] }, skipped: { l1: 30, l2: 60 }, placement: { at: 90, level: 3 } };
const m = mergeProgress(a, b);
assert.deepEqual(m.srs.x, [20, 8, 250, 3]);               // mehr Wiederholungen gewinnen
assert.deepEqual(Object.keys(m.srs).sort(), ['x', 'y', 'z']);
assert.deepEqual(m.skipped, { l1: 30, l2: 60 });
assert.deepEqual(m.placement, { at: 90, level: 3 });       // neuere Einstufung
assert.ok(sameContent(mergeProgress(a, b), mergeProgress(b, a)), 'Merge bleibt kommutativ');
assert.equal(mergeProgress(a, { ...defaults(), updatedAt: 1 }).placement.level, 2);

// ----- Abzeichen: übersprungene Lektionen zählen nicht -----
const lvl1 = Array.from({ length: 11 }, (_, i) => i);
const ids1 = ['l1-bass', 'l1-tuning', 'l1-plucking', 'l1-fretting', 'l1-notes', 'l1-quarters', 'l1-eighths', 'l1-tabs', 'l1-groove', 'l1-rock', 'l1-ode'];
const s = { ...defaults(), done: Object.fromEntries(ids1.map((i) => [i, 1])) };
const b1 = BADGES.find((x) => x.id === 'level1');
assert.equal(b1.test(s), true);
s.skipped = { 'l1-ode': 1 };
assert.equal(b1.test(s), false);
assert.equal(lvl1.length, ids1.length);

// ----- Server-Validierung (Version 2) -----
assert.equal(CURRENT_PROGRESS_VERSION, 2);
const ok = { ...defaults(), srs: { 'q:a#1': [1, 1, 250, 0] }, skipped: { a: 1 }, placement: { at: 5, level: 2 } };
const parsed = JSON.parse(progressData(ok));
assert.deepEqual(parsed.srs, ok.srs); assert.deepEqual(parsed.placement, { at: 5, level: 2 }); assert.equal(parsed.v, 2);
// v1-Daten vom alten Client: Felder fehlen, werden leer
const v1 = JSON.parse(JSON.stringify(defaults())); v1.v = 1; delete v1.srs; delete v1.skipped; delete v1.placement;
assert.deepEqual(JSON.parse(progressData(v1)).srs, {});
assert.throws(() => progressData({ ...ok, srs: { k: [1, 2, 3] } }), /Wiederholungs-Karte/);                 // falsche Länge
assert.throws(() => progressData({ ...ok, srs: { k: [1, 2, 3, 'x'] } }), /Wiederholungs-Karte/);            // kein Zahlenwert
assert.throws(() => progressData({ ...ok, srs: [] }), /srs/);
assert.throws(() => progressData({ ...ok, srs: Object.fromEntries(Array.from({ length: 601 }, (_, i) => ['q:a#' + i, [1, 1, 250, 0]])) }), /Zu viele/);
assert.throws(() => progressData({ ...ok, v: 3 }), /aktualisieren/);
assert.throws(() => progressData({ ...ok, placement: 'x' }), /Einstufung/);
// Größe: 500 Karten + realistischer Fortschritt bleibt klar unter 60 KB
const many = { ...defaults(), srs: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`q:l3-pentatonic#${i}`, [20000 + i, 30, 250, 6]])) };
const bytes = progressData(many).length;
assert.ok(bytes < 40000, 'Größe mit 500 Karten: ' + bytes);
console.log(`✓ SRS-, Merge-v2- und Validierungs-Tests bestanden (500 Karten = ${(bytes / 1024).toFixed(1)} KB)`);
