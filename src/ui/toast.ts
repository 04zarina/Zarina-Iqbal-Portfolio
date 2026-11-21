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
    audioManager.playPop();
    const toast = document.createElement('div');
    toast.className = 'toast';
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
