import * as THREE from 'three';
import { store, RoomId } from '../core/store';
import { eventBus } from '../core/events';
import { interactionSystem } from '../world/interaction';
import { audioManager } from '../audio/audioManager';
import { qualityManager } from '../core/quality';
import { profile } from '../content/profile';

export class HUD {
  private container: HTMLElement;
  private roomButtons: Map<RoomId, HTMLButtonElement> = new Map();
  private promptBubble: HTMLElement;
  private joystickZone: HTMLElement;
  private joystickKnob: HTMLElement;
  private actionZone: HTMLElement;

  private promptTarget3D: THREE.Vector3 | null = null;
  private promptId = '';
  /** Zuzu's speech bubble is showing: hide Zuzu's own prompt so only one bubble sits over it. */
  private zuzuTalking = false;
  private joystickActive = false;
  private joystickTouchId: number | null = null;
  private joystickCenter = { x: 0, y: 0 };

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'hud-container';
    document.getElementById('ui-layer')?.appendChild(this.container);

    // 1. Top Left: Visible Scene / Room Navigation Bar
    const topLeft = document.createElement('div');
    topLeft.className = 'hud-top-left';

    const roomBar = document.createElement('div');
    roomBar.className = 'hud-room-bar';

    const rooms: { id: RoomId; label: string }[] = [
      { id: 'bedroom', label: '🏠 Bedroom' },
      { id: 'gameRoom', label: '🕹️ Arcade' },
      { id: 'greenhouse', label: '🌿 Greenhouse' },
      { id: 'study', label: '📚 Study' },
      { id: 'devRealm', label: '☁️ Dev Realm' }
    ];

    rooms.forEach((r) => {
      const btn = document.createElement('button');
      btn.className = 'hud-room-btn';
      btn.innerText = r.label;
      if (store.get().currentRoom === r.id) {
        btn.classList.add('active');
      }
      btn.onclick = () => {
        audioManager.playPop();
        roomBar.classList.remove('open');
        roomToggle.setAttribute('aria-expanded', 'false');
        eventBus.emit('room:travel', r.id);
      };
      roomBar.appendChild(btn);
      this.roomButtons.set(r.id, btn);
    });

    // Phones: one compact "where am I" chip that opens the room list (instead of five pills)
    const roomToggle = document.createElement('button');
    roomToggle.className = 'hud-room-toggle';
    roomToggle.setAttribute('aria-haspopup', 'true');
    roomToggle.setAttribute('aria-expanded', 'false');
    roomToggle.setAttribute('aria-label', 'Rooms');
    const setToggleLabel = (id: RoomId) => {
      const r = rooms.find((x) => x.id === id);
      roomToggle.innerHTML = `${r ? r.label : '🏠 Rooms'} <span aria-hidden="true">▾</span>`;
    };
    setToggleLabel(store.get().currentRoom);
    eventBus.on('room:entered', (id: RoomId) => setToggleLabel(id));
    roomToggle.onclick = (e) => {
      e.stopPropagation();
      audioManager.playPop();
      const open = !roomBar.classList.contains('open');
      roomBar.classList.toggle('open', open);
      roomToggle.setAttribute('aria-expanded', String(open));
    };
    document.addEventListener('pointerdown', (e) => {
      if (roomBar.classList.contains('open') && !roomBar.contains(e.target as Node) && !roomToggle.contains(e.target as Node)) {
        roomBar.classList.remove('open');
        roomToggle.setAttribute('aria-expanded', 'false');
      }
    });

    topLeft.append(roomToggle, roomBar);
    this.container.appendChild(topLeft);

    // 2. Top Right Control Buttons
    const topRight = document.createElement('div');
    topRight.className = 'hud-top-right';

    // Ask Zuzu / Need Help Button (Always visible on screen!)
    const askZuzuBtn = document.createElement('button');
    askZuzuBtn.className = 'sticker-btn accent-butter hud-ask-zuzu-btn';
    askZuzuBtn.innerHTML = '🐾 <span class="hud-ask-label">Need Help? Ask Zuzu!</span>';
    askZuzuBtn.onclick = () => {
      audioManager.playPop();
      eventBus.emit('companion:summon');
    };

    // Showreel: always one click away (the TV in the bedroom plays the same video)
    const reelBtn = document.createElement('button');
    reelBtn.className = 'sticker-btn accent-mint hud-reel-btn';
    reelBtn.innerHTML = '\u25B6 <span class="hud-ask-label">Showreel</span>';
    reelBtn.setAttribute('aria-label', 'Watch the showreel');
    reelBtn.onclick = () => this.openShowreel();

    // Journal stays on the bar; everything else lives in the ☰ menu to keep the screen clean
    const journalBtn = document.createElement('button');
    journalBtn.className = 'hud-icon-btn';
    journalBtn.title = 'Explorer Journal (quests, map, achievements)';
    journalBtn.innerHTML = '📖';
    journalBtn.onclick = () => {
      audioManager.playPop();
      store.set('activeOverlay', 'journal');
      eventBus.emit('overlay:open', 'journal');
    };

