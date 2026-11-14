// Präziser Scheduler (Lookahead): plant Ereignisse auf der Audio-Uhr voraus.
// Auflösung: 12 Ticks pro Viertelnote (teilbar durch 1, 2, 3, 4 -> Achtel, Triolen, Sechzehntel).
import { getCtx } from './engine.js';

export const TPB = 12;

export class Sequencer {
  /**
   * @param {object} o
   * @param {() => number} o.bpm        liefert aktuelles Tempo (live änderbar)
   * @param {(tick:number, time:number) => void} o.onTick  Audio-Planung (tick < 0 = Vorzähler)
   * @param {(tick:number, wrapped:boolean) => void} [o.onVisual] Anzeige, zeitlich passend zum Ton
   * @param {() => void} [o.onEnd]
   * @param {number} [o.totalTicks]
   * @param {{from:number,to:number}|null} [o.loop]
   */
  constructor(o) {
    Object.assign(this, { totalTicks: Infinity, loop: null, onVisual: null, onEnd: null }, o);
    this.queue = [];
    this.timer = null;
    this.raf = 0;
    this.running = false;
    this.finished = false;
    this.tick = 0;
    this.startAt = 0;
    this.wrapNext = false;
  }

  start(fromTick = 0, countInTicks = 0) {
    const c = getCtx();
    this.running = true;
    this.finished = false;
    this.queue = [];
    if (countInTicks > 0) { this.tick = -countInTicks; this.startAt = fromTick; }
    else { this.tick = fromTick; this.startAt = 0; }
    this.nextTime = c.currentTime + 0.06;
    this.timer = setInterval(() => this._pump(), 25);
    this._pump();
    const draw = () => {
      if (!this.running) return;
      const now = getCtx().currentTime;
      while (this.queue.length && this.queue[0].time <= now) {
        const e = this.queue.shift();
        if (e.end) { this.stop(); this.onEnd && this.onEnd(); return; }
        this.onVisual && this.onVisual(e.tick, e.wrapped);
      }
      this.raf = requestAnimationFrame(draw);
    };
    this.raf = requestAnimationFrame(draw);
  }

  _pump() {
    const c = getCtx();
    while (this.running && !this.finished && this.nextTime < c.currentTime + 0.12) {
      const t = this.tick;
      this.onTick(t, this.nextTime);
      this.queue.push({ tick: t, time: this.nextTime, wrapped: this.wrapNext });
      this.wrapNext = false;
      this.nextTime += 60 / this.bpm() / TPB;
      this.tick++;
      if (this.tick === 0 && this.startAt) { this.tick = this.startAt; this.startAt = 0; }
      if (this.loop && this.tick >= this.loop.to) { this.tick = this.loop.from; this.wrapNext = true; }
      else if (!this.loop && this.tick >= this.totalTicks) {
        this.finished = true;
        this.queue.push({ end: true, time: this.nextTime });
      }
    }
  }

  setLoop(loop) {
    this.loop = loop;
    if (loop && this.tick >= 0 && (this.tick < loop.from || this.tick >= loop.to)) this.tick = loop.from;
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.queue = [];
  }
}
