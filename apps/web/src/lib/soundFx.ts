/**
 * Game sound effects synthesized via Web Audio API.
 * No external audio files needed — fully open-source.
 */
export class GameSoundFX {
  private ctx: AudioContext | null = null;
  private _muted = false;

  get muted() { return this._muted; }
  set muted(v: boolean) { this._muted = v; }

  /** Must be called after a user gesture (click) to unlock audio. */
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /* ---- primitives ---- */
  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.07, delay = 0) {
    if (this._muted || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur);
  }

  private noise(dur: number, freq: number, vol = 0.04) {
    if (this._muted || !this.ctx) return;
    const c = this.ctx, n = c.sampleRate * dur;
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 2;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(c.destination); s.start();
  }

  /* ---- game sounds ---- */
  diceRoll()    { this.noise(0.4, 3000, 0.05); }
  tokenHop()    { this.tone(500, 0.07, 'sine', 0.03); this.tone(700, 0.06, 'sine', 0.025, 0.04); }
  buyProperty() { this.tone(523, 0.12, 'sine', 0.06); this.tone(659, 0.12, 'sine', 0.06, 0.1); this.tone(784, 0.15, 'sine', 0.06, 0.2); }
  payRent()     { this.tone(600, 0.1, 'triangle', 0.04); this.tone(500, 0.1, 'triangle', 0.035, 0.08); this.tone(400, 0.12, 'triangle', 0.03, 0.16); }
  passGo()      { this.tone(523, 0.1, 'sine', 0.06); this.tone(659, 0.1, 'sine', 0.06, 0.08); this.tone(784, 0.1, 'sine', 0.06, 0.16); this.tone(1047, 0.18, 'sine', 0.06, 0.24); }
  goToJail()    { this.tone(200, 0.15, 'sawtooth', 0.035); this.tone(150, 0.15, 'sawtooth', 0.035, 0.12); this.tone(100, 0.2, 'sawtooth', 0.03, 0.24); }
  bankrupt()    { this.tone(400, 0.2, 'sawtooth', 0.035); this.tone(350, 0.2, 'sawtooth', 0.035, 0.15); this.tone(300, 0.2, 'sawtooth', 0.035, 0.3); this.tone(200, 0.35, 'sawtooth', 0.03, 0.45); }
  cardDraw()    { this.noise(0.2, 5000, 0.025); this.tone(800, 0.08, 'sine', 0.04, 0.1); }
  doubles()     { this.tone(800, 0.07, 'sine', 0.05); this.tone(1200, 0.07, 'sine', 0.05, 0.06); this.tone(1600, 0.09, 'sine', 0.05, 0.12); }
}

export const sfx = new GameSoundFX();
