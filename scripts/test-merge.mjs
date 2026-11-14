// Schnelltest der Merge-Regeln: node scripts/test-merge.mjs
import assert from 'node:assert/strict';
import { mergeProgress, sameContent } from '../src/sync/merge.js';
import { defaults } from '../src/state/store.js';

const a = { ...defaults(), updatedAt: 100, xp: 50, done: { x: 10 }, steps: { x: 3, y: 2 }, badges: { b1: 5 }, records: { r: 80 }, days: { d1: 60 }, pos: { lesson: 'x', step: 3 }, streak: { count: 2, best: 2, last: '2026-01-02', freezes: 1, freezeWeek: null } };
const b = { ...defaults(), updatedAt: 200, xp: 90, done: { z: 20 }, steps: { x: 5 }, badges: { b2: 7 }, records: { r: 95 }, days: { d1: 30, d2: 20 }, pos: { lesson: 'z', step: 1 }, streak: { count: 5, best: 5, last: '2026-01-05', freezes: 0, freezeWeek: null } };
const m = mergeProgress(a, b);
assert.equal(m.xp, 90);
assert.deepEqual(Object.keys(m.done).sort(), ['x', 'z']);
assert.deepEqual(m.steps, { x: 5, y: 2 });
assert.deepEqual(Object.keys(m.badges).sort(), ['b1', 'b2']);
assert.equal(m.records.r, 95);
assert.deepEqual(m.days, { d1: 60, d2: 20 });
assert.deepEqual(m.pos, { lesson: 'z', step: 1 });   // neuere Position
assert.equal(m.streak.count, 5);
assert.equal(m.streak.best, 5);
assert.ok(sameContent(mergeProgress(m, b), mergeProgress(b, m)), 'Merge ist kommutativ');

// Zurücksetzen gewinnt gegen ältere Daten
const reset = { ...defaults(), resetAt: 500, updatedAt: 500 };
assert.equal(mergeProgress(a, reset).xp, 0);
assert.equal(mergeProgress(reset, a).xp, 0);
console.log('✓ Merge-Tests bestanden');
