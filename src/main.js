import './styles/app.css';
import { h } from './ui/dom.js';
import { load, getState } from './state/store.js';
import { on } from './state/events.js';
import { currentStreak, levelInfo, startTimer, trackActivity } from './state/gamify.js';
import { initRouter, currentPath } from './ui/router.js';
import { applySettings } from './ui/settings.js';
import { toast } from './ui/toast.js';
import { confetti } from './ui/confetti.js';
import { unlock } from './audio/engine.js';
import { chime } from './audio/synth.js';
import { homeView } from './ui/views/home.js';
import { courseView } from './ui/views/course.js';
import { lessonView } from './ui/views/lesson.js';
import { toolsView } from './ui/views/tools.js';
import { profileView } from './ui/views/profile.js';
import { privacyView, imprintView } from './ui/views/legal.js';
import { loginView, registerView, resetView } from './ui/views/auth.js';
import { boot, requestSync } from './sync/sync.js';

load();
applySettings();
startTimer();

// ---------- Shell ----------
const NAV = [['/', 'Start', '🏠'], ['/course', 'Kurs', '📚'], ['/tools', 'Werkzeuge', '🎚️'], ['/profile', 'Profil', '👤']];
const status = h('div', { class: 'status', 'aria-live': 'off' });
const syncNote = h('span', { class: 'sync-note small muted', role: 'status' });
const accountLink = h('a', { class: 'acct', href: '#/login' }, 'Anmelden');
const nav = h('nav', { class: 'nav', 'aria-label': 'Hauptnavigation' }, NAV.map(([path, label, icon]) =>
  h('a', { href: '#' + path, 'data-path': path }, h('span', { class: 'ni', 'aria-hidden': 'true' }, icon), h('span', null, label))));
const main = h('main', { id: 'main', tabindex: '-1' });
document.getElementById('app').append(
  h('header', { class: 'top' }, h('a', { class: 'logo', href: '#/' }, '🎸 Bass lernen'), status, syncNote, accountLink),
  main, nav);

function updateStatus() {
  const s = getState();
  const lv = levelInfo(s.xp);
  status.replaceChildren(h('span', { title: 'Streak' }, `🔥 ${currentStreak(s)}`), h('span', { title: 'Erfahrungspunkte' }, `Lv ${lv.level} · ${s.xp} XP`));
}
function updateNav() {
  const p = currentPath();
  nav.querySelectorAll('a').forEach((a) => {
    const path = a.dataset.path;
    const active = path === '/' ? p === '/' : p.startsWith(path);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
on('state', updateStatus);
document.addEventListener('routechange', () => { updateNav(); main.focus({ preventScroll: true }); });
updateStatus();

// ---------- Belohnungen ----------
const sounds = () => getState().settings.sounds;
on('xp', ({ amount }) => toast(`+${amount} XP`, { ms: 1500 }));
on('levelup', ({ level }) => { toast(`Level ${level} erreicht!`, { icon: '⬆️', big: true }); confetti(); if (sounds()) unlock().then(() => chime('big')); });
on('badge', (b) => { toast(`Abzeichen: ${b.title}`, { icon: b.icon, big: true }); if (sounds()) unlock().then(() => chime('ok')); });
on('goal', () => { toast('Tagesziel erreicht! 🎯', { big: true }); confetti(40); });
document.addEventListener('celebrate', () => { confetti(); if (sounds()) unlock().then(() => chime('big')); });

for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, trackActivity, { passive: true });

// ---------- Sync ----------
// Beim Verlassen einer Lektion und nach Abschluss wird gebündelt gesendet (nur bei Änderungen).
let wasLesson = false;
document.addEventListener('routechange', (e) => {
  const inLesson = e.detail.startsWith('/lesson/');
  if (wasLesson && !inLesson) requestSync();
  wasLesson = inLesson;
});
document.addEventListener('celebrate', requestSync);
on('sync', ({ status, user }) => {
  syncNote.textContent = user && status === 'pending' ? 'Wird später synchronisiert' : '';
  accountLink.textContent = user ? `👤 ${user.username}` : 'Anmelden';
  accountLink.setAttribute('href', user ? '#/profile' : '#/login');
});
boot();

// ---------- Routen ----------
initRouter(main, [
  ['/login', loginView],
  ['/register', registerView],
  ['/reset', resetView],
  ['/', homeView],
  ['/course', courseView],
  ['/lesson/([\\w-]+)', lessonView],
  ['/tools(?:/(\\w+))?', toolsView],
  ['/profile', profileView],
  ['/privacy', privacyView],
  ['/imprint', imprintView],
]);

// ---------- Offline (PWA) ----------
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
