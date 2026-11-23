import * as THREE from 'three';
import { navGrid } from '../nav';
import { sparkleSystem } from '../fx/sparkles';
import { audioManager } from '../../audio/audioManager';
import { floatPop } from '../../ui/floatPop';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';
import { refs } from '../refs';

type SnackKind = 'cookie' | 'berry' | 'star';
interface Snack {
  mesh: THREE.Group;
  marker: THREE.Mesh;
  kind: SnackKind;
  /** Landing spot on the island. */
  spot: THREE.Vector3;
  /** Height above the ground while falling. */
  y: number;
  vy: number;
  /** Seconds left on the ground before it fades away. */
  groundLife: number;
  state: 'falling' | 'ground' | 'eaten' | 'gone';
  t: number;
}

const POINTS: Record<SnackKind, number> = { cookie: 1, berry: 2, star: 5 };
const DURATION = 40;
const BEST_KEY = 'snackrain_best';

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  } catch {
    return 0;
  }
}

/**
 * "Snack Rain": a 40-second game you play WITH Zuzu on the Dev Realm island.
 * Snacks fall from the sky (a glowing ring shows where each one lands). Zuzu follows
 * Zarina and dashes for any snack that lands near her, so steer Zarina toward the rings
 * and Zuzu does the catching. Berries are worth 2, golden stars 5, and quick catches
 * build a combo.
 */
