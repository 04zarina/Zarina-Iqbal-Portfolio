import { store, QualityTier } from './store';
import { eventBus } from './events';

export interface QualityConfig {
  tier: QualityTier;
  maxDPR: number;
  sparkleCount: number;
  livePortal: boolean;
  enableJelly: boolean;
  enableSway: boolean;
  shadowResolution: number;
}

export const QUALITY_CONFIGS: Record<QualityTier, QualityConfig> = {
  high: {
    tier: 'high',
    maxDPR: 2,
    sparkleCount: 150,
    livePortal: true,
    enableJelly: true,
    enableSway: true,
    shadowResolution: 1024
  },
  medium: {
    tier: 'medium',
    maxDPR: 1.5,
    sparkleCount: 60,
    livePortal: true,
    enableJelly: true,
    enableSway: true,
    shadowResolution: 512
  },
  low: {
    tier: 'low',
    maxDPR: 1,
    sparkleCount: 20,
    livePortal: false,
    enableJelly: false,
    enableSway: false,
    shadowResolution: 256
  }
};

class QualityManager {
  private currentTier: QualityTier;
  private fpsHistory: number[] = [];
  private samplingComplete = false;
  private isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  constructor() {
    const saved = localStorage.getItem('quality_tier') as QualityTier;
    if (saved && QUALITY_CONFIGS[saved]) {
      this.currentTier = saved;
      this.samplingComplete = true;
    } else {
      this.currentTier = this.isMobile ? 'medium' : 'high';
    }
    store.set('quality', this.currentTier);
  }

  get config(): QualityConfig {
    return QUALITY_CONFIGS[this.currentTier];
  }

  setTier(tier: QualityTier): void {
    this.currentTier = tier;
    store.set('quality', tier);
    eventBus.emit('quality:change', this.config);
  }

  recordFrame(deltaTime: number): void {
    if (this.samplingComplete || deltaTime <= 0) return;
    const fps = 1 / deltaTime;
    this.fpsHistory.push(fps);

    if (this.fpsHistory.length > 120) {
      // 2 seconds sample completed
      const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
      if (avgFps < 25) {
        this.setTier('low');
      } else if (avgFps < 40 && this.currentTier === 'high') {
        this.setTier('medium');
      }
      this.samplingComplete = true;
    }
  }
}

export const qualityManager = new QualityManager();
