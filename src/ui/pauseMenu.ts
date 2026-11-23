import { store, RoomId, QualityTier } from '../core/store';
import { qualityManager } from '../core/quality';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import { profile } from '../content/profile';

export class PauseMenuOverlay {
  private overlay: HTMLElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'menu-modal';

    document.body.appendChild(this.overlay);
    this.initEvents();
  }

  private initEvents(): void {
    eventBus.on('overlay:open', (name: string) => {
      if (name === 'menu') {
        this.render();
        this.open();
      }
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
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
  }

  private render(): void {
    const currentQuality = qualityManager.config.tier;

    this.overlay.innerHTML = `
      <div class="modal-card" style="max-width:500px;">
        <button class="modal-close-btn" id="menu-close-btn">✕</button>
        <h2 class="modal-title">⚙️ Settings & Options</h2>

        <div style="margin-bottom:18px;">
          <h4 style="font-family:var(--font-display); margin-bottom:8px;">Graphics Performance:</h4>
          <div style="display:flex; gap:8px;">
            <button class="sticker-btn quality-btn ${currentQuality === 'high' ? 'accent-mint' : ''}" data-quality="high">High (DPR 2)</button>
            <button class="sticker-btn quality-btn ${currentQuality === 'medium' ? 'accent-butter' : ''}" data-quality="medium">Medium (DPR 1.5)</button>
            <button class="sticker-btn quality-btn ${currentQuality === 'low' ? 'accent-peach' : ''}" data-quality="low">Low-Power (DPR 1)</button>
          </div>
        </div>

        <div style="margin-bottom:18px;">
          <h4 style="font-family:var(--font-display); margin-bottom:8px;">Alternative Views & Accessibility:</h4>
          <a href="/classic" class="sticker-btn accent-butter" style="width:100%; justify-content:center;">
            Switch to 2D Classic Portfolio View 📄
          </a>
          <a href="${profile.resume}" download="Zarina_Iqbal_Resume.pdf" class="sticker-btn accent-mint" style="width:100%; justify-content:center; margin-top:8px;">
            Download Resume (PDF) ⬇️
          </a>
        </div>

        <div style="border-top:2px solid var(--cocoa); padding-top:12px; font-size:0.82rem; color:var(--text-muted); line-height:1.4;">
          <strong>Tip:</strong> Quick scene navigation is always available at the top-left of your screen!<br /><br />
          <strong>Credits:</strong><br />
          🐾 Companion 3D Model: "Hanini red panda" by Amonii0 licensed under CC-BY-4.0.<br />
          🎵 Procedural Web Audio Sound Engine by Zarina Iqbal Buriro.<br />
          🛋️ Furniture: Cute Furniture pack. Lamp by Kenney (CC0). Mirror by Poly by Google (CC-BY).
        </div>
      </div>
    `;

    this.overlay.querySelector('#menu-close-btn')?.addEventListener('click', () => this.close());

    this.overlay.querySelectorAll('.quality-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const q = (e.currentTarget as HTMLElement).getAttribute('data-quality') as QualityTier;
        qualityManager.setTier(q, true);
        this.render();
      });
    });
  }
}
