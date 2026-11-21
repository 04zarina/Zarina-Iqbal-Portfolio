import * as THREE from 'three';
import { store, RoomId } from '../core/store';
import { eventBus } from '../core/events';
import { interactionSystem } from '../world/interaction';
import { audioManager } from '../audio/audioManager';

export class HUD {
  private container: HTMLElement;
  private roomButtons: Map<RoomId, HTMLButtonElement> = new Map();
  private promptBubble: HTMLElement;
  private joystickZone: HTMLElement;
  private joystickKnob: HTMLElement;
  private actionZone: HTMLElement;

  private promptTarget3D: THREE.Vector3 | null = null;
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
        eventBus.emit('room:switch', r.id);
      };
      roomBar.appendChild(btn);
      this.roomButtons.set(r.id, btn);
    });

    topLeft.appendChild(roomBar);
    this.container.appendChild(topLeft);

    // 2. Top Right Control Buttons
    const topRight = document.createElement('div');
    topRight.className = 'hud-top-right';

    // Ask Mochi / Need Help Button (Always visible on screen!)
    const askMochiBtn = document.createElement('button');
    askMochiBtn.className = 'sticker-btn accent-butter hud-ask-mochi-btn';
    askMochiBtn.innerHTML = '🐾 Need Help? Ask Mochi!';
    askMochiBtn.onclick = () => {
      audioManager.playPop();
      eventBus.emit('companion:summon');
    };

    // Theme Toggle
    const themeBtn = document.createElement('button');
    themeBtn.className = 'hud-icon-btn';
    themeBtn.title = 'Toggle Day/Dusk Lamp';
    themeBtn.innerHTML = store.get().theme === 'dusk' ? '🌙' : '☀️';
    themeBtn.onclick = () => {
      audioManager.playPop();
      eventBus.emit('theme:toggle');
    };

    // Journal Book Button
    const journalBtn = document.createElement('button');
    journalBtn.className = 'hud-icon-btn';
    journalBtn.title = 'Open Explorer Journal';
    journalBtn.innerHTML = '📖';
    journalBtn.onclick = () => {
      audioManager.playPop();
      store.set('activeOverlay', 'journal');
      eventBus.emit('overlay:open', 'journal');
    };

    // Audio Mute Toggle
    const audioBtn = document.createElement('button');
    audioBtn.className = 'hud-icon-btn';
    audioBtn.title = 'Toggle Audio';
    audioBtn.innerHTML = store.get().muted ? '🔇' : '🔊';
    audioBtn.onclick = () => {
      const nextMuted = !store.get().muted;
      audioManager.setMuted(nextMuted);
      audioBtn.innerHTML = nextMuted ? '🔇' : '🔊';
    };

    // Pause / Settings Menu Button
    const menuBtn = document.createElement('button');
    menuBtn.className = 'hud-icon-btn';
    menuBtn.title = 'Pause / Navigation Menu';
    menuBtn.innerHTML = '⚙️';
    menuBtn.onclick = () => {
      audioManager.playPop();
      store.set('activeOverlay', 'menu');
      eventBus.emit('overlay:open', 'menu');
    };

    topRight.append(askMochiBtn, themeBtn, journalBtn, audioBtn, menuBtn);
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
    actionBtn.innerHTML = 'ACT 🌟';
    actionBtn.onclick = () => {
      interactionSystem.triggerCurrent();
    };
    this.actionZone.appendChild(actionBtn);

    this.container.append(this.joystickZone, this.actionZone);

    this.initEvents();
    this.initJoystickTouch();
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
    eventBus.on('state:theme', (theme: string) => {
      const themeBtn = this.container.querySelector('.hud-top-right .hud-icon-btn') as HTMLElement;
      if (themeBtn) themeBtn.innerHTML = theme === 'dusk' ? '🌙' : '☀️';
    });

    eventBus.on('interaction:available', (data: { id: string; label: string; keyHint: string; position: THREE.Vector3 }) => {
      this.promptTarget3D = data.position;
      this.promptBubble.innerHTML = `<span class="prompt-key">${data.keyHint}</span> <span>${data.label}</span>`;
      this.promptBubble.style.display = 'flex';
      audioManager.playPop();
    });

    eventBus.on('interaction:clear', () => {
      this.promptTarget3D = null;
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
    if (this.promptTarget3D && this.promptBubble.style.display !== 'none') {
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
