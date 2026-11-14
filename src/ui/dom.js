// Kleine DOM-Helfer. Text wird immer als Textknoten eingefügt (kein innerHTML -> kein XSS).
const SVGNS = 'http://www.w3.org/2000/svg';

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

function make(svg, tag, attrs, kids) {
  const el = svg ? document.createElementNS(SVGNS, tag) : document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}

export const h = (tag, attrs, ...kids) => make(false, tag, attrs, kids);
export const s = (tag, attrs, ...kids) => make(true, tag, attrs, kids);

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** Mini-Markup: **fett** und `code`. Gibt ein DocumentFragment zurück. */
export function md(text) {
  const frag = document.createDocumentFragment();
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    frag.append(m[1] ? h('strong', null, m[1]) : h('code', null, m[2]));
    last = re.lastIndex;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

/** Mehrere Absätze (Array von Strings oder ein String). */
export function paragraphs(body) {
  const arr = Array.isArray(body) ? body : [body];
  return arr.map((t) => h('p', null, md(t)));
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  return m < 1 ? `${Math.round(sec)} s` : `${m} Min.`;
}

/** Bestätigungsdialog (statt window.confirm). */
export function confirmDialog(text, okLabel = 'Ja') {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog', 'aria-label': 'Bestätigung' },
      h('p', null, text),
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', onClick: () => dlg.close('no') }, 'Abbrechen'),
        h('button', { class: 'btn danger', onClick: () => dlg.close('yes') }, okLabel)));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(dlg.returnValue === 'yes'); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
