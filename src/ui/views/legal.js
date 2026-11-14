import { h } from '../dom.js';

// Platzhalter-Seiten: bitte selbst ausfüllen (siehe README).
export const privacyView = (root) => root.append(h('section', { class: 'view prose' },
  h('h1', null, 'Datenschutzerklärung'),
  h('p', { class: 'muted' }, 'PLATZHALTER – bitte durch deine eigene Datenschutzerklärung ersetzen.'),
  h('p', null, 'Hinweise für die Erklärung: Verantwortlicher, Hosting bei Cloudflare, im Gast-Modus nur lokale Speicherung im Browser (localStorage), Mikrofon nur lokal und nur mit Zustimmung, keine Tracker, mit Konto: Benutzername, E-Mail, gehashtes Passwort, Fortschritt und ein notwendiges Sitzungs-Cookie (HttpOnly) in Cloudflare D1, ohne Konto keine Cookies, Rechte der Betroffenen (Auskunft, Löschung, Export).'),
  h('a', { class: 'btn ghost', href: '#/profile' }, 'Zurück')));

export const imprintView = (root) => root.append(h('section', { class: 'view prose' },
  h('h1', null, 'Impressum'),
  h('p', { class: 'muted' }, 'PLATZHALTER – bitte Angaben nach § 5 DDG ergänzen (Name, Anschrift, Kontakt).'),
  h('a', { class: 'btn ghost', href: '#/profile' }, 'Zurück')));
