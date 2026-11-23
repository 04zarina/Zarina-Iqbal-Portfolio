import * as THREE from 'three';
import { store, ThemeMode } from '../core/store';
import { eventBus } from '../core/events';

const WARM_ROOM = new THREE.Color(0xFFE2C2);

export class ThemeManager {
  public currentTheme: ThemeMode;
  public themeProgress = 0; // 0 = day, 1 = dusk
  private targetProgress = 0;

  // Colors
  public dayBg = new THREE.Color(0xFFC9B0); // Peach
  public duskBg = new THREE.Color(0x281D35); // Dusk dark plum/lavender

  public dayLightColor = new THREE.Color(0xFFFAF0);
  public duskLightColor = new THREE.Color(0xFFD08A);

  public dayAmbient = new THREE.Color(0xFFE9A3);
  public duskAmbient = new THREE.Color(0x6B4A7A);

  /** Indoor light at night (1 = lights on, 0 = dark room, e.g. bedroom lamp off). */
  private interior = 1;
  private interiorTarget = 1;
  private ambientLight: THREE.AmbientLight | null = null;
  private dirLight: THREE.DirectionalLight | null = null;
  private scene: THREE.Scene | null = null;

  constructor() {
    this.currentTheme = store.get().theme;
    this.themeProgress = this.currentTheme === 'dusk' ? 1 : 0;
    this.targetProgress = this.themeProgress;

    eventBus.on('theme:toggle', () => this.toggleTheme());
    eventBus.on('state:theme', (theme: ThemeMode) => {
      this.currentTheme = theme;
      this.targetProgress = theme === 'dusk' ? 1 : 0;
    });
  }

  attachScene(scene: THREE.Scene, ambient: THREE.AmbientLight, dir: THREE.DirectionalLight): void {
    this.scene = scene;
    this.ambientLight = ambient;
    this.dirLight = dir;
    this.applyTheme(this.themeProgress);
  }

  toggleTheme(): void {
    const nextTheme: ThemeMode = this.currentTheme === 'day' ? 'dusk' : 'day';
    store.set('theme', nextTheme);
  }

  /** Dim or brighten the room at night (the bedroom lamp uses this). */
  setInteriorLight(v: number, instant = false): void {
    this.interiorTarget = v;
    if (instant) {
      this.interior = v;
      this.applyTheme(this.themeProgress);
    }
  }

  get interiorLight(): number {
    return this.interior;
  }

  update(delta: number): void {
    if (Math.abs(this.interior - this.interiorTarget) > 0.005) {
      this.interior += (this.interiorTarget - this.interior) * Math.min(delta * 5, 1);
      this.applyTheme(this.themeProgress);
    }
    if (Math.abs(this.themeProgress - this.targetProgress) > 0.005) {
      this.themeProgress += (this.targetProgress - this.themeProgress) * Math.min(delta * 4, 1);
      this.applyTheme(this.themeProgress);
    } else {
      this.themeProgress = this.targetProgress;
    }
  }

  private applyTheme(p: number): void {
    if (!this.scene) return;

    const bg = this.dayBg.clone().lerp(this.duskBg, p);
    this.scene.background = bg;
    if (this.scene.fog) {
      this.scene.fog.color = bg;
    }

    if (this.ambientLight) {
      // At night the room lights (interior) swap the cool moonlit ambient for a warm indoor fill
      this.ambientLight.color.copy(this.dayAmbient).lerp(this.duskAmbient, p).lerp(WARM_ROOM, p * this.interior * 0.35);
      this.ambientLight.intensity = THREE.MathUtils.lerp(1.2, THREE.MathUtils.lerp(0.32, 0.72, this.interior), p);
    }

    if (this.dirLight) {
      this.dirLight.color.copy(this.dayLightColor).lerp(this.duskLightColor, p).lerp(WARM_ROOM, p * this.interior * 0.3);
      this.dirLight.intensity = THREE.MathUtils.lerp(1.4, THREE.MathUtils.lerp(0.35, 0.62, this.interior), p);
    }

    eventBus.emit('theme:updated', { progress: p, mode: this.currentTheme });
  }
}

export const themeManager = new ThemeManager();
