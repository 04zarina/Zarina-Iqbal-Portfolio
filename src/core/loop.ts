import * as THREE from 'three';
import { qualityManager } from './quality';
import { eventBus } from './events';

export type UpdateCallback = (delta: number, elapsed: number) => void;

export class RenderLoop {
  private clock = new THREE.Clock();
  private isRunning = false;
  private animationFrameId: number | null = null;
  private updateCallbacks: Set<UpdateCallback> = new Set();
  private debugOverlay: HTMLElement | null = null;
  private isDebug = new URLSearchParams(window.location.search).get('debug') === '1';

  // Stats
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private currentFps = 60;

  constructor() {
    if (this.isDebug) {
      this.initDebugOverlay();
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
      } else {
        this.resume();
      }
    });
  }

  addCallback(cb: UpdateCallback): () => void {
    this.updateCallbacks.add(cb);
    return () => this.updateCallbacks.delete(cb);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this.tick();
  }

  pause(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  resume(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.getDelta(); // reset delta jump
    this.tick();
  }

  private tick = (): void => {
    if (!this.isRunning) return;

    let delta = this.clock.getDelta();
    // Clamp delta to prevent huge jumps on tab switch / lag spikes
    delta = Math.min(delta, import.meta.env.DEV ? ((window as unknown as { __maxDt?: number }).__maxDt ?? 0.05) : 0.05);
    const elapsed = this.clock.getElapsedTime();

    qualityManager.recordFrame(delta);

    // Call all update callbacks
    this.updateCallbacks.forEach((cb) => {
      try {
        cb(delta, elapsed);
      } catch (err) {
        console.error('Error in render loop callback:', err);
      }
    });

    if (this.isDebug) {
      this.updateDebugStats(delta);
    }

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  private initDebugOverlay(): void {
    this.debugOverlay = document.createElement('div');
    this.debugOverlay.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0,0,0,0.75);
      color: #00FF88;
      font-family: monospace;
      font-size: 11px;
      padding: 6px 10px;
      border-radius: 6px;
      z-index: 9999;
      pointer-events: none;
      line-height: 1.4;
    `;
    document.body.appendChild(this.debugOverlay);
  }

  private updateDebugStats(delta: number): void {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;

      if (this.debugOverlay) {
        this.debugOverlay.innerText = `FPS: ${this.currentFps} | Quality: ${qualityManager.config.tier} | DPR: ${qualityManager.config.maxDPR}`;
      }
    }
  }
}
