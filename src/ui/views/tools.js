import { h } from '../dom.js';
import { createTuner } from '../../exercises/tuner.js';
import { createMetronome } from '../../exercises/metronome.js';
import { createDrumMachine } from '../../exercises/drumMachine.js';
import { createJamTrack } from '../../exercises/jamTrack.js';
import { createEarTool } from '../../exercises/earTraining.js';
import { startPractice } from '../../state/gamify.js';

const TOOLS = [
  ['tuner', '🎚️ Stimmgerät', createTuner],
  ['metronome', '⏱️ Metronom', createMetronome],
  ['drums', '🥁 Drum-Machine', createDrumMachine],
  ['jam', '🎶 Jam-Tracks', () => createJamTrack()],
  ['ear', '👂 Gehörbildung', createEarTool],
];

export function toolsView(root, [id]) {
  const active = TOOLS.find((t) => t[0] === id) || TOOLS[0];
  const tool = active[2]();
  const stop = startPractice();
  root.append(h('section', { class: 'view' },
    h('h1', null, 'Werkzeuge'),
    h('div', { class: 'tabs', role: 'tablist' }, TOOLS.map(([tid, label]) =>
      h('a', { class: 'tab-btn', role: 'tab', 'aria-selected': String(tid === active[0]), href: `#/tools/${tid}` }, label))),
    h('div', { class: 'card' }, tool.el)));
  return () => { tool.destroy(); stop(); };
}
