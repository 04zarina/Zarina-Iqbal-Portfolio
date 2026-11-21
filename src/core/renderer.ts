import * as THREE from 'three';
import { qualityManager } from './quality';
import { eventBus } from './events';

export class AppRenderer {
  public renderer: THREE.WebGLRenderer;
  public container: HTMLElement;

  constructor(containerId: string = 'canvas-container') {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      document.body.prepend(container);
    }
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.updateDPR();

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', this.onResize);
    eventBus.on('quality:change', () => this.updateDPR());
  }

  private updateDPR(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, qualityManager.config.maxDPR);
    this.renderer.setPixelRatio(dpr);
  }

  private onResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.updateDPR();
    eventBus.emit('window:resize', { width, height });
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