    const menuBtn = document.createElement('button');
    menuBtn.className = 'hud-icon-btn hud-burger';
    menuBtn.title = 'Menu and settings';
    menuBtn.setAttribute('aria-haspopup', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.innerHTML = '<span></span><span></span><span></span>';
    const menu = this.buildMenu();
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      audioManager.playPop();
      const open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      if (open) this.refreshMenu(menu);
    };
    document.addEventListener('pointerdown', (e) => {
      if (menu.classList.contains('open') && !menu.contains(e.target as Node) && e.target !== menuBtn && !menuBtn.contains(e.target as Node)) {
        menu.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        menu.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });

    [journalBtn, menuBtn].forEach((b) => b.setAttribute('aria-label', b.title));
    askZuzuBtn.setAttribute('aria-label', 'Ask Zuzu, the chat guide');
    topRight.append(reelBtn, askZuzuBtn, journalBtn, menuBtn, menu);
    this.container.appendChild(topRight);

    // 3. Prompt Bubble (Projected 3D Sticker)
    this.promptBubble = document.createElement('div');
    this.promptBubble.className = 'prompt-bubble';
    this.promptBubble.style.display = 'none';
    this.promptBubble.onclick = () => {
      interactionSystem.triggerCurrent();
    };
    this.container.appendChild(this.promptBubble);

    // 4. Mobile Joystick & Action Button
    this.joystickZone = document.createElement('div');
    this.joystickZone.className = 'joystick-zone';
    this.joystickKnob = document.createElement('div');
    this.joystickKnob.className = 'joystick-knob';
    this.joystickZone.appendChild(this.joystickKnob);

    this.actionZone = document.createElement('div');
    this.actionZone.className = 'action-btn-zone';
    const actionBtn = document.createElement('button');
    actionBtn.className = 'action-big-btn';
    actionBtn.innerHTML = '<span aria-hidden="true">✋</span><small>USE</small>';
    actionBtn.setAttribute('aria-label', 'Use / interact');
    actionBtn.onclick = () => {
      interactionSystem.triggerCurrent();
    };
    this.actionZone.appendChild(actionBtn);

    this.container.append(this.joystickZone, this.actionZone);

    this.initEvents();
    this.initJoystickTouch();
  }

  private openShowreel(): void {
    audioManager.playPop();
    store.set('activeOverlay', 'tv');
    store.set('tvPlaying', true);
    store.completeQuest('watch_reel');
    eventBus.emit('overlay:open', 'tv');
  }

