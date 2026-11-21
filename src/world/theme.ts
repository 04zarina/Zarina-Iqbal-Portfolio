import * as THREE from 'three';
import { store, ThemeMode } from '../core/store';
import { eventBus } from '../core/events';

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

  update(delta: number): void {
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
      this.ambientLight.color.copy(this.dayAmbient).lerp(this.duskAmbient, p);
      this.ambientLight.intensity = THREE.MathUtils.lerp(1.2, 0.7, p);
    }

    if (this.dirLight) {
      this.dirLight.color.copy(this.dayLightColor).lerp(this.duskLightColor, p);
      this.dirLight.intensity = THREE.MathUtils.lerp(1.4, 0.8, p);
    }

    eventBus.emit('theme:updated', { progress: p, mode: this.currentTheme });
  }
}

export const themeManager = new ThemeManager();
