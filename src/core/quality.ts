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
    maxDPR: 1.5,
    sparkleCount: 150,
    livePortal: true,
    enableJelly: true,
    enableSway: true,
    shadowResolution: 1024
  },
  medium: {
    tier: 'medium',
    maxDPR: 1,
    sparkleCount: 60,
    livePortal: true,
    enableJelly: true,
    enableSway: true,
    shadowResolution: 512
  },
  low: {
    tier: 'low',
    maxDPR: 0.75,
    sparkleCount: 20,
    livePortal: false,
    enableJelly: false,
    enableSway: false,
    shadowResolution: 256
  }
};

const ORDER: QualityTier[] = ['high', 'medium', 'low'];

/**
 * Picks the render quality. Unless the visitor chose a tier in the menu, it keeps watching the
 * frame rate and steps down a tier (lower pixel ratio, fewer effects) whenever the last ~2 s
 * averaged under 45 fps, so laptops with integrated graphics settle on a smooth tier.
 */
class QualityManager {
  private currentTier: QualityTier;
  private manual: boolean;
  private window: number[] = [];
  private warmup = 3; // seconds to ignore after start/tier change (shader compiles, loading)
  private isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  constructor() {
    let saved: QualityTier | null = null;
    let manual = false;
    try {
      saved = localStorage.getItem('quality_tier') as QualityTier;
      manual = localStorage.getItem('quality_manual') === '1';
    } catch {
      /* storage blocked */
    }
    this.manual = manual && !!saved && !!QUALITY_CONFIGS[saved];
    // Auto mode starts from the last tier that ran smoothly here (never above the default)
    const def: QualityTier = this.isMobile ? 'medium' : 'high';
    this.currentTier = saved && QUALITY_CONFIGS[saved] && (this.manual || ORDER.indexOf(saved) >= ORDER.indexOf(def)) ? saved : def;
    store.set('quality', this.currentTier);
  }

  get config(): QualityConfig {
    return QUALITY_CONFIGS[this.currentTier];
  }

  /** `manual` = picked by the visitor in a menu: stop auto-adjusting. */
  setTier(tier: QualityTier, manual = false): void {
    this.currentTier = tier;
    if (manual) {
      this.manual = true;
      try {
        localStorage.setItem('quality_manual', '1');
      } catch {
        /* storage blocked */
      }
    }
    this.window = [];
    this.warmup = 3;
    store.set('quality', tier);
    eventBus.emit('quality:change', this.config);
  }

  recordFrame(deltaTime: number): void {
    if (this.manual || deltaTime <= 0 || document.hidden) return;
    if (this.warmup > 0) {
      this.warmup -= deltaTime;
      return;
    }
    this.window.push(deltaTime);
    if (this.window.length < 120) return;
    const avgFps = this.window.length / this.window.reduce((a, b) => a + b, 0);
    this.window = [];
    const i = ORDER.indexOf(this.currentTier);
    if (avgFps < 45 && i < ORDER.length - 1) this.setTier(ORDER[i + 1]);
  }
}

export const qualityManager = new QualityManager();
