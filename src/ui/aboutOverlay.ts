import { store } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import skillsData from '../../content/skills.json';

export class AboutOverlay {
  private overlay: HTMLElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'about-modal';

    const skillsHtml = skillsData.map((s) => `
      <div style="background:var(--surface-color); border:1.5px solid var(--cocoa); border-radius:12px; padding:10px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-family:var(--font-display);">${s.name}</strong>
          <span style="font-size:0.8rem; color:var(--text-muted);">${s.category} (Lvl ${s.level}/5)</span>
        </div>
        <div style="font-size:0.85rem; margin-top:4px;">${s.blurb}</div>
      </div>
    `).join('');

    this.overlay.innerHTML = `
      <div class="modal-card" style="max-width:580px;">
        <button class="modal-close-btn" id="about-close-btn">✕</button>
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px;">
          <div style="width:72px; height:72px; border-radius:50%; background:var(--blush); border:3px solid var(--cocoa); display:flex; align-items:center; justify-content:center; font-size:2.2rem;">
            👩‍💻
          </div>
          <div>
            <h2 class="modal-title" style="margin-bottom:2px;">Alex Morgan</h2>
            <p style="font-size:0.9rem; font-weight:700; color:var(--text-muted);">
              Game Developer & Interactive 3D Technologist
            </p>
          </div>
        </div>

        <div style="line-height:1.55; font-size:0.92rem; margin-bottom:18px;">
          <p style="margin-bottom:10px;">
            Hi there! I am Alex Morgan, a passionate game programmer, technical artist, and web 3D developer. I blend procedural generation, tactile physics, and cozy pastel aesthetics to build games and web toys that bring smiles.
          </p>
          <p>
            Whether rigging a low-poly character in Blender, writing custom shaders in GLSL / HLSL, or optimizing Three.js web render loops to sustain 60 FPS across mid-range mobile devices, I love making the virtual world feel tangible and responsive.
          </p>
        </div>

        <h3 style="font-family:var(--font-display); margin-bottom:10px;">🌱 Core Skills Overview:</h3>
        <div style="max-height:220px; overflow-y:auto; padding-right:4px;">
          ${skillsHtml}
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.initEvents();
  }

  private initEvents(): void {
    this.overlay.querySelector('#about-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    eventBus.on('overlay:open', (name: string) => {
      if (name === 'about' || name === 'skills') this.open();
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
}
