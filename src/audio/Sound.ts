import type { SoundKind } from '../world/blocks';

/** Efectos de sonido sintetizados con Web Audio (sin archivos de audio). */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.6;

  /** Debe llamarse desde un gesto del usuario para que el navegador permita el audio. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private noiseBurst(duration: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || this.volume <= 0) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, duration + 0.05);
  }

  private tone(freq: number, endFreq: number, duration: number, gain: number, type: OscillatorType = 'square', delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.volume <= 0) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private material(kind: SoundKind): { freq: number; q: number } {
    switch (kind) {
      case 'stone': return { freq: 900, q: 1.2 };
      case 'wood': return { freq: 420, q: 2.5 };
      case 'sand': return { freq: 2600, q: 0.7 };
      case 'snow': return { freq: 3200, q: 0.6 };
      case 'leaves': return { freq: 4200, q: 0.5 };
      default: return { freq: 1500, q: 0.8 };
    }
  }

  dig(kind: SoundKind): void {
    const m = this.material(kind);
    this.noiseBurst(0.08, m.freq, m.q, 0.25);
  }

  breakBlock(kind: SoundKind): void {
    const m = this.material(kind);
    this.noiseBurst(0.22, m.freq, m.q, 0.5);
    this.noiseBurst(0.12, m.freq * 0.6, m.q, 0.3, 'bandpass', 0.04);
  }

  place(kind: SoundKind): void {
    const m = this.material(kind);
    this.noiseBurst(0.1, m.freq * 0.7, m.q, 0.45, 'lowpass');
  }

  step(kind: SoundKind): void {
    const m = this.material(kind);
    this.noiseBurst(0.07, m.freq * 0.8, m.q, 0.12, 'lowpass');
  }

  hurt(): void {
    this.tone(220, 110, 0.18, 0.25, 'square');
  }

  hit(): void {
    this.noiseBurst(0.1, 600, 1, 0.4, 'lowpass');
    this.tone(160, 90, 0.08, 0.2, 'triangle');
  }

  mobGrowl(): void {
    this.tone(90, 60, 0.5, 0.12, 'sawtooth');
  }

  eat(): void {
    for (let i = 0; i < 3; i++) this.noiseBurst(0.06, 1800, 1.5, 0.3, 'bandpass', i * 0.11);
  }

  pickup(): void {
    this.tone(660, 990, 0.07, 0.1, 'triangle');
  }

  splash(): void {
    this.noiseBurst(0.4, 1200, 0.4, 0.4, 'lowpass');
  }

  click(): void {
    this.tone(880, 700, 0.04, 0.08, 'square');
  }

  craft(): void {
    this.tone(523, 523, 0.07, 0.1, 'triangle');
    this.tone(784, 784, 0.1, 0.1, 'triangle', 0.07);
  }

  levelUp(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.12, 0.1, 'triangle', i * 0.08));
  }

  toolBreak(): void {
    this.noiseBurst(0.25, 3000, 2, 0.35);
    this.tone(400, 120, 0.2, 0.15, 'square');
  }
}
