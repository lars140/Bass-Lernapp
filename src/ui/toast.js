import { h } from './dom.js';

let box;
function ensure() {
  if (!box) {
    box = h('div', { class: 'toasts', 'aria-live': 'polite', role: 'status' });
    document.body.append(box);
  }
  return box;
}

export function toast(text, { icon = '', big = false, ms = 3200 } = {}) {
  const el = h('div', { class: 'toast' + (big ? ' big' : '') }, icon && h('span', { class: 'ti', 'aria-hidden': 'true' }, icon), h('span', null, text));
  ensure().append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}
