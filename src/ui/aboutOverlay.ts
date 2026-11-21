import { store } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import skillsData from '../../content/skills.json';
import { profile } from '../content/profile';

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
          <span style="font-size:0.8rem; color:var(--text-muted);">${s.category} </span>
        </div>
        <div style="font-size:0.85rem; margin-top:4px;">${s.blurb}</div>
      </div>
    `).join('');

    const linkBtn = (href: string, label: string, accent: string) =>
      `<a href="${href}" target="_blank" rel="noreferrer" class="sticker-btn ${accent}" style="padding:6px 14px; font-size:0.85rem;">${label}</a>`;

    this.overlay.innerHTML = `
      <div class="modal-card" style="max-width:600px;">
        <button class="modal-close-btn" id="about-close-btn">✕</button>
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:14px;">
          <div style="width:72px; height:72px; flex-shrink:0; border-radius:50%; background:var(--blush); border:3px solid var(--cocoa); display:flex; align-items:center; justify-content:center; font-size:2.2rem;">
            👩‍💻
          </div>
          <div>
            <h2 class="modal-title" style="margin-bottom:2px;">${profile.name}</h2>
            <p style="font-size:0.9rem; font-weight:700; color:var(--text-muted);">
              ${profile.role} · ${profile.education}
            </p>
          </div>
        </div>

        <p style="font-size:0.88rem; background:var(--mint); border:1.5px solid var(--cocoa); border-radius:12px; padding:8px 12px; margin-bottom:14px;">
          <strong>Currently:</strong> ${profile.currently}
        </p>

        <div style="line-height:1.55; font-size:0.92rem; margin-bottom:14px;">
          ${profile.about.map((para) => `<p style="margin-bottom:10px;">${para}</p>`).join('')}
          <p style="font-weight:700;">${profile.availability}</p>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px;">
          <a href="${profile.resume}" download="Zarina_Iqbal_Resume.pdf" class="sticker-btn accent-butter" style="padding:6px 14px; font-size:0.85rem;">Download Resume ⬇️</a>
          ${linkBtn(`mailto:${profile.email}`, 'Email ✉️', 'accent-peach')}
          ${linkBtn(profile.socials.linkedin, 'LinkedIn 💼', 'accent-sky')}
          ${linkBtn(profile.socials.github, 'GitHub 💻', 'accent-mint')}
        </div>

        <h3 style="font-family:var(--font-display); margin-bottom:10px;">🌱 Skills & where I used them:</h3>
        <div style="max-height:220px; overflow-y:auto; padding-right:4px; margin-bottom:16px;">
          ${skillsHtml}
        </div>

        <h3 style="font-family:var(--font-display); margin-bottom:8px;">🎤 Leadership & Community</h3>
        <p style="font-size:0.88rem; line-height:1.5;">${profile.leadership}</p>
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
