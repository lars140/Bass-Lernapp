// Wendet Einstellungen auf die Seite an (Theme, Lautstärke).
import { getSettings } from '../state/store.js';
import { setVolume } from '../audio/engine.js';

export function applySettings() {
  const s = getSettings();
  document.documentElement.dataset.theme = s.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = s.theme === 'light' ? '#f6f8fa' : '#0f1318';
  setVolume(s.volume);
}
