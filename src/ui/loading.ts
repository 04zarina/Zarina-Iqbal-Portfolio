import { audioManager } from '../audio/audioManager';

/** Chibi Zarina (long dark hair, round glasses) holding a controller; she blinks and bobs. */
const CHIBI_SVG = `
<svg class="splash-chibi" viewBox="0 0 220 240" aria-hidden="true">
  <defs>
    <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A2E2A"/><stop offset="1" stop-color="#2E1B1A"/></linearGradient>
  </defs>
  <ellipse cx="110" cy="232" rx="62" ry="7" fill="rgba(90,58,50,.18)"/>
  <!-- hair back -->
  <path d="M42 96 C38 40 182 40 178 96 L186 196 C170 214 150 200 146 186 L74 186 C70 200 50 214 34 196 Z" fill="url(#hair)"/>
  <!-- body -->
  <path d="M70 178 C70 158 150 158 150 178 L156 226 L64 226 Z" fill="#3B3340"/>
  <path d="M96 160 L110 176 L124 160" fill="none" stroke="#FFF6EC" stroke-width="4" stroke-linecap="round"/>
  <!-- controller -->
  <g class="splash-pad">
    <rect x="76" y="186" width="68" height="30" rx="15" fill="#FFB3C7" stroke="#5A3A32" stroke-width="3"/>
    <path d="M90 196 v10 M85 201 h10" stroke="#5A3A32" stroke-width="3" stroke-linecap="round"/>
    <circle cx="126" cy="197" r="3.5" fill="#5A3A32"/><circle cx="133" cy="204" r="3.5" fill="#5A3A32"/>
    <circle cx="70" cy="200" r="9" fill="#FFE6D5" stroke="#5A3A32" stroke-width="2.5"/>
    <circle cx="150" cy="200" r="9" fill="#FFE6D5" stroke="#5A3A32" stroke-width="2.5"/>
  </g>
  <!-- head -->
  <ellipse cx="110" cy="104" rx="62" ry="58" fill="#FFE6D5" stroke="#5A3A32" stroke-width="3"/>
  <!-- bangs -->
  <path d="M48 98 C52 52 92 40 112 44 C140 42 172 58 172 100 C160 84 140 70 122 66 C116 80 96 86 76 82 C66 88 56 94 48 98 Z" fill="url(#hair)"/>
  <!-- cheeks -->
  <ellipse cx="78" cy="124" rx="10" ry="6" fill="#FFB3C7" opacity=".8"/>
  <ellipse cx="142" cy="124" rx="10" ry="6" fill="#FFB3C7" opacity=".8"/>
  <!-- eyes (blink) -->
  <g class="splash-eyes">
    <ellipse cx="88" cy="108" rx="7" ry="9" fill="#3A2420"/><circle cx="90.5" cy="104.5" r="2.6" fill="#fff"/>
    <ellipse cx="132" cy="108" rx="7" ry="9" fill="#3A2420"/><circle cx="134.5" cy="104.5" r="2.6" fill="#fff"/>
  </g>
  <!-- glasses -->
  <g fill="rgba(255,255,255,.18)" stroke="#5A3A32" stroke-width="3">
    <circle cx="88" cy="108" r="17"/><circle cx="132" cy="108" r="17"/>
    <path d="M105 106 Q110 102 115 106" fill="none"/>
  </g>
  <!-- smile -->
  <path d="M100 130 Q110 140 120 130" fill="none" stroke="#5A3A32" stroke-width="3" stroke-linecap="round"/>
</svg>`;

export class LoadingScreen {
  private element: HTMLElement;
  private barFill: HTMLElement;
  private pct: HTMLElement;
  private tipText: HTMLElement;
  private startBtn: HTMLButtonElement;
  private tips = [
    'Walk up to anything that sparkles and press E, or just click it',
    'Click the floor to walk there. Press V for first-person view',
    'Mochi the red panda knows all about Zarina. Click to pet!',
    'Try Bug Bash, the mini game hidden in the Dev Realm 🐞',
    "Grab the watering can in the greenhouse and grow Zarina's skills",
    'The wardrobe in the bedroom is a portal… 🌀'
  ];
  private tipIndex = 0;
  private shown = 0;
  private target = 0;

  constructor(onStart: () => void) {
    this.element = document.createElement('div');
    this.element.className = 'loading-screen splash';
    this.element.innerHTML = `
      <div class="splash-bg" aria-hidden="true">
        ${['🎮', '⭐', '👾', '🕹️', '✨', '💖', '🌸', '🎲']
          .map((e, i) => `<span style="--i:${i}; left:${8 + ((i * 37) % 84)}%; animation-delay:${-i * 1.3}s">${e}</span>`)
          .join('')}
      </div>
      <div class="splash-card">
        <div class="splash-level">LEVEL 1 · THE COZY GAME ROOM</div>
        ${CHIBI_SVG}
        <h1 class="splash-name">Zarina Iqbal</h1>
        <div class="splash-role">Game Developer <span>·</span> Unreal <span>·</span> Unity <span>·</span> Three.js</div>
        <div class="splash-load" id="splash-load">
          <div class="splash-bar"><div class="splash-fill" id="loading-bar-fill"></div></div>
          <div class="splash-pct"><span>LOADING WORLD</span><b id="loading-pct">0%</b></div>
        </div>
        <button class="splash-start" id="start-btn" hidden>▶ PRESS START</button>
        <p class="splash-tip" id="loading-tip">💡 ${this.tips[0]}</p>
      </div>
      <div class="splash-foot">WASD / arrows to move · drag to look · E to interact · <a href="/classic">2D version</a></div>
    `;

    document.body.appendChild(this.element);
    this.barFill = this.element.querySelector('#loading-bar-fill')!;
    this.pct = this.element.querySelector('#loading-pct')!;
    this.tipText = this.element.querySelector('#loading-tip')!;
    this.startBtn = this.element.querySelector('#start-btn')!;

    setInterval(() => {
      this.tipIndex = (this.tipIndex + 1) % this.tips.length;
      this.tipText.textContent = `💡 ${this.tips[this.tipIndex]}`;
    }, 3000);

    // Ease the bar toward the real progress so it never jumps
    const tick = () => {
      this.shown += (this.target - this.shown) * 0.12;
      if (Math.abs(this.target - this.shown) < 0.5) this.shown = this.target;
      this.barFill.style.width = `${this.shown}%`;
      this.pct.textContent = `${Math.round(this.shown)}%`;
      if (this.shown >= 100) this.ready();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const start = () => {
      audioManager.init();
      audioManager.playCoin();
      this.element.classList.add('hidden');
      setTimeout(() => this.element.remove(), 600);
      window.removeEventListener('keydown', onKey);
      onStart();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!this.startBtn.hidden && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);
    this.startBtn.onclick = start;
  }

  private ready(): void {
    (this.element.querySelector('#splash-load') as HTMLElement).style.display = 'none';
    this.startBtn.hidden = false;
    this.startBtn.focus();
  }

  setProgress(percent: number): void {
    this.target = Math.max(this.target, Math.min(100, percent));
  }
}
