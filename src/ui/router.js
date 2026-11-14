// Minimaler Hash-Router (#/pfad). Alle Pfade bleiben statisch (index.html), keine Function-Aufrufe.
let routes = [];
let cleanup = null;
let token = 0;
let container = null;

export function initRouter(el, table) {
  container = el;
  routes = table.map(([pattern, view]) => [new RegExp('^' + pattern + '$'), view]);
  window.addEventListener('hashchange', render);
  render();
}

export function currentPath() { return location.hash.replace(/^#/, '') || '/'; }
export function go(path) { location.hash = '#' + path; }

async function render() {
  const my = ++token;
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  const path = currentPath();
  container.replaceChildren();
  window.scrollTo(0, 0);
  for (const [re, view] of routes) {
    const m = re.exec(path);
    if (m) {
      const c = await view(container, m.slice(1));
      if (my !== token) { if (typeof c === 'function') c(); return; }
      cleanup = c;
      document.dispatchEvent(new CustomEvent('routechange', { detail: path }));
      return;
    }
  }
  location.hash = '#/';
}
