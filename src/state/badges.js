// Abzeichen. `test(state)` wird nach jeder Änderung geprüft (rein clientseitig).
// LEVEL1_LESSONS: Anzahl der Lektionen in Level 1 (siehe public/content/level1.json).
const LEVEL1_LESSONS = 11, LEVEL2_LESSONS = 8, LEVEL3_LESSONS = 13;
const doneCount = (s, prefix) => Object.keys(s.done).filter((k) => k.startsWith(prefix)).length;
const maxRecord = (s) => Math.max(0, ...Object.values(s.records));

export const BADGES = [
  { id: 'first-step',  icon: '🎵', title: 'Erster Ton',       desc: 'Ersten Schritt abgeschlossen', test: (s) => Object.keys(s.steps).length > 0 },
  { id: 'first-lesson',icon: '✅', title: 'Erste Lektion',    desc: 'Eine Lektion abgeschlossen', test: (s) => Object.keys(s.done).length >= 1 },
  { id: 'tuned',       icon: '🎚️', title: 'Gut gestimmt',     desc: 'Lektion „Stimmen“ geschafft', test: (s) => !!s.done['l1-tuning'] },
  { id: 'first-groove',icon: '🥁', title: 'Erster Groove',    desc: 'Deinen ersten Groove gespielt', test: (s) => !!s.done['l1-groove'] },
  { id: 'rhythm',      icon: '🎯', title: 'Im Takt',          desc: 'Rhythmus-Trainer mit sehr gutem Timing', test: (s) => s.stats.rhythmPerfect >= 1 },
  { id: 'bpm80',       icon: '⚡', title: '80 BPM',           desc: 'Ein Riff sauber mit 80 BPM', test: (s) => maxRecord(s) >= 80 },
  { id: 'bpm100',      icon: '🔥', title: '100 BPM geknackt', desc: 'Ein Riff sauber mit 100 BPM', test: (s) => maxRecord(s) >= 100 },
  { id: 'streak3',     icon: '📅', title: '3-Tage-Streak',    desc: '3 Tage in Folge geübt', test: (s) => s.streak.best >= 3 },
  { id: 'streak7',     icon: '🏅', title: '7-Tage-Streak',    desc: '7 Tage in Folge geübt', test: (s) => s.streak.best >= 7 },
  { id: 'xp500',       icon: '⭐', title: '500 XP',           desc: '500 Erfahrungspunkte gesammelt', test: (s) => s.xp >= 500 },
  { id: 'level1',      icon: '🎸', title: 'Level 1 geschafft',desc: 'Alle Lektionen von Level 1 abgeschlossen', test: (s) => doneCount(s, 'l1-') >= LEVEL1_LESSONS },
  { id: 'level2',      icon: '🎸', title: 'Level 2 geschafft',desc: 'Alle Lektionen von Level 2 abgeschlossen', test: (s) => doneCount(s, 'l2-') >= LEVEL2_LESSONS },
  { id: 'level3',      icon: '🏆', title: 'Level 3 geschafft',desc: 'Alle Lektionen von Level 3 abgeschlossen', test: (s) => doneCount(s, 'l3-') >= LEVEL3_LESSONS },
  { id: 'ear',         icon: '👂', title: 'Gutes Gehör',      desc: 'Eine Gehörbildung mit mind. 60 % bestanden', test: (s) => s.stats.earPassed >= 1 },
  { id: 'mic',         icon: '🎤', title: 'Erkannt!',         desc: 'Ein Riff per Mikrofon bestätigt bekommen', test: (s) => s.stats.micPassed >= 1 },
  { id: 'jam',         icon: '🎶', title: 'Jam-Session',      desc: 'Zu einem Jam-Track mitgespielt', test: (s) => s.stats.jamsDone >= 1 },
];
