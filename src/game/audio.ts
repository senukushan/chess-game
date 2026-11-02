import { loadMuted, saveMuted } from "./storage";

type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = loadMuted();

  /** must be called from a user gesture at least once */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    saveMuted(m);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  private tone(freq: number, dur: number, type: Wave = "sine", vol = 0.25, slideTo?: number, delay = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.3, freq = 1200, type: BiquadFilterType = "lowpass", sweepTo?: number, delay = 0) {
    if (!this.ctx || !this.master || this.muted || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  select() {
    this.tone(620, 0.07, "triangle", 0.18, 940);
  }
  deselect() {
    this.tone(480, 0.07, "triangle", 0.12, 320);
  }
  error() {
    this.tone(130, 0.14, "sawtooth", 0.14, 90);
  }
  move(power = 1) {
    this.noise(0.07, 0.35 * power, 900, "lowpass", 300);
    this.tone(170, 0.1, "triangle", 0.3 * power, 80);
  }
  capture(value: number) {
    const v = Math.min(1.4, 0.6 + value * 0.09);
    this.noise(0.18 + value * 0.015, 0.5 * v, 5000, "highpass", 900);
    this.noise(0.22, 0.4 * v, 700, "lowpass", 120);
    this.tone(240, 0.22, "sawtooth", 0.2 * v, 55);
    this.tone(120, 0.2, "square", 0.12 * v, 40);
  }
  castle() {
    this.move(0.9);
    setTimeout(() => this.move(0.8), 110);
  }
  combo(n: number) {
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    const f = 440 * Math.pow(2, steps[Math.min(n, steps.length - 1)] / 12);
    this.tone(f, 0.12, "square", 0.1, undefined, 0.04);
    this.tone(f * 2, 0.18, "triangle", 0.12, undefined, 0.08);
  }
  check() {
    this.tone(880, 0.1, "square", 0.14);
    this.tone(660, 0.14, "square", 0.14, undefined, 0.11);
    this.tone(880, 0.1, "square", 0.12, undefined, 0.24);
  }
  promote() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, "triangle", 0.18, undefined, i * 0.06));
  }
  mate() {
    this.noise(1.1, 0.7, 2400, "lowpass", 60);
    this.tone(220, 0.9, "sawtooth", 0.25, 40);
    this.tone(110, 1.1, "square", 0.18, 30);
  }
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
      this.tone(f, 0.22, "triangle", 0.2, undefined, 0.5 + i * 0.1);
      this.tone(f / 2, 0.22, "square", 0.06, undefined, 0.5 + i * 0.1);
    });
  }
  lose() {
    [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.4, "sawtooth", 0.12, f * 0.97, 0.4 + i * 0.22));
  }
  draw() {
    this.tone(440, 0.3, "triangle", 0.15, undefined, 0.3);
    this.tone(415, 0.4, "triangle", 0.15, undefined, 0.55);
  }
  hint() {
    [1175, 1568, 1976].forEach((f, i) => this.tone(f, 0.12, "sine", 0.12, undefined, i * 0.05));
  }
  tick() {
    this.tone(1400, 0.03, "square", 0.08);
  }
  thump() {
    this.noise(0.08, 0.18, 500, "lowpass", 150);
    this.tone(120, 0.1, "sine", 0.18, 60);
  }
  click() {
    this.tone(760, 0.05, "triangle", 0.12, 1000);
  }
  start() {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.14, "triangle", 0.16, undefined, i * 0.07));
  }
}

export const sfx = new Sfx();
