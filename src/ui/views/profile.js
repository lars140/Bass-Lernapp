import { h, confirmDialog, fmtTime } from '../dom.js';
import { getState, commit, exportJson, importJson, resetAll } from '../../state/store.js';
import { levelInfo, currentStreak, buyFreeze, FREEZE_COST } from '../../state/gamify.js';
import { BADGES } from '../../state/badges.js';
import { lastDays } from '../../state/dates.js';
import { applySettings } from '../settings.js';
import { toast } from '../toast.js';
import { on } from '../../state/events.js';
import { api } from '../../sync/api.js';
import { getUser, getSyncStatus, logout, push, accountDeleted } from '../../sync/sync.js';

export function profileView(root) {
  const render = () => { root.replaceChildren(); build(); };
  const s = () => getState();

  function build() {
    const st = s();
    const lv = levelInfo(st.xp);
    const total = Object.values(st.days).reduce((a, b) => a + b, 0);
    const days = lastDays(7);
    const max = Math.max(60, ...days.map((d) => st.days[d] || 0));
    const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

    const chart = h('div', { class: 'week', role: 'img', 'aria-label': 'Übungszeit der letzten 7 Tage' }, days.map((d) => {
      const sec = st.days[d] || 0;
      const date = new Date(d + 'T00:00:00');
      return h('div', { class: 'wd' }, h('div', { class: 'wbar' }, h('div', { class: 'wfill', style: `height:${Math.round((sec / max) * 100)}%`, title: fmtTime(sec) })), h('span', { class: 'small muted' }, WD[date.getDay()]));
    }));

    const goalBtns = [5, 10, 20].map((m) => h('button', { class: 'chip', 'aria-pressed': String(st.settings.goal === m), onClick: () => { commit((x) => { x.settings.goal = m; }); render(); } }, `${m} Min.`));
    const themeBtns = [['dark', 'Dunkel'], ['light', 'Hell']].map(([v, l]) => h('button', { class: 'chip', 'aria-pressed': String(st.settings.theme === v), onClick: () => { commit((x) => { x.settings.theme = v; }); applySettings(); render(); } }, l));

    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st.settings.volume, 'aria-label': 'Lautstärke' });
    vol.addEventListener('input', () => { commit((x) => { x.settings.volume = Number(vol.value); }); applySettings(); });
    const lat = h('input', { type: 'number', min: -150, max: 300, step: 5, value: st.settings.latencyMs, 'aria-label': 'Latenz-Ausgleich in Millisekunden', class: 'num' });
    lat.addEventListener('change', () => commit((x) => { x.settings.latencyMs = Math.max(-150, Math.min(300, Number(lat.value) || 0)); }));
    const lefty = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.settings.lefty, onChange: (e) => commit((x) => { x.settings.lefty = e.target.checked; }) }), ' Linkshänder-Griffbrett');
    const sounds = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.settings.sounds, onChange: (e) => commit((x) => { x.settings.sounds = e.target.checked; }) }), ' Belohnungs-Sounds');

    const file = h('input', { type: 'file', accept: 'application/json', hidden: true });
    file.addEventListener('change', async () => {
      try { importJson(await file.files[0].text()); applySettings(); toast('Fortschritt importiert.'); render(); } catch { toast('Datei konnte nicht gelesen werden.'); }
    });

    root.append(h('section', { class: 'view' },
      h('h1', null, 'Profil'),
      h('div', { class: 'grid3' },
        stat(`Level ${lv.level}`, `${st.xp} XP`), stat(`🔥 ${currentStreak(st)}`, `Streak (Rekord ${st.streak.best})`), stat(fmtTime(total), 'Übungszeit gesamt')),
      accountCard(render),
      h('div', { class: 'card' }, h('h3', null, 'Diese Woche'), chart),
      h('div', { class: 'card' }, h('h3', null, 'Streak-Freeze'),
        h('p', { class: 'muted' }, `Ein Freeze rettet deine Streak, wenn du einen Tag auslässt. Pro Woche gibt es einen kostenlos. Du hast ${st.streak.freezes}.`),
        h('button', { class: 'btn ghost', disabled: st.xp < FREEZE_COST || st.streak.freezes >= 2, onClick: () => { if (buyFreeze()) { toast('Streak-Freeze gekauft.'); render(); } } }, `Freeze für ${FREEZE_COST} XP`)),
      h('div', { class: 'card' }, h('h3', null, 'Abzeichen'),
        h('div', { class: 'badges' }, BADGES.map((b) => h('div', { class: 'badge' + (st.badges[b.id] ? ' got' : ''), title: b.desc },
          h('span', { class: 'bicon', 'aria-hidden': 'true' }, b.icon), h('strong', null, b.title), h('span', { class: 'small muted' }, st.badges[b.id] ? b.desc : 'Noch gesperrt'))))),
      h('div', { class: 'card' }, h('h3', null, 'Einstellungen'),
        row('Tagesziel', h('div', { class: 'row' }, goalBtns)),
        row('Design', h('div', { class: 'row' }, themeBtns)),
        row('Lautstärke', vol),
        row('Latenz-Ausgleich (ms)', lat),
        h('p', { class: 'muted small' }, 'Für den Rhythmus-Trainer: Bluetooth-Kopfhörer haben oft Verzögerung. Erhöhe den Wert, wenn du immer „zu spät“ bewertet wirst.'),
        h('div', { class: 'col' }, lefty, sounds)),
      h('div', { class: 'card' }, h('h3', null, 'Daten'),
        h('p', { class: 'muted' }, 'Dein Fortschritt liegt in diesem Browser (Gast-Modus).'),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn ghost', onClick: doExport }, 'Exportieren (JSON)'),
          h('button', { class: 'btn ghost', onClick: () => file.click() }, 'Importieren'),
          h('button', { class: 'btn danger', onClick: doReset }, 'Fortschritt zurücksetzen')), file),
      h('p', { class: 'small muted' }, h('a', { href: '#/privacy' }, 'Datenschutz'), ' · ', h('a', { href: '#/imprint' }, 'Impressum'))));
  }

  function doExport() {
    const url = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
    const a = h('a', { href: url, download: 'bass-fortschritt.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function doReset() {
    if (await confirmDialog('Wirklich den gesamten Fortschritt löschen? Das kann nicht rückgängig gemacht werden.', 'Zurücksetzen')) { resetAll(); toast('Fortschritt zurückgesetzt.'); render(); }
  }

  build();
  return () => { if (offSync) { offSync(); offSync = null; } };
}

let offSync = null;
const STATUS_TEXT = { synced: 'Synchronisiert', syncing: 'Synchronisiere …', pending: 'Wird später synchronisiert', guest: '' };

function accountCard(rerender) {
  const user = getUser();
  if (!user) {
    return h('div', { class: 'card' }, h('h3', null, 'Konto'),
      h('p', { class: 'muted' }, 'Du nutzt die App als Gast: Der Fortschritt liegt nur auf diesem Gerät. Mit einem Konto lernst du auf allen Geräten dort weiter, wo du aufgehört hast. Dein bisheriger Fortschritt wird übernommen.'),
      h('div', { class: 'row wrap' }, h('a', { class: 'btn primary', href: '#/register' }, 'Konto erstellen'), h('a', { class: 'btn ghost', href: '#/login' }, 'Anmelden')));
  }
  const info = h('p', { class: 'muted small', 'aria-live': 'polite' }, STATUS_TEXT[getSyncStatus()]);
  if (offSync) offSync();
  offSync = on('sync', ({ status }) => { info.textContent = STATUS_TEXT[status] || ''; });

  async function doLogout() {
    const r = await logout();
    if (r.unsynced && !(await confirmDialog('Ein Teil deines Fortschritts konnte noch nicht gesendet werden und geht beim Abmelden verloren. Trotzdem abmelden?', 'Abmelden'))) return;
    await r.finish();
    toast('Abgemeldet.');
    rerender();
  }
  async function doExportServer() {
    const res = await fetch('/api/export', { credentials: 'same-origin' }).catch(() => null);
    if (!res || !res.ok) { toast('Export gerade nicht möglich.'); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = h('a', { href: url, download: 'bass-konto-export.json' });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function doDelete() {
    const pw = h('input', { type: 'password', class: 'input', autocomplete: 'current-password', 'aria-label': 'Passwort zur Bestätigung' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const dlg = h('dialog', { class: 'dialog', 'aria-label': 'Konto löschen' },
      h('h3', null, 'Konto löschen'),
      h('p', null, 'Konto und gespeicherter Fortschritt werden auf dem Server unwiderruflich gelöscht. Auf diesem Gerät kannst du als Gast weiterüben. Bitte Passwort bestätigen:'),
      pw, err,
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', onClick: () => dlg.close() }, 'Abbrechen'),
        h('button', { class: 'btn danger', onClick: async (e) => {
          e.target.disabled = true;
          const res = await api('DELETE', '/api/account', { password: pw.value });
          e.target.disabled = false;
          if (res.ok) { accountDeleted(); dlg.close(); toast('Konto gelöscht.'); rerender(); }
          else err.textContent = res.unavailable ? 'Server nicht erreichbar.' : (res.data && res.data.error.message) || 'Fehlgeschlagen.';
        } }, 'Endgültig löschen')));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  return h('div', { class: 'card' }, h('h3', null, 'Konto'),
    h('p', null, h('strong', null, user.username), h('br'), h('span', { class: 'muted' }, user.email)), info,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn ghost', onClick: () => push({ force: true }) }, 'Jetzt synchronisieren'),
      h('button', { class: 'btn ghost', onClick: doExportServer }, 'Kontodaten exportieren'),
      h('button', { class: 'btn ghost', onClick: doLogout }, 'Abmelden'),
      h('button', { class: 'btn danger', onClick: doDelete }, 'Konto löschen')));
}

const stat = (big, small) => h('div', { class: 'card center-text' }, h('div', { class: 'stat' }, big), h('div', { class: 'muted small' }, small));
const row = (label, ctrl) => h('div', { class: 'srow' }, h('span', null, label), ctrl);
