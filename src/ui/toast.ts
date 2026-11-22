import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';

export class ToastManager {
  private container: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);

    eventBus.on('toast:show', (msg: string) => this.show(msg));
  }

  show(message: string, duration: number = 3200): void {
    // Same message already showing: don't stack a duplicate
    for (const t of Array.from(this.container.children)) {
      if ((t as HTMLElement).dataset.msg === message) return;
    }
    audioManager.playPop();
    // Keep the screen tidy: at most two toasts at a time
    while (this.container.children.length >= 2) this.container.firstElementChild?.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.msg = message;
    toast.innerHTML = `<span>✨</span> <span>${message}</span>`;
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.9)';
      toast.style.transition = 'all 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

export const toastManager = new ToastManager();
