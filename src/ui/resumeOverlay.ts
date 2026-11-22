import { store } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import { profile } from '../content/profile';

/** Resume viewer opened from the Study desk: inline PDF preview plus a download button. */
export class ResumeOverlay {
  private overlay: HTMLElement;
  private viewer: HTMLElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'resume-modal';

    this.overlay.innerHTML = `
      <div class="modal-card" style="max-width:760px; width:94vw;">
        <button class="modal-close-btn" id="resume-close-btn" aria-label="Close">✕</button>
        <h2 class="modal-title">📄 ${profile.name} · Resume</h2>
        <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:12px;">
          ${profile.role} · ${profile.education}
        </p>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <a href="${profile.resume}" download="Zarina_Iqbal_Resume.pdf" class="sticker-btn accent-butter" id="resume-download-btn">Download PDF ⬇️</a>
          <a href="${profile.resume}" target="_blank" rel="noreferrer" class="sticker-btn accent-sky">Open in new tab ↗</a>
        </div>
        <div id="resume-viewer" tabindex="0" aria-label="Resume preview" style="width:100%; height:62vh; border:2px solid var(--cocoa); border-radius:12px; overflow:auto; background:#fff;"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.viewer = this.overlay.querySelector('#resume-viewer')!;
    this.initEvents();
  }

  private initEvents(): void {
    this.overlay.querySelector('#resume-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    this.overlay.querySelector('#resume-download-btn')?.addEventListener('click', () => {
      store.completeQuest('get_resume');
      eventBus.emit('toast:show', 'Resume downloaded! 📄');
    });

    eventBus.on('overlay:open', (name: string) => {
      if (name === 'resume') this.open();
    });
  }

  open(): void {
    // Show a rendered image of the resume: it reads on every device (phones and some
    // browsers won't show PDFs inside a page). Loaded only when opened.
    if (!this.viewer.firstChild) {
      const img = document.createElement('img');
      img.src = '/resume/resume-preview.webp';
      img.alt = `${profile.name} resume, page 1`;
      img.style.cssText = 'width:100%; height:auto; display:block;';
      this.viewer.appendChild(img);
    }
    store.completeQuest('get_resume');
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
