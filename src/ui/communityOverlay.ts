import { eventBus } from '../core/events';
import { store } from '../core/store';
import { profile } from '../content/profile';
import { Modal, esc } from './modal';

/** GameCon photos and leadership, opened from the Community wall in the bedroom. */
export class CommunityOverlay extends Modal {
  constructor() {
    super('community', 'Community and leadership', 820);
  }

  protected render(arg?: unknown): void {
    const focus = typeof arg === 'number' ? arg : 0;
    this.card.innerHTML = `
      <h2 class="modal-title">🎤 Community & Leadership</h2>
      <p style="font-size:0.9rem; line-height:1.5; margin-bottom:12px;">${esc(profile.leadership)}</p>
      <div class="community-grid">
        ${profile.community
          .map(
            (c, i) => `
          <figure class="community-photo${i === focus ? ' highlight' : ''}">
            <img src="${c.src}" alt="${esc(c.title)}" loading="lazy" />
            <figcaption>
              <strong>${esc(c.title)}</strong>
              <span>${esc(c.caption)}</span>
              ${c.projectId ? `<button type="button" class="sticker-btn accent-mint" data-project="${c.projectId}" style="padding:4px 12px; font-size:0.8rem; margin-top:6px;">See the project 🎮</button>` : ''}
            </figcaption>
          </figure>`
          )
          .join('')}
      </div>`;
    this.card.querySelectorAll<HTMLButtonElement>('[data-project]').forEach((b) =>
      b.addEventListener('click', () => {
        this.close();
        store.set('activeOverlay', 'project');
        eventBus.emit('project:select', b.dataset.project);
      })
    );
  }
}
