// Anmelden, Registrieren, Passwort zurücksetzen (mit Wiederherstellungscode).
import { h } from '../dom.js';
import { api } from '../../sync/api.js';
import { startSession, startSessionPull } from '../../sync/sync.js';
import { getState } from '../../state/store.js';
import { go } from '../router.js';

const SITEKEY = import.meta.env.VITE_TURNSTILE_SITEKEY || '';

function errorText(res) {
  if (res.unavailable) return 'Der Server ist gerade nicht erreichbar. Du kannst als Gast weiterüben und es später noch einmal versuchen.';
  return (res.data && res.data.error && res.data.error.message) || 'Das hat nicht geklappt. Bitte versuche es erneut.';
}

function field(label, attrs, hint) {
  const input = h('input', { class: 'input', required: true, ...attrs });
  return { input, el: h('label', { class: 'field' }, h('span', null, label), input, hint ? h('span', { class: 'muted small' }, hint) : null) };
}

function form(fields, submitLabel, onSubmit, extra) {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, submitLabel);
  const f = h('form', { class: 'form', novalidate: false }, fields.map((x) => x.el), extra, err, btn);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    try { await onSubmit((m) => { err.textContent = m; }); } finally { btn.disabled = false; }
  });
  return f;
}

export function loginView(root) {
  const id = field('Benutzername oder E-Mail', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' });
  const pw = field('Passwort', { type: 'password', autocomplete: 'current-password' });
  const f = form([id, pw], 'Anmelden', async (showError) => {
    const res = await api('POST', '/api/login', { identifier: id.input.value, password: pw.input.value });
    if (!res.ok) { showError(errorText(res)); return; }
    startSession(res.data.user, res.data.progress);
    go('/');
  });
  root.append(h('section', { class: 'view narrow' }, h('h1', null, 'Anmelden'),
    h('div', { class: 'card' }, f),
    h('p', { class: 'small' }, h('a', { href: '#/reset' }, 'Passwort vergessen?'), ' · ', h('a', { href: '#/register' }, 'Neues Konto erstellen')),
    h('p', { class: 'muted small' }, 'Du kannst die App auch ohne Konto nutzen. Dein Gast-Fortschritt wird beim Anmelden übernommen.')));
}

export function registerView(root) {
  const user = field('Benutzername', { autocomplete: 'username', autocapitalize: 'none', minlength: 3, maxlength: 24, pattern: '[A-Za-z0-9_.\\-]{3,24}' }, '3–24 Zeichen: Buchstaben, Zahlen, _ . -');
  const mail = field('E-Mail', { type: 'email', autocomplete: 'email' }, 'Wird nur für dein Konto genutzt, es werden keine Mails versendet.');
  const pw = field('Passwort', { type: 'password', autocomplete: 'new-password', minlength: 8, maxlength: 128 }, 'Mindestens 8 Zeichen.');
  const agree = h('label', { class: 'check' }, h('input', { type: 'checkbox', required: true }), h('span', null, 'Ich habe die ', h('a', { href: '#/privacy' }, 'Datenschutzerklärung'), ' gelesen.'));

  let turnstileToken = '';
  const widget = SITEKEY ? h('div', { class: 'cf-turnstile' }) : null;
  if (SITEKEY) loadTurnstile(widget, (t) => { turnstileToken = t; });

  const f = form([user, mail, pw], 'Konto erstellen', async (showError) => {
    const res = await api('POST', '/api/register', {
      username: user.input.value, email: mail.input.value, password: pw.input.value,
      progress: getState(), turnstile: turnstileToken,
    });
    if (!res.ok) { showError(errorText(res)); return; }
    // Gast-Fortschritt wurde mit dem Konto angelegt (Version 1)
    startSession(res.data.user, { version: 1, data: getState() });
    showRecovery(root, res.data.recoveryCode, 'Konto erstellt');
  }, [agree, widget]);

  root.append(h('section', { class: 'view narrow' }, h('h1', null, 'Konto erstellen'),
    h('div', { class: 'card' }, f),
    h('p', { class: 'small' }, 'Schon ein Konto? ', h('a', { href: '#/login' }, 'Anmelden'))));
}

export function resetView(root) {
  const id = field('Benutzername oder E-Mail', { autocomplete: 'username', autocapitalize: 'none' });
  const code = field('Wiederherstellungscode', { autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX-XXXX' }, 'Den Code hast du bei der Registrierung bekommen.');
  const pw = field('Neues Passwort', { type: 'password', autocomplete: 'new-password', minlength: 8, maxlength: 128 });
  const f = form([id, code, pw], 'Passwort zurücksetzen', async (showError) => {
    const res = await api('POST', '/api/reset-password', { identifier: id.input.value, recoveryCode: code.input.value, newPassword: pw.input.value });
    if (!res.ok) { showError(errorText(res)); return; }
    startSessionPull(res.data.user); // Fortschritt dieses Kontos vom Server holen und mit lokalem Stand zusammenführen
    showRecovery(root, res.data.recoveryCode, 'Passwort geändert');
  });
  root.append(h('section', { class: 'view narrow' }, h('h1', null, 'Passwort zurücksetzen'),
    h('p', { class: 'muted' }, 'Ohne E-Mail: Du brauchst deinen Wiederherstellungscode. Danach bekommst du einen neuen Code.'),
    h('div', { class: 'card' }, f), h('p', { class: 'small' }, h('a', { href: '#/login' }, 'Zurück zur Anmeldung'))));
}

/** Zeigt den (neuen) Wiederherstellungscode. Er wird nur gehasht gespeichert und kann nicht erneut angezeigt werden. */
function showRecovery(root, code, title) {
  root.replaceChildren();
  const ok = h('input', { type: 'checkbox' });
  const cont = h('button', { class: 'btn primary', disabled: true, onClick: () => go('/') }, 'Weiter');
  ok.addEventListener('change', () => { cont.disabled = !ok.checked; });
  const copy = h('button', { class: 'btn ghost', onClick: async () => { try { await navigator.clipboard.writeText(code); copy.textContent = 'Kopiert ✔'; } catch { copy.textContent = 'Bitte manuell abschreiben'; } } }, 'Kopieren');
  const dl = h('button', { class: 'btn ghost', onClick: () => {
    const url = URL.createObjectURL(new Blob([`Bass lernen – Wiederherstellungscode\n${code}\n`], { type: 'text/plain' }));
    const a = h('a', { href: url, download: 'bass-wiederherstellungscode.txt' });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } }, 'Als Datei speichern');
  root.append(h('section', { class: 'view narrow' }, h('h1', null, title + ' ✔'),
    h('div', { class: 'card' },
      h('h3', null, 'Dein Wiederherstellungscode'),
      h('p', { class: 'recovery', 'aria-label': 'Wiederherstellungscode' }, code),
      h('p', { class: 'muted' }, 'Damit kannst du dein Passwort zurücksetzen, falls du es vergisst. Er wird nur einmal angezeigt und bei uns nur verschlüsselt (gehasht) gespeichert. Bewahre ihn sicher auf, z. B. im Passwortmanager.'),
      h('div', { class: 'row wrap' }, copy, dl),
      h('label', { class: 'check' }, ok, h('span', null, 'Ich habe den Code sicher gespeichert.')),
      h('div', { class: 'row end' }, cont))));
}

function loadTurnstile(el, onToken) {
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.onload = () => window.turnstile && window.turnstile.render(el, { sitekey: SITEKEY, callback: onToken });
  document.head.append(s);
}
