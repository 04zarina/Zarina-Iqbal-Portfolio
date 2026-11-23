import { store } from '../core/store';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private musicVolume: number = 0.6;
  private sfxVolume: number = 0.8;
  private bgmOscillator: OscillatorNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmInterval: number | null = null;

  constructor() {
    this.isMuted = store.get().muted;
    this.musicVolume = store.get().musicVolume;
    this.sfxVolume = store.get().sfxVolume;
  }

  init(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.startProceduralLoFiBGM();
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    store.set('muted', muted);
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setValueAtTime(muted ? 0 : this.musicVolume * 0.15, this.ctx.currentTime);
    }
  }

  playPop(): void {
    if (this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(840, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(this.sfxVolume * 0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {}
  }

  playChime(): void {
    if (this.isMuted || !this.ctx) return;
    try {
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.09);

        gain.gain.setValueAtTime(this.sfxVolume * 0.2, this.ctx!.currentTime + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + idx * 0.09 + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(this.ctx!.currentTime + idx * 0.09);
        osc.stop(this.ctx!.currentTime + idx * 0.09 + 0.35);
      });
    } catch {}
  }

  playWhoosh(): void {
    if (this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(this.sfxVolume * 0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {}
  }

  /* ---------------------------------------------------------------------- */
  /* Synthesised sound effects (no audio files, so they cost nothing to load) */
  /* ---------------------------------------------------------------------- */

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; to?: number; attack?: number } = {}): void {
    if (this.isMuted || !this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + (opts.at ?? 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = opts.type ?? 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
      const v = this.sfxVolume * (opts.vol ?? 0.2);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(v, t0 + (opts.attack ?? 0.01));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {}
  }

  private noise(dur: number, opts: { vol?: number; at?: number; freq?: number; q?: number; type?: BiquadFilterType; sweepTo?: number } = {}): void {
    if (this.isMuted || !this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + (opts.at ?? 0);
      const len = Math.ceil(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = opts.type ?? 'bandpass';
      filter.frequency.setValueAtTime(opts.freq ?? 1200, t0);
      if (opts.sweepTo) filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + dur);
      filter.Q.value = opts.q ?? 1;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(this.sfxVolume * (opts.vol ?? 0.15), t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(t0);
    } catch {}
  }

  /** Soft footstep (called by the avatar on each step). */
  playStep(run = false): void {
    this.noise(0.07, { freq: run ? 520 : 380, q: 0.8, vol: run ? 0.06 : 0.04, type: 'lowpass' });
  }
  /** Cushion squish when she sits down. */
  playSit(): void {
    this.noise(0.25, { freq: 300, sweepTo: 120, type: 'lowpass', vol: 0.18 });
    this.tone(180, 0.18, { to: 110, vol: 0.08 });
  }
  /** Door creak + click. */
  playDoor(): void {
    this.tone(210, 0.35, { type: 'sawtooth', to: 260, vol: 0.025, attack: 0.05 });
    this.noise(0.05, { freq: 2400, q: 4, vol: 0.12, at: 0.32 });
  }
  /** Shimmering portal whoosh. */
  playPortal(): void {
    this.noise(0.9, { freq: 300, sweepTo: 3200, q: 2, vol: 0.12 });
    [880, 1175, 1568, 2093].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', vol: 0.06, at: 0.1 + i * 0.08 }));
  }
  /** Letter sent: paper swoosh, then a happy "ding-ding". */
  playMailSent(): void {
    this.noise(0.35, { freq: 900, sweepTo: 4000, q: 1.2, vol: 0.12 });
    this.tone(1318.5, 0.35, { type: 'triangle', vol: 0.18, at: 0.3 });
    this.tone(1760, 0.6, { type: 'triangle', vol: 0.18, at: 0.45 });
  }
  /** Picking something up. */
  playPickup(): void {
    this.tone(660, 0.12, { type: 'square', vol: 0.05 });
    this.tone(990, 0.18, { type: 'square', vol: 0.05, at: 0.08 });
  }
  /** Watering can pour. */
  playWater(): void {
    this.noise(1.1, { freq: 2600, q: 0.7, vol: 0.09, type: 'highpass' });
    for (let i = 0; i < 6; i++) this.tone(900 + Math.random() * 900, 0.06, { vol: 0.05, at: 0.1 + i * 0.15, to: 1800 });
  }
  /** "+ skill" sparkle. */
  playLevelUp(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.25, { type: 'square', vol: 0.05, at: i * 0.07 }));
  }
  /** Bug squashed in the mini game. */
  playSquash(combo = 1): void {
    this.noise(0.08, { freq: 1600, q: 3, vol: 0.14 });
    this.tone(400 + Math.min(combo, 10) * 60, 0.12, { type: 'square', vol: 0.06, to: 900 + combo * 60 });
  }
  playCoin(): void {
    this.tone(988, 0.08, { type: 'square', vol: 0.06 });
    this.tone(1319, 0.3, { type: 'square', vol: 0.06, at: 0.08 });
  }
  playGameOver(win: boolean): void {
    const seq = win ? [523, 659, 784, 1047, 1319] : [392, 330, 262];
    seq.forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.12, at: i * 0.12 }));
  }
  /** Zuzu purring while being petted. */
  /** Zuzu being petted: a soft chirp and two gentle, rumbly purr breaths. */
  playPurr(): void {
    if (this.isMuted || !this.ctx) return;
    const ctx = this.ctx;
    const v = this.sfxVolume;
    const breath = (at: number, dur: number, pitch: number) => {
      try {
        const t0 = ctx.currentTime + at;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(pitch, t0);
        osc.frequency.linearRampToValueAtTime(pitch * 0.92, t0 + dur);
        // Rumble: amplitude wobble ~23 times a second, like a real purr
        const am = ctx.createGain();
        am.gain.value = 0.5;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 23;
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.value = 0.5;
        lfo.connect(lfoDepth);
        lfoDepth.connect(am.gain);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 380;
        lp.Q.value = 0.7;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.linearRampToValueAtTime(v * 0.045, t0 + dur * 0.35);
        env.gain.linearRampToValueAtTime(v * 0.035, t0 + dur * 0.7);
        env.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(am);
        am.connect(lp);
        lp.connect(env);
        env.connect(ctx.destination);
        osc.start(t0);
        lfo.start(t0);
        osc.stop(t0 + dur + 0.05);
        lfo.stop(t0 + dur + 0.05);
      } catch {}
    };
    // A soft little "mrrp", then two gentle purr breaths
    this.tone(700, 0.16, { type: 'sine', vol: 0.03, to: 950, attack: 0.04 });
    breath(0.2, 0.8, 95);
    breath(1.05, 0.9, 85);
  }
  /** Zuzu's little "mrrp" when speaking. */
  playMrrp(): void {
    this.tone(700, 0.14, { type: 'triangle', vol: 0.08, to: 1100 });
    this.tone(1000, 0.12, { type: 'triangle', vol: 0.06, to: 800, at: 0.12 });
  }
  playError(): void {
    this.tone(220, 0.2, { type: 'square', vol: 0.05 });
    this.tone(180, 0.25, { type: 'square', vol: 0.05, at: 0.12 });
  }
  /** Camera mode switch click. */
  playClick(): void {
    this.noise(0.03, { freq: 3000, q: 5, vol: 0.12 });
  }
  /** Avatar giggle when clicked. */
  playGiggle(): void {
    [880, 1046, 932, 1175].forEach((f, i) => this.tone(f, 0.09, { type: 'sine', vol: 0.07, at: i * 0.08, to: f * 1.1 }));
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = v;
    store.set('sfxVolume', v);
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    store.set('musicVolume', v);
    if (this.bgmGain && this.ctx) this.bgmGain.gain.setValueAtTime(this.isMuted ? 0 : v * 0.12, this.ctx.currentTime);
  }

  get volumes(): { music: number; sfx: number } {
    return { music: this.musicVolume, sfx: this.sfxVolume };
  }

  private startProceduralLoFiBGM(): void {
    if (!this.ctx || this.bgmGain) return;

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(this.isMuted ? 0 : this.musicVolume * 0.12, this.ctx.currentTime);
    this.bgmGain.connect(this.ctx.destination);

    // Cozy pentatonic gentle arpeggio chord cycle (C maj7 - Am7 - F maj7 - G)
    const chords = [
      [261.63, 329.63, 392.00, 493.88], // C E G B
      [220.00, 261.63, 329.63, 392.00], // A C E G
      [174.61, 220.00, 261.63, 329.63], // F A C E
      [196.00, 246.94, 293.66, 392.00]  // G B D G
    ];

    let chordIdx = 0;
    let noteIdx = 0;

    this.bgmInterval = window.setInterval(() => {
      if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;
      try {
        const chord = chords[chordIdx];
        const freq = chord[noteIdx];

        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        noteGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        noteGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);

        osc.connect(noteGain);
        noteGain.connect(this.bgmGain!);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.6);

        noteIdx++;
        if (noteIdx >= chord.length) {
          noteIdx = 0;
          chordIdx = (chordIdx + 1) % chords.length;
        }
      } catch {}
    }, 450);
  }
}

export const audioManager = new AudioManager();
