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
