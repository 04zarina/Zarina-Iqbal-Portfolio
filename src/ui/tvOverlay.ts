import { store } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import { profile } from '../content/profile';

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
            📼 Zarina's Showreel
          </h2>
          <button class="modal-close-btn" id="tv-close-btn" style="position:static;">✕</button>
        </div>

        <div id="tv-screen" style="width:100%; aspect-ratio:16/9; background:#000; border-radius:12px; overflow:hidden; position:relative; border:2px solid #6B4A7A;">
          <canvas id="tv-video-canvas" width="640" height="360" style="width:100%; height:100%; object-fit:cover;"></canvas>
          <button class="sticker-btn accent-butter" id="tv-play-btn" style="position:absolute; left:50%; bottom:18%; transform:translateX(-50%); font-size:0.95rem;">
            ▶ Play ${profile.showreel.title}
          </button>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <div style="font-size:0.85rem; color:#D9C8FF;">
            Now showing: ${profile.showreel.title}
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
    this.overlay.querySelector('#tv-play-btn')?.addEventListener('click', () => this.playVideo());
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

  private playVideo(): void {
    const screen = this.overlay.querySelector('#tv-screen');
    if (!screen || screen.querySelector('iframe, video')) return;
    if (profile.showreel.mp4) {
      const video = document.createElement('video');
      video.src = profile.showreel.mp4;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.poster = profile.showreel.poster;
      video.preload = 'metadata';
      video.title = profile.showreel.title;
      video.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; background:#000;';
      screen.appendChild(video);
      (this.overlay.querySelector('#tv-play-btn') as HTMLElement | null)?.style.setProperty('display', 'none');
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${profile.showreel.youtubeId}?autoplay=1&rel=0`;
    iframe.title = profile.showreel.title;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border:0;';
    screen.appendChild(iframe);
    (this.overlay.querySelector('#tv-play-btn') as HTMLElement | null)?.style.setProperty('display', 'none');
  }

  close(): void {
    // Stop any playing video by removing the player
    this.overlay.querySelector('#tv-screen iframe, #tv-screen video')?.remove();
    (this.overlay.querySelector('#tv-play-btn') as HTMLElement | null)?.style.setProperty('display', '');
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
      ctx.fillText(profile.name, canvas.width / 2, 100);

      ctx.font = 'bold 20px Nunito, sans-serif';
      ctx.fillText('Game Developer · Unreal Engine 5 · Unity · Three.js', canvas.width / 2, 135);

      // Animated Showcase Ribbon
      const ribbonY = 165 + Math.sin(t * 3) * 8;
      ctx.fillStyle = '#FFE9A3';
      ctx.fillRect(80, ribbonY, canvas.width - 160, 48);

      ctx.fillStyle = '#5A3A32';
      ctx.font = 'bold 18px Nunito, sans-serif';
      const items = ['Light Up The House 💡', 'The Floor Is A Liar 🪩', 'The Mask That Holds 🎭', 'VR Escape Room 🗝️', 'Echoes of the Fallen ⚔️'];
      const text = items[Math.floor(t * 0.8) % items.length];
      ctx.fillText(`Featured: ${text}`, canvas.width / 2, ribbonY + 30);

      // Progress bar
      ctx.fillStyle = '#8A5A4A';
      ctx.fillRect(40, canvas.height - 35, ((t * 40) % (canvas.width - 80)), 5);

      animId = requestAnimationFrame(loop);
    };

    loop();
  }
}
