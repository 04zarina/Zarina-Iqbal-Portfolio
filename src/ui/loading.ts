import { audioManager } from '../audio/audioManager';

export class LoadingScreen {
  private element: HTMLElement;
  private barFill: HTMLElement;
  private tipText: HTMLElement;
  private startBtn: HTMLElement;
  private tips = [
    'Tip: Walk up to objects that sparkle and press E or tap!',
    'Tip: Mochi the companion cat follows you and knows all about Zarina\'s games and skills.',
    'Tip: Switch the lamp on the bedroom desk to toggle between Day and Dusk modes.',
    'Tip: Explore the wardrobe in the bedroom to discover the secret Dev Realm!',
    'Tip: Check your Explorer Journal in the HUD to see your quest progress.',
    'Tip: Grab Zarina\'s resume from the desk in the Study Nook.'
  ];
  private tipIndex = 0;

  constructor(onStart: () => void) {
    this.element = document.createElement('div');
    this.element.className = 'loading-screen';

    this.element.innerHTML = `
      <div class="loading-mascot">🐾</div>
      <div class="loading-title">Zarina's Game Room</div>
      <div class="loading-bar-wrap">
        <div class="loading-bar-fill" id="loading-bar-fill"></div>
      </div>
      <div class="loading-tip" id="loading-tip">${this.tips[0]}</div>
      <button class="sticker-btn accent-butter" id="start-btn" style="display:none; font-size:1.2rem; padding:12px 32px;">
        Press to Start 🎮
      </button>
    `;

    document.body.appendChild(this.element);
    this.barFill = this.element.querySelector('#loading-bar-fill')!;
    this.tipText = this.element.querySelector('#loading-tip')!;
    this.startBtn = this.element.querySelector('#start-btn')!;

    // Rotate tips every 2.4s
    setInterval(() => {
      this.tipIndex = (this.tipIndex + 1) % this.tips.length;
      this.tipText.innerText = this.tips[this.tipIndex];
    }, 2400);

    this.startBtn.onclick = () => {
      audioManager.init();
      audioManager.playPop();
      this.element.classList.add('hidden');
      setTimeout(() => this.element.remove(), 600);
      onStart();
    };
  }

  setProgress(percent: number): void {
    this.barFill.style.width = `${percent}%`;
    if (percent >= 100) {
      this.barFill.parentElement!.style.display = 'none';
      this.tipText.style.display = 'none';
      this.startBtn.style.display = 'inline-flex';
    }
  }
}
