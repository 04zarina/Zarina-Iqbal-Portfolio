import * as THREE from 'three';
import { clickSystem } from '../clickables';
import { navGrid } from '../nav';
import { sparkleSystem } from '../fx/sparkles';
import { audioManager } from '../../audio/audioManager';
import { floatPop } from '../../ui/floatPop';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';
import { refs } from '../refs';

type BugKind = 'green' | 'red' | 'gold';
interface Bug {
  mesh: THREE.Group;
  kind: BugKind;
  heading: number;
  speed: number;
  turnTimer: number;
  alive: boolean;
  squashT: number;
}

const POINTS: Record<BugKind, number> = { green: 1, red: 2, gold: 5 };
const COLORS: Record<BugKind, number> = { green: 0x7ed957, red: 0xff6b6b, gold: 0xffd23f };
const DURATION = 30;
const BEST_KEY = 'bugbash_best';

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  } catch {
    return 0;
  }
}

/**
 * "Bug Bash": a 30-second mini game on the Dev Realm island. Bugs escaped from the
 * codebase scurry around; walk into them or click them to squash them before release.
 * Gold bugs are worth more, and quick squashes build a combo.
 */
export class BugBash {
  public running = false;
  private bugs: Bug[] = [];
  private time = 0;
  private score = 0;
  private combo = 0;
  private lastSquash = -10;
  private spawnTimer = 0;
  private hud: HTMLElement;
  private panel: HTMLElement;

  constructor(private parent: THREE.Group, private islandRadius = 4.6) {
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
      <div class="modal-card game-card" role="dialog" aria-modal="true" aria-label="Bug Bash">
        <div class="game-title">🐞 BUG BASH</div>
        <p class="game-sub">Bugs escaped from the build! Squash as many as you can in ${DURATION} seconds before release.</p>
        <ul class="game-rules">
          <li><b>Walk into</b> a bug or <b>click</b> it to squash it</li>
          <li><span style="color:#59B87A">●</span> 1 pt &nbsp; <span style="color:#E05A5A">●</span> 2 pts (fast) &nbsp; <span style="color:#D9A70F">●</span> 5 pts (rare)</li>
          <li>Squash quickly in a row for a <b>combo</b> bonus</li>
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
    this.combo = 0;
    this.spawnTimer = 0;
    for (let i = 0; i < 7; i++) this.spawn();
    this.renderHud();
  }

