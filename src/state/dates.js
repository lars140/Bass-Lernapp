// Datums-Helfer. Alles in der LOKALEN Zeitzone des Benutzers (für die Streak).

const p2 = (n) => String(n).padStart(2, '0');

export function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

function toUtcDay(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** Ganze Tage zwischen zwei YYYY-MM-DD Strings (b - a). */
export function daysBetween(a, b) { return Math.round(toUtcDay(b) - toUtcDay(a)); }

/** ISO-Wochenschlüssel, z. B. 2026-W07 (für den wöchentlichen Streak-Freeze). */
export function weekKey(str) {
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${p2(week)}`;
}

export function lastDays(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
    out.push(dateStr(x));
  }
  return out;
}
