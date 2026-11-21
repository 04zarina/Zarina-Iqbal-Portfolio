import { store } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';

export class TVVideoOverlay {
  private overlay: HTMLElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'tv-modal';

    this.overlay.innerHTML = `
      <div class="modal-card" style="max-width:680px; padding:16px; background:#1F162B; border:4px solid var(--cocoa); color:#FFF3D6;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h2 style="font-family:var(--font-display); font-size:1.4rem; color:#FFE9A3; margin:0;">
            📼 Alex's Demo Reel (Promo Video)
          </h2>
          <button class="modal-close-btn" id="tv-close-btn" style="position:static;">✕</button>
        </div>

        <div style="width:100%; aspect-ratio:16/9; background:#000; border-radius:12px; overflow:hidden; position:relative; border:2px solid #6B4A7A;">
          <canvas id="tv-video-canvas" width="640" height="360" style="width:100%; height:100%; object-fit:cover;"></canvas>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <div style="font-size:0.85rem; color:#D9C8FF;">
            Module 3: 30-60s Animated Portfolio Showcase
          </div>
          <button class="sticker-btn accent-butter" id="tv-eject-btn" style="padding:6px 18px; font-size:0.9rem;">
            Eject Tape ⏏️
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.initEvents();
  }

  private initEvents(): void {
    this.overlay.querySelector('#tv-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#tv-eject-btn')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    eventBus.on('overlay:open', (name: string) => {
      if (name === 'tv') {
        this.open();
        this.animateVideoCanvas();
      }
    });
  }

  open(): void {
    this.overlay.classList.add('active');
    store.set('inputLocked', true);
  }

  close(): void {
    this.overlay.classList.remove('active');
    store.set('activeOverlay', 'none');
    store.set('inputLocked', false);
    audioManager.playPop();
    eventBus.emit('camera:unfocus');
  }

  private animateVideoCanvas(): void {
    const canvas = this.overlay.querySelector('#tv-video-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let animId: number;
    let t = 0;

    const loop = () => {
      if (!this.overlay.classList.contains('active')) {
        cancelAnimationFrame(animId);
        return;
      }
      t += 0.03;

      // Stylized motion graphic presentation for the promo reel
      ctx.fillStyle = '#1B1424';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Gradient animated background
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#FFC9B0');
      grad.addColorStop(1, '#FFB3C7');
      ctx.fillStyle = grad;
      ctx.fillRect(40, 30, canvas.width - 80, canvas.height - 60);

      // Title Card
      ctx.fillStyle = '#5A3A32';
      ctx.font = 'bold 34px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Alex Morgan', canvas.width / 2, 110);

      ctx.font = 'bold 20px Nunito, sans-serif';
      ctx.fillText('Game Programmer & Interactive 3D Developer', canvas.width / 2, 145);

      // Animated Showcase Ribbon
      const ribbonY = 200 + Math.sin(t * 3) * 10;
      ctx.fillStyle = '#FFE9A3';
      ctx.fillRect(80, ribbonY, canvas.width - 160, 48);

      ctx.fillStyle = '#5A3A32';
      ctx.font = 'bold 18px Nunito, sans-serif';
      const items = ['Unity 🎮', 'Three.js 🌐', 'Blender 3D 🎨', 'Shaders 🌟'];
      const text = items[Math.floor(t * 0.8) % items.length];
      ctx.fillText(`Featured Skill: ${text}`, canvas.width / 2, ribbonY + 30);

      // Progress bar
      ctx.fillStyle = '#8A5A4A';
      ctx.fillRect(40, canvas.height - 35, ((t * 40) % (canvas.width - 80)), 5);

      animId = requestAnimationFrame(loop);
    };

    loop();
  }
}