  /** The ☰ dropdown: view, sound, travel, quality and shortcuts. */
  private buildMenu(): HTMLElement {
    const menu = document.createElement('div');
    menu.className = 'hud-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <div class="hud-menu-section">
        <div class="hud-menu-title">Quick actions</div>
        <div class="hud-menu-grid">
          <button data-act="reel">▶ Watch showreel</button>
          <button data-act="library">🗂️ All projects</button>
          <button data-act="face">👀 See her face</button>
          <button data-act="wave">👋 Wave</button>
          <button data-act="theme"><span data-theme-label></span></button>
        </div>
      </div>
      <div class="hud-menu-section">
        <div class="hud-menu-title">Sound</div>
        <button class="hud-menu-row" data-act="mute"><span data-mute-label></span></button>
        <label class="hud-slider">🎵 Music <input type="range" min="0" max="1" step="0.05" data-vol="music" /></label>
        <label class="hud-slider">✨ Effects <input type="range" min="0" max="1" step="0.05" data-vol="sfx" /></label>
      </div>
      <div class="hud-menu-section">
        <div class="hud-menu-title">Getting around</div>
        <div class="hud-seg" data-seg="travel">
          <button data-val="walk" title="Room buttons make her walk there herself">🚶 Auto walk</button>
          <button data-val="instant" title="Room buttons jump straight to the room">⚡ Instant</button>
        </div>
        <p class="hud-menu-hint">Click the floor to walk there. WASD / arrows to move, Shift to run, drag to look around, F to see her face.</p>
      </div>
      <div class="hud-menu-section">
        <div class="hud-menu-title">Graphics</div>
        <div class="hud-seg" data-seg="quality">
          <button data-val="high">High</button><button data-val="medium">Medium</button><button data-val="low">Low</button>
        </div>
      </div>
      <div class="hud-menu-section hud-menu-links">
        <a href="${profile.resume}" download="Zarina_Iqbal_Resume.pdf">⬇️ Resume (PDF)</a>
        <a href="/classic">📄 2D classic view</a>
        <button data-act="credits">ℹ️ Credits</button>
      </div>`;
    menu.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!btn) return;
      const act = btn.dataset.act;
      const seg = (btn.parentElement as HTMLElement)?.dataset.seg;
      audioManager.playPop();
      if (act === 'reel') {
        menu.classList.remove('open');
        this.openShowreel();
      } else if (act === 'library') {
        store.set('activeOverlay', 'library');
        eventBus.emit('overlay:open', 'library');
        menu.classList.remove('open');
      } else if (act === 'face') {
        eventBus.emit('camera:face');
        menu.classList.remove('open');
      } else if (act === 'wave') {
        eventBus.emit('avatar:wave');
        menu.classList.remove('open');
      } else if (act === 'theme') eventBus.emit('theme:toggle');
      else if (act === 'mute') audioManager.setMuted(!store.get().muted);
      else if (act === 'credits') {
        menu.classList.remove('open');
        store.set('activeOverlay', 'menu');
        eventBus.emit('overlay:open', 'menu');
      } else if (seg === 'travel') store.set('travelMode', btn.dataset.val as 'walk' | 'instant');
      else if (seg === 'quality') qualityManager.setTier(btn.dataset.val as 'high' | 'medium' | 'low', true);
      setTimeout(() => this.refreshMenu(menu), 30);
    });
    menu.querySelectorAll<HTMLInputElement>('input[data-vol]').forEach((input) => {
      input.addEventListener('input', () => {
        const v = Number(input.value);
        if (input.dataset.vol === 'music') audioManager.setMusicVolume(v);
        else {
          audioManager.setSfxVolume(v);
          audioManager.playPop();
        }
      });
    });
    return menu;
  }

  private refreshMenu(menu: HTMLElement): void {
    const s = store.get();
    (menu.querySelector('[data-theme-label]') as HTMLElement).textContent = s.theme === 'dusk' ? '☀️ Day mode' : '🌙 Night mode';
    (menu.querySelector('[data-mute-label]') as HTMLElement).textContent = s.muted ? '🔇 Sound off (tap to turn on)' : '🔊 Sound on (tap to mute)';
    const vols = audioManager.volumes;
    (menu.querySelector('input[data-vol="music"]') as HTMLInputElement).value = String(vols.music);
    (menu.querySelector('input[data-vol="sfx"]') as HTMLInputElement).value = String(vols.sfx);
    const mark = (seg: string, val: string) =>
      menu.querySelectorAll<HTMLButtonElement>(`[data-seg="${seg}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.val === val));
    mark('travel', s.travelMode);
    mark('quality', qualityManager.config.tier);
  }

  private updateRoomBadge(roomId: RoomId): void {
    this.roomButtons.forEach((btn, id) => {
      if (id === roomId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  private initEvents(): void {
    eventBus.on('room:entered', (roomId: RoomId) => this.updateRoomBadge(roomId));

    eventBus.on('interaction:available', (data: { id: string; label: string; keyHint: string; position: THREE.Vector3 }) => {
      this.promptTarget3D = data.position;
      this.promptId = data.id;
      this.promptBubble.innerHTML = `<span class="prompt-key">${data.keyHint}</span> <span>${data.label}</span>`;
      this.promptBubble.style.display = 'flex';
      audioManager.playPop();
    });

    eventBus.on('zuzu:bubble', (on: boolean) => (this.zuzuTalking = on));

    eventBus.on('interaction:clear', () => {
      this.promptTarget3D = null;
      this.promptId = '';
      this.promptBubble.style.display = 'none';
    });
  }

  private initJoystickTouch(): void {
    const zone = this.joystickZone;
    const knob = this.joystickKnob;

    const onTouchStart = (e: TouchEvent) => {
      if (this.joystickActive) return;
      const touch = e.changedTouches[0];
      this.joystickTouchId = touch.identifier;
      this.joystickActive = true;

      const rect = zone.getBoundingClientRect();
      this.joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      updateKnob(touch.clientX, touch.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!this.joystickActive) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.joystickTouchId) {
          updateKnob(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!this.joystickActive) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystickTouchId) {
          this.joystickActive = false;
          this.joystickTouchId = null;
          knob.style.transform = 'translate(-50%, -50%)';
          eventBus.emit('joystick:move', { x: 0, y: 0 });
          break;
        }
      }
    };

    const updateKnob = (clientX: number, clientY: number) => {
      const dx = clientX - this.joystickCenter.x;
      const dy = clientY - this.joystickCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxRadius = 45;

      const clampedDist = Math.min(dist, maxRadius);
      const angle = Math.atan2(dy, dx);
      const knobX = Math.cos(angle) * clampedDist;
      const knobY = Math.sin(angle) * clampedDist;

      knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

      const normX = knobX / maxRadius;
      const normY = knobY / maxRadius;
      eventBus.emit('joystick:move', { x: normX, y: normY });
    };

    zone.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });
  }

  update(camera: THREE.Camera): void {
    if (this.promptTarget3D) {
      const hide = this.promptId === 'companion' && this.zuzuTalking;
      this.promptBubble.style.display = hide ? 'none' : 'flex';
      if (hide) return;
      const pos = this.promptTarget3D.clone();
      pos.y += 0.8; // Float slightly above interactable anchor
      pos.project(camera);

      // Check if behind camera
      if (pos.z > 1.0) {
        this.promptBubble.style.display = 'none';
        return;
      }

      const screenX = ((pos.x + 1) * window.innerWidth) / 2;
      const screenY = ((-pos.y + 1) * window.innerHeight) / 2;

      this.promptBubble.style.left = `${screenX}px`;
      this.promptBubble.style.top = `${screenY}px`;
    }
  }
}