  private spawn(): void {
    const r = Math.random();
    const kind: BugKind = r < 0.1 ? 'gold' : r < 0.35 ? 'red' : 'green';
    const mesh = this.makeBug(kind);
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = 1 + Math.random() * (this.islandRadius - 1.2);
      const p = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
      const av = refs.avatar?.position;
      if (navGrid.isWalkable(p) && (!av || av.distanceTo(p) > 1.4)) {
        mesh.position.copy(p);
        break;
      }
    }
    mesh.scale.setScalar(0.01);
    this.parent.add(mesh);
    const bug: Bug = { mesh, kind, heading: Math.random() * Math.PI * 2, speed: kind === 'red' ? 1.9 : kind === 'gold' ? 1.5 : 0.9, turnTimer: 0, alive: true, squashT: 0 };
    this.bugs.push(bug);
    clickSystem.register(mesh, `🐞 Squash! (+${POINTS[kind]})`, () => this.squash(bug));
  }

  private makeBug(kind: BugKind): THREE.Group {
    const g = new THREE.Group();
    const shell = new THREE.MeshLambertMaterial({ color: COLORS[kind], emissive: COLORS[kind], emissiveIntensity: 0.35 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2238 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), shell);
    body.scale.set(1, 0.6, 1.25);
    body.position.y = 0.12;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), dark);
    head.position.set(0, 0.12, 0.2);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeMat);
    e1.position.set(0.04, 0.16, 0.26);
    const e2 = e1.clone();
    e2.position.x = -0.04;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.36), dark);
    stripe.position.set(0, 0.215, -0.01);
    for (let i = 0; i < 6; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14), dark);
      const side = i < 3 ? 1 : -1;
      leg.position.set(side * 0.15, 0.05, -0.1 + (i % 3) * 0.1);
      leg.rotation.z = side * 1.0;
      leg.name = 'leg';
      g.add(leg);
    }
    const ant1 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12), dark);
    ant1.position.set(0.03, 0.2, 0.27);
    ant1.rotation.x = 0.8;
    const ant2 = ant1.clone();
    ant2.position.x = -0.03;
    g.add(body, head, e1, e2, stripe, ant1, ant2);
    if (kind === 'gold') {
      const halo = new THREE.PointLight(0xffd23f, 0.8, 1.5);
      halo.position.y = 0.4;
      g.add(halo);
    }
    return g;
  }

  private squash(bug: Bug): void {
    if (!bug.alive || !this.running) return;
    bug.alive = false;
    clickSystem.unregister(bug.mesh);
    const now = DURATION - this.time;
    this.combo = now - this.lastSquash < 1.3 ? this.combo + 1 : 1;
    this.lastSquash = now;
    const pts = POINTS[bug.kind] * (this.combo >= 5 ? 3 : this.combo >= 3 ? 2 : 1);
    this.score += pts;
    audioManager.playSquash(this.combo);
    sparkleSystem.burst(bug.mesh.position.clone().add(new THREE.Vector3(0, 0.3, 0)), bug.kind === 'gold' ? 18 : 8);
    floatPop(`+${pts}${this.combo >= 3 ? ` x${this.combo >= 5 ? 3 : 2}` : ''}`, bug.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)), bug.kind === 'gold' ? 'gold' : 'pink');
    this.renderHud();
  }

  private renderHud(): void {
    this.hud.innerHTML = `
      <div class="game-pill">⏱️ ${Math.ceil(this.time)}s</div>
      <div class="game-pill score">🐞 ${this.score}</div>
      ${this.combo >= 2 ? `<div class="game-pill combo">🔥 combo ${this.combo}</div>` : ''}
      <button class="game-pill quit" aria-label="Stop the game">✕</button>`;
    this.hud.querySelector('.quit')?.addEventListener('click', () => this.finish(true));
  }

  update(delta: number): void {
    if (!this.running) {
      // finish squash animations after the game ends
      this.animateBugs(delta);
      return;
    }
    this.time -= delta;
    this.spawnTimer -= delta;
    const alive = this.bugs.filter((b) => b.alive).length;
    if (this.spawnTimer <= 0 && alive < 9) {
      this.spawn();
      this.spawnTimer = 0.9;
    }
    // Walk-into squashing
    const av = refs.avatar?.position;
    if (av) {
      this.bugs.forEach((b) => {
        if (b.alive && Math.hypot(b.mesh.position.x - av.x, b.mesh.position.z - av.z) < 0.55) this.squash(b);
      });
    }
    this.animateBugs(delta);
    const prevSec = Math.ceil(this.time + delta);
    if (Math.ceil(this.time) !== prevSec) this.renderHud();
    if (this.time <= 0) this.finish(false);
  }

  private animateBugs(delta: number): void {
    const t = performance.now() * 0.001;
    this.bugs.forEach((b) => {
      const m = b.mesh;
      if (!b.alive) {
        b.squashT += delta;
        m.scale.set(1 + b.squashT * 3, Math.max(0.05, 1 - b.squashT * 6), 1 + b.squashT * 3);
        if (b.squashT > 0.35) {
          this.parent.remove(m);
        }
        return;
      }
      if (m.scale.x < 1) m.scale.setScalar(Math.min(1, m.scale.x + delta * 4));
      b.turnTimer -= delta;
      if (b.turnTimer <= 0) {
        b.heading += (Math.random() - 0.5) * 2.2;
        b.turnTimer = 0.5 + Math.random() * 1.2;
      }
      // Scurry away from the avatar when she gets close
      const av = refs.avatar?.position;
      if (av && b.kind !== 'green') {
        const dx = m.position.x - av.x;
        const dz = m.position.z - av.z;
        if (dx * dx + dz * dz < 2.2) b.heading = Math.atan2(dx, dz) + Math.sin(t * 3) * 0.6;
      }
      const next = m.position.clone().add(new THREE.Vector3(Math.sin(b.heading), 0, Math.cos(b.heading)).multiplyScalar(b.speed * delta));
      if (next.length() > this.islandRadius || !navGrid.isWalkable(next)) {
        b.heading += Math.PI * (0.6 + Math.random() * 0.8);
      } else m.position.copy(next);
      m.rotation.y = b.heading;
      m.position.y = Math.abs(Math.sin(t * 18 + b.heading)) * 0.02;
      m.children.forEach((c, i) => {
        if (c.name === 'leg') c.rotation.x = Math.sin(t * 25 + i) * 0.5;
      });
    });
    this.bugs = this.bugs.filter((b) => b.alive || b.squashT <= 0.35);
  }

  finish(quit: boolean): void {
    if (!this.running) return;
    this.running = false;
    this.bugs.forEach((b) => {
      if (b.alive) {
        b.alive = false;
        clickSystem.unregister(b.mesh);
      }
    });
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
    const rank = this.score >= 45 ? 'Legendary Debugger 🏆' : this.score >= 30 ? 'Lead QA 🌟' : this.score >= 15 ? 'Bug Hunter 🔍' : 'QA Intern 🐣';
    audioManager.playGameOver(this.score >= 15);
    refs.avatar?.doGesture('cheer');
    store.completeQuest('bug_bash');
    eventBus.emit('quest:refresh');
    store.set('activeOverlay', 'game');
    store.set('inputLocked', true);
    this.panel.innerHTML = `
      <div class="modal-card game-card" role="dialog" aria-modal="true" aria-label="Bug Bash results">
        <div class="game-title">🚀 Shipped!</div>
        <p class="game-score">${this.score} <span>points</span></p>
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
    this.bugs.forEach((b) => this.parent.remove(b.mesh));
    this.bugs = [];
    this.hud.remove();
    this.panel.remove();
  }
}
