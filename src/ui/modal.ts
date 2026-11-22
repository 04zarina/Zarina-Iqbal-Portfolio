import { store, OverlayType } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';

/**
 * Shared behaviour for the newer overlays: open on `overlay:open <name>`,
 * close on ✕, backdrop click or Escape, lock movement while open, and
 * move keyboard focus into the dialog and back out again.
 */
export abstract class Modal {
  protected overlay: HTMLElement;
  protected card: HTMLElement;
  private lastFocus: Element | null = null;

  constructor(protected name: OverlayType, title: string, maxWidth = 720) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = `${name}-modal`;
    this.overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="${title}" style="max-width:${maxWidth}px; width:94vw;">
        <button class="modal-close-btn" aria-label="Close">✕</button>
        <div class="modal-body"></div>
      </div>`;
    document.body.appendChild(this.overlay);
    this.card = this.overlay.querySelector('.modal-body')!;

    this.overlay.querySelector('.modal-close-btn')!.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    eventBus.on('overlay:open', (n: string) => {
      if (n === name) this.open();
    });
    // `open:<name>` carries an argument, e.g. open:skills with a category to highlight
    eventBus.on(`open:${name}`, (arg: unknown) => this.open(arg));
  }

  get isOpen(): boolean {
    return this.overlay.classList.contains('active');
  }

  protected abstract render(arg?: unknown): void;

  open(arg?: unknown): void {
    this.render(arg);
    this.lastFocus = document.activeElement;
    this.overlay.classList.add('active');
    store.set('activeOverlay', this.name);
    store.set('inputLocked', true);
    requestAnimationFrame(() => (this.overlay.querySelector('.modal-close-btn') as HTMLElement)?.focus());
  }

  close(): void {
    if (!this.isOpen) return;
    this.overlay.classList.remove('active');
    store.set('activeOverlay', 'none');
    store.set('inputLocked', false);
    audioManager.playPop();
    eventBus.emit('camera:unfocus');
    (this.lastFocus as HTMLElement | null)?.focus?.();
  }
}

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