export class SnackRain {
  public running = false;
  private snacks: Snack[] = [];
  private time = 0;
  private score = 0;
  private caught = 0;
  private combo = 0;
  private lastCatch = -10;
  private spawnTimer = 0;
  private hud: HTMLElement;
  private panel: HTMLElement;
  private geos = {
    cookie: new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16),
    chip: new THREE.SphereGeometry(0.025, 6, 5),
    berry: new THREE.SphereGeometry(0.1, 12, 10),
    leaf: new THREE.ConeGeometry(0.05, 0.08, 6),
    star: new THREE.OctahedronGeometry(0.14, 0),
    ring: new THREE.RingGeometry(0.32, 0.4, 28)
  };

  constructor(private parent: THREE.Group, private islandRadius = 4.4) {
    this.hud = document.createElement('div');
    this.hud.className = 'game-hud';
    this.hud.setAttribute('aria-live', 'polite');
    this.panel = document.createElement('div');
    this.panel.className = 'modal-overlay';
    document.body.append(this.hud, this.panel);
  }

  /** Intro card with the rules, then a 3-2-1 countdown. */
  showIntro(): void {
    if (this.running) return;
    const best = readBest();
    store.set('activeOverlay', 'game');
    store.set('inputLocked', true);
    this.panel.innerHTML = `
      <div class="modal-card game-card" role="dialog" aria-modal="true" aria-label="Snack Rain">
        <div class="game-title">🍪 SNACK RAIN</div>
        <p class="game-sub">It's raining snacks over the island and Zuzu is hungry! Help Zuzu catch as many as you can in ${DURATION} seconds.</p>
        <ul class="game-rules">
          <li>A glowing ring shows where each snack will land</li>
          <li><b>Walk Zarina</b> near a ring and <b>Zuzu dashes</b> to catch it</li>
          <li>🍪 1 pt &nbsp; 🫐 2 pts &nbsp; ⭐ 5 pts (rare)</li>
          <li>Catch quickly in a row for a <b>combo</b> bonus</li>
        </ul>
        ${best ? `<p class="game-best">Your best: <b>${best}</b></p>` : ''}
        <div class="game-actions">
          <button class="sticker-btn accent-butter" data-go>Start ▶</button>
          <button class="sticker-btn" data-close>Maybe later</button>
        </div>
      </div>`;
    this.panel.classList.add('active');
    this.panel.querySelector('[data-go]')!.addEventListener('click', () => this.countdown());
    this.panel.querySelector('[data-close]')!.addEventListener('click', () => this.closePanel());
    (this.panel.querySelector('[data-go]') as HTMLElement).focus();
  }

  private closePanel(): void {
    this.panel.classList.remove('active');
    store.set('activeOverlay', 'none');
    store.set('inputLocked', false);
  }

  private countdown(): void {
    this.closePanel();
    // Zuzu joins the game (without opening the chat)
    const zuzu = refs.companion;
    if (zuzu && !zuzu.summoned) eventBus.emit('companion:summon', { quiet: true });
    if (zuzu) zuzu.gameMode = true;
    zuzu?.say("Snacks?! Let's go! 🍪", 2);
    let n = 3;
    this.hud.classList.add('show');
    const tick = () => {
      if (n > 0) {
        this.hud.innerHTML = `<div class="game-count">${n}</div>`;
        audioManager.playPop();
        n--;
        setTimeout(tick, 650);
      } else {
        this.hud.innerHTML = `<div class="game-count">GO!</div>`;
        audioManager.playCoin();
        setTimeout(() => this.start(), 400);
      }
    };
    tick();
  }

  start(): void {
    this.running = true;
    this.time = DURATION;
    this.score = 0;
    this.caught = 0;
    this.combo = 0;
    this.spawnTimer = 0.2;
    this.renderHud();
  }

  private spawn(): void {
    const r = Math.random();
    const kind: SnackKind = r < 0.1 ? 'star' : r < 0.38 ? 'berry' : 'cookie';
    const spot = new THREE.Vector3();
    const av = refs.avatar?.position;
    for (let tries = 0; tries < 24; tries++) {
      // Mostly within a few metres of Zarina so it stays catchable, sometimes anywhere
      const near = av && Math.random() < 0.7;
      const a = Math.random() * Math.PI * 2;
      const d = near ? 1.2 + Math.random() * 2.6 : 0.8 + Math.random() * (this.islandRadius - 1);
      const p = near ? new THREE.Vector3(av!.x + Math.cos(a) * d, 0, av!.z + Math.sin(a) * d) : new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
      if (p.length() < this.islandRadius && navGrid.isWalkable(p)) {
        spot.copy(p);
        break;
      }
    }
    const mesh = this.makeSnack(kind);
    const y = 5 + Math.random() * 1.5;
    mesh.position.set(spot.x, y, spot.z);
    const marker = new THREE.Mesh(
      this.geos.ring,
      new THREE.MeshBasicMaterial({ color: kind === 'star' ? 0xffd23f : kind === 'berry' ? 0xb18cff : 0xffb37a, transparent: true, opacity: 0.0, depthWrite: false })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(spot.x, 0.03, spot.z);
    this.parent.add(mesh, marker);
    this.snacks.push({ mesh, marker, kind, spot, y, vy: -1.2, groundLife: 2.4, state: 'falling', t: 0 });
  }

  private makeSnack(kind: SnackKind): THREE.Group {
    const g = new THREE.Group();
    if (kind === 'cookie') {
      const c = new THREE.Mesh(this.geos.cookie, new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
      g.add(c);
      const chipMat = new THREE.MeshLambertMaterial({ color: 0x5a3a32 });
      for (let i = 0; i < 5; i++) {
        const chip = new THREE.Mesh(this.geos.chip, chipMat);
        chip.position.set(Math.cos(i * 1.3) * 0.07, 0.03, Math.sin(i * 1.3) * 0.07);
        g.add(chip);
      }
    } else if (kind === 'berry') {
      const b = new THREE.Mesh(this.geos.berry, new THREE.MeshLambertMaterial({ color: 0x8e6bff, emissive: 0x3a1f8a, emissiveIntensity: 0.4 }));
      const leaf = new THREE.Mesh(this.geos.leaf, new THREE.MeshLambertMaterial({ color: 0x76b885 }));
      leaf.position.y = 0.11;
      g.add(b, leaf);
    } else {
      const s = new THREE.Mesh(this.geos.star, new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 0.7 }));
      g.add(s);
    }
    return g;
  }

  private catchSnack(s: Snack): void {
    if (s.state === 'eaten' || s.state === 'gone') return;
    s.state = 'eaten';
    s.t = 0;
    this.parent.remove(s.marker);
    const now = DURATION - this.time;
    this.combo = now - this.lastCatch < 2.2 ? this.combo + 1 : 1;
    this.lastCatch = now;
    const mult = this.combo >= 5 ? 3 : this.combo >= 3 ? 2 : 1;
    const pts = POINTS[s.kind] * mult;
    this.score += pts;
    this.caught++;
    audioManager.playSquash(this.combo);
    refs.companion?.cheer();
    const at = s.spot.clone().add(new THREE.Vector3(0, 0.7, 0));
    sparkleSystem.burst(at, s.kind === 'star' ? 18 : 8);
    floatPop(`+${pts}${mult > 1 ? ` x${mult}` : ''}`, at, s.kind === 'star' ? 'gold' : 'pink');
    this.renderHud();
  }

  private renderHud(): void {
    this.hud.innerHTML = `
      <div class="game-pill">⏱️ ${Math.max(0, Math.ceil(this.time))}s</div>
      <div class="game-pill score">🍪 ${this.score}</div>
      ${this.combo >= 2 ? `<div class="game-pill combo">🔥 combo ${this.combo}</div>` : ''}
      <button class="game-pill quit" aria-label="Stop the game">✕</button>`;
    this.hud.querySelector('.quit')?.addEventListener('click', () => this.finish(true));
  }

  /** The snack Zuzu should run for: closest catchable one near Zarina. */
  private pickTarget(): Snack | null {
    const av = refs.avatar?.position;
    const zuzu = refs.companion;
    if (!av || !zuzu) return null;
    let best: Snack | null = null;
    let bestScore = Infinity;
    for (const s of this.snacks) {
      if (s.state !== 'falling' && s.state !== 'ground') continue;
      const fromZarina = Math.hypot(s.spot.x - av.x, s.spot.z - av.z);
      if (fromZarina > 2.4) continue;
      // Prefer snacks about to land and close to Zuzu
      const fromZuzu = Math.hypot(s.spot.x - zuzu.position.x, s.spot.z - zuzu.position.z);
      const score = fromZuzu + (s.state === 'falling' ? s.y * 0.25 : 0) - POINTS[s.kind] * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  update(delta: number): void {
    this.animateSnacks(delta);
    if (!this.running) return;
    this.time -= delta;
    this.spawnTimer -= delta;
    const active = this.snacks.filter((s) => s.state === 'falling' || s.state === 'ground').length;
    if (this.spawnTimer <= 0 && active < 6) {
      this.spawn();
      // Gets a little busier as the clock runs down
      this.spawnTimer = THREE.MathUtils.lerp(0.75, 1.3, this.time / DURATION);
    }
    const zuzu = refs.companion;
    const target = this.pickTarget();
    if (zuzu) zuzu.gameTarget = target ? target.spot.clone() : null;
    if (zuzu) {
      for (const s of this.snacks) {
        if ((s.state === 'ground' || (s.state === 'falling' && s.y < 0.9)) && Math.hypot(s.spot.x - zuzu.position.x, s.spot.z - zuzu.position.z) < 0.45) {
          this.catchSnack(s);
        }
      }
    }
    const prevSec = Math.ceil(this.time + delta);
    if (Math.ceil(this.time) !== prevSec) this.renderHud();
    if (this.time <= 0) this.finish(false);
  }

  private animateSnacks(delta: number): void {
    const t = performance.now() * 0.001;
    for (const s of this.snacks) {
      s.t += delta;
      const m = s.mesh;
      const ringMat = s.marker.material as THREE.MeshBasicMaterial;
      if (s.state === 'falling') {
        s.vy -= 6 * delta;
        s.y += s.vy * delta;
        m.rotation.y += delta * 3;
        m.rotation.x = Math.sin(t * 4 + s.spot.x) * 0.4;
        ringMat.opacity = Math.min(0.85, s.t * 1.5);
        s.marker.scale.setScalar(1 + Math.max(0, s.y) * 0.12);
        if (s.y <= 0.08) {
          s.y = 0.08;
          s.state = 'ground';
          s.t = 0;
        }
      } else if (s.state === 'ground') {
        s.groundLife -= delta;
        m.rotation.y += delta;
        s.y = 0.08 + Math.abs(Math.sin(s.t * 8)) * Math.max(0, 0.1 - s.t * 0.15);
        ringMat.opacity = 0.85 * Math.max(0, s.groundLife / 2.4);
        if (s.groundLife <= 0) {
          s.state = 'gone';
          s.t = 0;
          this.parent.remove(s.marker);
        }
      } else if (s.state === 'eaten') {
        // Pops up toward Zuzu's mouth and shrinks away
        m.scale.setScalar(Math.max(0.01, 1 - s.t * 4));
        s.y += delta * 1.5;
      } else {
        m.scale.setScalar(Math.max(0.01, 1 - s.t * 3));
      }
      m.position.set(s.spot.x, s.y, s.spot.z);
    }
    this.snacks = this.snacks.filter((s) => {
      const done = (s.state === 'eaten' && s.t > 0.3) || (s.state === 'gone' && s.t > 0.35);
      if (done) this.parent.remove(s.mesh, s.marker);
      return !done;
    });
  }

  finish(quit: boolean): void {
    if (!this.running) return;
    this.running = false;
    this.snacks.forEach((s) => {
      if (s.state === 'falling' || s.state === 'ground') {
        s.state = 'gone';
        s.t = 0;
        this.parent.remove(s.marker);
      }
    });
    const zuzu = refs.companion;
    if (zuzu) {
      zuzu.gameMode = false;
      zuzu.gameTarget = null;
    }
    this.hud.classList.remove('show');
    this.hud.innerHTML = '';
    if (quit) return;
    const best = readBest();
    const isBest = this.score > best;
    if (isBest) {
      try {
        localStorage.setItem(BEST_KEY, String(this.score));
      } catch {
        /* private mode */
      }
    }
    const rank = this.score >= 60 ? 'Snack Legend 🏆' : this.score >= 40 ? 'Treat Champion 🌟' : this.score >= 20 ? 'Good Feeder 🍪' : 'Snack Rookie 🐣';
    audioManager.playGameOver(this.score >= 20);
    refs.avatar?.doGesture('cheer');
    zuzu?.say(this.score >= 20 ? 'Yum! Best snack party ever 💕' : 'Mrrp... one more round? 🍪', 3);
    store.completeQuest('snack_rain');
    eventBus.emit('quest:refresh');
    store.set('activeOverlay', 'game');
    store.set('inputLocked', true);
    this.panel.innerHTML = `
      <div class="modal-card game-card" role="dialog" aria-modal="true" aria-label="Snack Rain results">
        <div class="game-title">😋 Yum!</div>
        <p class="game-score">${this.score} <span>points · ${this.caught} snacks</span></p>
        <p class="game-rank">${rank}</p>
        <p class="game-best">${isBest ? '🎉 New personal best!' : `Best: ${Math.max(best, this.score)}`}</p>
        <div class="game-actions">
          <button class="sticker-btn accent-butter" data-again>Play again 🔁</button>
          <button class="sticker-btn" data-close>Done</button>
        </div>
      </div>`;
    this.panel.classList.add('active');
    this.panel.querySelector('[data-again]')!.addEventListener('click', () => this.countdown());
    this.panel.querySelector('[data-close]')!.addEventListener('click', () => this.closePanel());
  }

  dispose(): void {
    this.finish(true);
    this.snacks.forEach((s) => this.parent.remove(s.mesh, s.marker));
    this.snacks = [];
    this.hud.remove();
    this.panel.remove();
    Object.values(this.geos).forEach((g) => g.dispose());
  }
}
