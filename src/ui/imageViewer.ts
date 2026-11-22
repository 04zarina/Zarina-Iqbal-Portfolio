import { Modal, esc } from './modal';

export interface ViewerImage {
  src: string;
  title: string;
  caption?: string;
  link?: string;
  linkLabel?: string;
}

/**
 * Full-size image lightbox (certificates, photos). Open with
 * eventBus.emit('open:image', { items, index }) or a single ViewerImage.
 * Arrow keys / buttons step through a gallery.
 */
export class ImageViewerOverlay extends Modal {
  private items: ViewerImage[] = [];
  private index = 0;

  constructor() {
    super('image', 'Image viewer', 900);
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || this.items.length < 2) return;
      if (e.key === 'ArrowRight') this.step(1);
      if (e.key === 'ArrowLeft') this.step(-1);
    });
  }

  private step(d: number): void {
    this.index = (this.index + d + this.items.length) % this.items.length;
    this.render();
  }

  protected render(arg?: unknown): void {
    if (arg) {
      const a = arg as { items?: ViewerImage[]; index?: number } & Partial<ViewerImage>;
      if (a.items) {
        this.items = a.items;
        this.index = a.index ?? 0;
      } else if (a.src) {
        this.items = [a as ViewerImage];
        this.index = 0;
      }
    }
    const it = this.items[this.index];
    if (!it) return;
    const multi = this.items.length > 1;
    this.card.innerHTML = `
      <h2 class="modal-title" style="margin-right:40px;">${esc(it.title)}</h2>
      <figure class="viewer-figure">
        ${multi ? '<button class="viewer-nav prev" aria-label="Previous">‹</button>' : ''}
        <img src="${esc(it.src)}" alt="${esc(it.title)}" />
        ${multi ? '<button class="viewer-nav next" aria-label="Next">›</button>' : ''}
      </figure>
      ${it.caption ? `<p class="viewer-caption">${esc(it.caption)}</p>` : ''}
      <div class="viewer-actions">
        ${it.link ? `<a class="sticker-btn accent-mint" href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.linkLabel || 'Open link')} ↗</a>` : ''}
        <a class="sticker-btn" href="${esc(it.src)}" target="_blank" rel="noopener">Open full size ⤢</a>
        ${multi ? `<span class="viewer-count">${this.index + 1} / ${this.items.length}</span>` : ''}
      </div>`;
    this.card.querySelector('.prev')?.addEventListener('click', () => this.step(-1));
    this.card.querySelector('.next')?.addEventListener('click', () => this.step(1));
  }
}
