// Motivationssystem: XP, Level, Streak, Tagesziel, Abzeichen.
// Alles wird clientseitig berechnet und im normalen Fortschritt gespeichert (keine eigenen API-Aufrufe).
import { commit, getState } from './store.js';
import { emit } from './events.js';
import { BADGES } from './badges.js';
import { dateStr, daysBetween, weekKey } from './dates.js';

export const XP_STEP = 10;
export const XP_LESSON = 50;
export const FREEZE_COST = 150;

/** Level n beginnt bei 40·(n−1)² XP. */
export function levelInfo(xp) {
  const level = Math.floor(Math.sqrt(xp / 40)) + 1;
  const from = 40 * (level - 1) ** 2;
  const to = 40 * level ** 2;
  return { level, from, to, pct: Math.min(1, (xp - from) / (to - from)) };
}

// ---------- interne Helfer (laufen innerhalb von commit) ----------

function bumpStreak(s, today) {
  const st = s.streak;
  const wk = weekKey(today);
  if (st.freezeWeek !== wk) { st.freezeWeek = wk; if (st.freezes < 1) st.freezes = 1; }
  if (st.last === today) return;
  if (!st.last) st.count = 1;
  else {
    const gap = daysBetween(st.last, today);
    if (gap <= 1) st.count += 1;
    else if (gap === 2 && st.freezes > 0) { st.freezes -= 1; st.count += 1; }
    else st.count = 1;
  }
  st.last = today;
  st.best = Math.max(st.best, st.count);
}

function grantXp(s, amount) {
  const before = levelInfo(s.xp).level;
  s.xp += amount;
  const after = levelInfo(s.xp).level;
  if (after > before) queueMicrotask(() => emit('levelup', { level: after }));
}

function awardBadges(s) {
  for (const b of BADGES) {
    if (!s.badges[b.id] && b.test(s)) {
      s.badges[b.id] = Date.now();
      queueMicrotask(() => emit('badge', b));
    }
  }
}

function finalize(s) { awardBadges(s); }

// ---------- öffentliche API ----------

/** Streak anzeigen: bleibt gültig bei gestern, oder vorgestern mit Freeze. */
export function currentStreak(s = getState()) {
  const st = s.streak;
  if (!st.last) return 0;
  const gap = daysBetween(st.last, dateStr());
  if (gap <= 1) return st.count;
  if (gap === 2 && st.freezes > 0) return st.count;
  return 0;
}

export function practicedToday(s = getState()) { return s.streak.last === dateStr(); }

/**
 * Markiert einen Schritt als abgeschlossen.
 * XP gibt es nur beim ersten Mal. Gibt zurück, was sich geändert hat.
 */
export function completeStep(lessonId, idx, total) {
  const result = { xp: 0, lessonDone: false, firstTime: false };
  commit((s) => {
    const today = dateStr();
    bumpStreak(s, today);
    const done = s.steps[lessonId] || 0;
    if (idx >= done) {
      s.steps[lessonId] = idx + 1;
      grantXp(s, XP_STEP);
      result.xp += XP_STEP;
    }
    const finished = (s.steps[lessonId] || 0) >= total;
    if (finished && !s.done[lessonId]) {
      s.done[lessonId] = Date.now();
      grantXp(s, XP_LESSON);
      result.xp += XP_LESSON;
      result.lessonDone = true;
      result.firstTime = true;
      queueMicrotask(() => emit('lessonDone', { lessonId }));
    }
    s.pos = finished ? null : { lesson: lessonId, step: Math.min(idx + 1, total - 1) };
    finalize(s);
  });
  if (result.xp) emit('xp', { amount: result.xp });
  return result;
}

/** Speichert die aktuelle Position (z. B. beim Zurückblättern). */
export function setPosition(lessonId, step) {
  const s = getState();
  if (s.pos && s.pos.lesson === lessonId && s.pos.step === step) return;
  commit((st) => { st.pos = { lesson: lessonId, step }; });
}

export function addBonusXp(amount) {
  commit((s) => { grantXp(s, amount); finalize(s); });
  emit('xp', { amount });
}

/** Tempo-Rekord pro Riff. Gibt true zurück, wenn neuer Rekord. */
export function recordTempo(riffId, bpm) {
  let isNew = false;
  commit((s) => {
    if (bpm > (s.records[riffId] || 0)) { s.records[riffId] = bpm; isNew = true; }
    finalize(s);
  });
  return isNew;
}

export function bumpStat(name) {
  commit((s) => { s.stats[name] = (s.stats[name] || 0) + 1; finalize(s); });
}

export const XP_WARMUP = 10;

/** Aufwärm-Übung (Wiederholung) abgeschlossen: zählt als Übungstag, gibt XP. */
export function completeWarmup(cards) {
  const amount = XP_WARMUP + 2 * cards;
  commit((s) => {
    bumpStreak(s, dateStr());
    s.stats.warmups = (s.stats.warmups || 0) + 1;
    grantXp(s, amount);
    finalize(s);
  });
  emit('xp', { amount });
  return amount;
}

/**
 * Lektionen per Test überspringen (Einstufungs- oder Level-Test). Es gibt dafür keine XP.
 * Übersprungene Lektionen zählen als erledigt, aber nicht für Level-Abzeichen (s.skipped).
 * placementLevel: erstes Level, bei dem du einsteigst (nur beim Einstufungstest).
 */
export function skipLessons(lessons, placementLevel = null) {
  commit((s) => {
    const now = Date.now();
    for (const l of lessons) {
      if (s.done[l.id]) continue;
      s.done[l.id] = now; s.skipped[l.id] = now; s.steps[l.id] = l.steps.length;
    }
    s.stats.skillTests = (s.stats.skillTests || 0) + 1;
    if (placementLevel != null) s.placement = { at: now, level: placementLevel };
    finalize(s);
  });
}

export function buyFreeze() {
  let ok = false;
  commit((s) => {
    if (s.xp >= FREEZE_COST && s.streak.freezes < 2) {
      s.xp -= FREEZE_COST; s.streak.freezes += 1; ok = true;
    }
  });
  return ok;
}

// ---------- Übungszeit ----------

let practicing = 0;      // Anzahl aktiver "Übungs-Ansichten"
let lastActivity = 0;
let timer = null;

export function trackActivity() { lastActivity = Date.now(); }

/** Aufrufen, solange eine Übungsansicht offen ist. Gibt eine Stop-Funktion zurück. */
export function startPractice() {
  practicing++;
  trackActivity();
  let stopped = false;
  return () => { if (!stopped) { stopped = true; practicing--; } };
}

export function startTimer() {
  if (timer) return;
  const goalReached = { today: null };
  timer = setInterval(() => {
    if (!practicing || document.visibilityState !== 'visible') return;
    if (Date.now() - lastActivity > 90000) return; // nur zählen, wenn gerade etwas passiert
    const today = dateStr();
    commit((s) => {
      s.days[today] = (s.days[today] || 0) + 5;
      if (s.days[today] >= 60) bumpStreak(s, today);
      finalize(s);
    });
    const s = getState();
    const goal = s.settings.goal * 60;
    if (s.days[today] >= goal && goalReached.today !== today && s.days[today] < goal + 5) {
      goalReached.today = today;
      emit('goal', {});
    }
  }, 5000);
}

export function todaySeconds(s = getState()) { return s.days[dateStr()] || 0; }
