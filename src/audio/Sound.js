/**
 * Sound —— 纯 WebAudio 合成音效，零外部资源。
 * 必须在用户手势（点击开始）后 init()，否则浏览器会挂起 AudioContext。
 */
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.enabled = true;
    this.engine = null;
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);

    // 预生成白噪声
    const len = this.ctx.sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this._startEngine();
  }

  _now() { return this.ctx.currentTime; }

  _noise(dur, { type = 'lowpass', freq = 1200, q = 0.7, gain = 1, sweepTo = null } = {}) {
    const t = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    filt.Q.value = q;
    if (sweepTo != null) filt.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, { type = 'sine', gain = 0.5, to = null } = {}) {
    const t = this._now();
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  cannon() {
    if (!this.ctx) return;
    this._tone(140, 0.32, { type: 'sine', gain: 0.7, to: 46 });
    this._noise(0.28, { freq: 2200, sweepTo: 300, gain: 0.8, q: 0.6 });
  }

  enemyCannon() {
    if (!this.ctx) return;
    this._tone(110, 0.28, { type: 'sine', gain: 0.35, to: 40 });
    this._noise(0.24, { freq: 1600, sweepTo: 240, gain: 0.4 });
  }

  explosion(scale = 1) {
    if (!this.ctx) return;
    this._tone(90, 0.6 * scale, { type: 'sine', gain: 0.8, to: 28 });
    this._noise(0.7 * scale, { freq: 1400, sweepTo: 120, gain: 0.9, q: 0.4 });
    this._noise(0.35, { freq: 5000, sweepTo: 800, gain: 0.4, type: 'bandpass', q: 1 });
  }

  hit() {
    if (!this.ctx) return;
    this._tone(620, 0.12, { type: 'square', gain: 0.18, to: 320 });
    this._noise(0.08, { freq: 4000, gain: 0.25, type: 'highpass' });
  }

  pickHurt() {
    if (!this.ctx) return;
    this._tone(180, 0.25, { type: 'sawtooth', gain: 0.3, to: 70 });
  }

  _startEngine() {
    // 低频引擎轰鸣，由车速调制
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 42;
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 26;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 220;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    osc.connect(filt); sub.connect(filt);
    filt.connect(g).connect(this.master);
    osc.start(); sub.start();
    this.engine = { osc, sub, filt, g };
  }

  /** speed01: 0..1 当前车速比例 */
  setEngine(speed01) {
    if (!this.engine) return;
    const t = this._now();
    const e = this.engine;
    e.g.gain.setTargetAtTime(0.04 + speed01 * 0.10, t, 0.1);
    e.osc.frequency.setTargetAtTime(40 + speed01 * 70, t, 0.1);
    e.sub.frequency.setTargetAtTime(24 + speed01 * 30, t, 0.1);
    e.filt.frequency.setTargetAtTime(200 + speed01 * 500, t, 0.1);
  }

  silenceEngine() {
    if (this.engine) this.engine.g.gain.setTargetAtTime(0, this._now(), 0.1);
  }
}
