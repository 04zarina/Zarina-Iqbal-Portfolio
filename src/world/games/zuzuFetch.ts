import * as THREE from 'three';
import { navGrid } from '../nav';
import { sparkleSystem } from '../fx/sparkles';
import { audioManager } from '../../audio/audioManager';
import { floatPop } from '../../ui/floatPop';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';
import { refs } from '../refs';

const ROUNDS = 5;
const BEST_KEY = 'zuzu_fetch_best';
type Phase = 'idle' | 'flying' | 'chasing' | 'returning' | 'celebrate';

const PRAISE = ['Got it! 🎾', 'Zoom zoom! 💨', 'Again again! 🐾', 'Best throw ever! 💕', 'Fetch master! ✨'];

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  } catch {
    return 0;
  }
}

/**
 * "Fetch with Zuzu": the simplest possible game. Tap Throw (or press E / Space), Zarina
 * tosses the ball, Zuzu races after it, grabs it and brings it back. Five throws, and
 * Zuzu answers every single one, so it is all about playing with Zuzu.
 */
export class ZuzuFetch {
  public running = false;
  private phase: Phase = 'idle';
  private round = 0;
  private fetched = 0;
  private t = 0;
  private ball: THREE.Mesh;
  private ballFrom = new THREE.Vector3();
  private ballTo = new THREE.Vector3();
  private carrying = false;
  private ballFade = 0;
  private bar: HTMLElement;
  private panel: HTMLElement;
  private throwBtn!: HTMLButtonElement;
  private keyHandler = (e: KeyboardEvent) => {
    if (!this.running || this.phase !== 'idle') return;
    if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.throwBall();
    }
  };

  constructor(private parent: THREE.Group, private islandRadius = 4.3) {
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 14, 10),
      new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xff9b00, emissiveIntensity: 0.55 })
    );
    this.ball.visible = false;
    this.parent.add(this.ball);
    this.bar = document.createElement('div');
    this.bar.className = 'fetch-bar';
    this.panel = document.createElement('div');
    this.panel.className = 'modal-overlay';
    document.body.append(this.bar, this.panel);
    window.addEventListener('keydown', this.keyHandler, true);
  }

  showIntro(): void {
    if (this.running) return;
    const best = readBest();
    store.set('activeOverlay', 'game');
    store.set('inputLocked', true);
    this.panel.innerHTML = `
      <div class="modal-card game-card" role="dialog" aria-modal="true" aria-label="Fetch with Zuzu">
        <div class="game-title">🎾 FETCH WITH ZUZU</div>
        <p class="game-sub">Throw the ball and Zuzu brings it back. That's it!</p>
        <ul class="game-rules">
          <li>Tap <b>Throw</b> (or press <b>E</b>) to toss the ball. You can still walk around!</li>
          <li>Zuzu runs, grabs it and brings it back to you</li>
          <li>Play ${ROUNDS} rounds and make Zuzu happy 💕</li>
        </ul>
        ${best ? `<p class="game-best">Your best: <b>${best}/${ROUNDS}</b></p>` : ''}
        <div class="game-actions">
          <button class="sticker-btn accent-butter" data-go>Let's play ▶</button>
          <button class="sticker-btn" data-close>Maybe later</button>
        </div>
      </div>`;
    this.panel.classList.add('active');
    this.panel.querySelector('[data-go]')!.addEventListener('click', () => this.begin());
    this.panel.querySelector('[data-close]')!.addEventListener('click', () => this.closePanel());
    (this.panel.querySelector('[data-go]') as HTMLElement).focus();
  }

  private closePanel(): void {
    this.panel.classList.remove('active');
    store.set('activeOverlay', 'none');
    store.set('inputLocked', false);
  }

  private begin(): void {
    this.panel.classList.remove('active');
    // Zarina can still walk around (WASD / stick): Zuzu fetches wherever she stands
    store.set('activeOverlay', 'none');
    store.set('inputLocked', false);
    const zuzu = refs.companion;
    if (zuzu && !zuzu.summoned) eventBus.emit('companion:summon', { quiet: true });
    if (zuzu) {
      zuzu.gameMode = true;
      zuzu.gameTarget = null;
      zuzu.say('Ooh, a ball?! Throw it, throw it! 🎾', 2.5);
    }
    this.running = true;
    this.phase = 'idle';
    this.round = 0;
    this.fetched = 0;
    this.carrying = false;
    this.ball.visible = false;
    this.renderBar();
  }

  private renderBar(): void {
    const idle = this.phase === 'idle';
    const label = idle ? '🎾 Throw!' : 'Zuzu is fetching…';
    this.bar.innerHTML = `
      <div class="game-pill">🎾 ${Math.min(this.round, ROUNDS)}/${ROUNDS}</div>
      <button class="fetch-throw" ${idle ? '' : 'disabled'}>${label}</button>
      <button class="game-pill quit" aria-label="Stop the game">✕</button>`;
    this.bar.classList.add('show');
    this.throwBtn = this.bar.querySelector('.fetch-throw') as HTMLButtonElement;
    this.throwBtn.addEventListener('click', () => this.throwBall());
    this.bar.querySelector('.quit')?.addEventListener('click', () => this.finish(true));
  }

  private throwBall(): void {
    const av = refs.avatar;
    const zuzu = refs.companion;
    if (!this.running || this.phase !== 'idle' || !av || !zuzu) return;
    this.round++;
    // Land 2.5 to 3.8 m ahead of Zarina, a little to either side, on walkable ground
    let spot = av.position.clone();
    for (let tries = 0; tries < 30; tries++) {
      const a = av.rotationY + (Math.random() - 0.5) * 1.4 + (tries > 10 ? Math.PI * (tries % 2 ? 1 : 0) : 0);
      const d = 2.5 + Math.random() * 1.3;
      const p = new THREE.Vector3(av.position.x + Math.sin(a) * d, 0, av.position.z + Math.cos(a) * d);
      if (p.length() < this.islandRadius && navGrid.isWalkable(p)) {
        spot = p;
        break;
      }
    }
    this.ballFrom.set(av.position.x, 1.2, av.position.z);
    this.ballTo.copy(spot).setY(0.11);
    this.ball.position.copy(this.ballFrom);
    this.ballFade = 0;
    this.ball.scale.setScalar(1);
    this.ball.visible = true;
    this.carrying = false;
    this.phase = 'flying';
    this.t = 0;
    audioManager.playPop();
    // Zuzu sets off right away, watching the ball land
    zuzu.gameTarget = spot.clone();
    zuzu.say('Wheee! 🐾', 1.2);
    this.renderBar();
  }

  update(delta: number): void {
    if (!this.running) return;
    const zuzu = refs.companion;
    const av = refs.avatar;
    if (!zuzu || !av) return;
    this.t += delta;

    if (this.phase === 'flying') {
      const k = Math.min(1, this.t / 0.8);
      this.ball.position.lerpVectors(this.ballFrom, this.ballTo, k);
      this.ball.position.y = THREE.MathUtils.lerp(this.ballFrom.y, this.ballTo.y, k) + Math.sin(k * Math.PI) * 1.6;
      if (k >= 1) {
        this.phase = 'chasing';
        this.t = 0;
        sparkleSystem.burst(this.ballTo.clone().setY(0.2), 5);
      }
    } else if (this.phase === 'chasing') {
      const d = Math.hypot(zuzu.position.x - this.ballTo.x, zuzu.position.z - this.ballTo.z);
      if (d < 0.3 || this.t > 6) {
        this.carrying = true;
        this.phase = 'returning';
        this.t = 0;
        audioManager.playPickup();
        zuzu.say('Got it!', 1);
      }
    } else if (this.phase === 'returning') {
      // Bring it back to Zarina's feet
      const f = new THREE.Vector3(Math.sin(av.rotationY), 0, Math.cos(av.rotationY));
      zuzu.gameTarget = av.position.clone().addScaledVector(f, 0.85);
      const d = Math.hypot(zuzu.position.x - zuzu.gameTarget.x, zuzu.position.z - zuzu.gameTarget.z);
      if (d < 0.55 || this.t > 7) {
        this.carrying = false;
        this.fetched++;
        this.phase = this.round >= ROUNDS ? 'celebrate' : 'idle';
        this.ballFade = 0.4;
        this.t = 0;
        this.ball.position.set(zuzu.gameTarget.x, 0.11, zuzu.gameTarget.z);
        zuzu.gameTarget = null;
        zuzu.cheer();
        zuzu.say(PRAISE[(this.round - 1) % PRAISE.length], 1.6);
        audioManager.playCoin();
        const at = zuzu.position.clone().add(new THREE.Vector3(0, 0.8, 0));
        sparkleSystem.burst(at, 12);
        floatPop('+1', at, 'heart');
        this.renderBar();
      }
    } else if (this.phase === 'celebrate' && this.t > 0.9) {
      this.finish(false);
    }

    if (this.ballFade > 0) {
      this.ballFade -= delta;
      this.ball.scale.setScalar(Math.max(0.01, this.ballFade / 0.4));
      if (this.ballFade <= 0) {
        this.ball.visible = false;
        this.ball.scale.setScalar(1);
      }
    }

    if (this.carrying) {
      this.ball.position.set(zuzu.position.x, zuzu.position.y + 0.42, zuzu.position.z);
    }
  }

  finish(quit: boolean): void {
    if (!this.running) return;
    this.running = false;
    this.phase = 'idle';
    this.carrying = false;
    this.ball.visible = false;
    this.ball.scale.setScalar(1);
    const zuzu = refs.companion;
    if (zuzu) {
      zuzu.gameMode = false;
      zuzu.gameTarget = null;
    }
    this.bar.classList.remove('show');
    this.bar.innerHTML = '';
    if (quit) {
      this.closePanel();
      return;
    }
    const best = readBest();
    const isBest = this.fetched > best;
    if (isBest) {
      try {
        localStorage.setItem(BEST_KEY, String(this.fetched));
      } catch {
        /* private mode */
      }
    }
    audioManager.playGameOver(true);
    refs.avatar?.doGesture('cheer');
    zuzu?.say('That was SO fun! Again? 💕', 3);
    store.completeQuest('play_fetch');
    eventBus.emit('quest:refresh');
    store.set('activeOverlay', 'game');
    store.set('inputLocked', true);
    this.panel.innerHTML = `
      <div class="modal-card game-card" role="dialog" aria-modal="true" aria-label="Fetch results">
        <div class="game-title">💕 Zuzu is happy!</div>
        <p class="game-score">${this.fetched}/${ROUNDS} <span>fetches</span></p>
        <p class="game-rank">Best buddies 🐾</p>
        <div class="game-actions">
          <button class="sticker-btn accent-butter" data-again>Play again 🔁</button>
          <button class="sticker-btn" data-close>Done</button>
        </div>
      </div>`;
    this.panel.classList.add('active');
    this.panel.querySelector('[data-again]')!.addEventListener('click', () => this.begin());
    this.panel.querySelector('[data-close]')!.addEventListener('click', () => this.closePanel());
  }

  dispose(): void {
    this.finish(true);
    window.removeEventListener('keydown', this.keyHandler, true);
    this.parent.remove(this.ball);
    this.ball.geometry.dispose();
    (this.ball.material as THREE.Material).dispose();
    this.bar.remove();
    this.panel.remove();
  }
}
