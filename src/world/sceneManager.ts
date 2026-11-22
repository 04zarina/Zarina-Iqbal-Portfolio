import * as THREE from 'three';
import { BedroomRoom } from './rooms/bedroom';
import { GameRoom } from './rooms/gameRoom';
import { GreenhouseRoom } from './rooms/greenhouse';
import { StudyRoom } from './rooms/study';
import { DevRealmRoom } from './rooms/devRealm';
import { RoomId, store } from '../core/store';
import { eventBus } from '../core/events';
import { collisionSystem } from './collision';
import { clickSystem } from './clickables';
import { Avatar } from './avatar/avatar';
import { FollowCamera } from './camera/followCamera';
import { navGrid } from './nav';
import { audioManager } from '../audio/audioManager';

export interface RoomInstance {
  group: THREE.Group;
  spawnPoint: THREE.Vector3;
  /** Direction the avatar faces on entry (0 = +Z). Defaults to 0. */
  spawnRotationY?: number;
  /** Arrival spot per previous room (so she comes in through the right door). */
  entries?: Partial<Record<RoomId, { pos: THREE.Vector3; yaw: number }>>;
  /** Spot to walk to when leaving for a room (just inside its door). */
  exits?: Partial<Record<RoomId, THREE.Vector3>>;
  update(delta: number): void;
  dispose(): void;
}

const ROOM_NAMES: Record<RoomId, string> = {
  bedroom: 'Bedroom',
  gameRoom: 'Arcade',
  greenhouse: 'Greenhouse',
  study: 'Study Hub',
  devRealm: 'Dev Realm'
};

export class SceneManager {
  public scene: THREE.Scene;
  public currentRoomId: RoomId = 'bedroom';
  public currentRoom: RoomInstance | null = null;
  private avatar: Avatar;
  private camera: FollowCamera;
  private isTransitioning = false;
  private travelling = false;
  private walkResolve: ((ok: boolean) => void) | null = null;
  private fadeOverlay: HTMLElement;

  constructor(scene: THREE.Scene, avatar: Avatar, camera: FollowCamera) {
    this.scene = scene;
    this.avatar = avatar;
    this.camera = camera;

    // Transition black/pastel fade overlay
    this.fadeOverlay = this.createFadeOverlay();
    document.body.appendChild(this.fadeOverlay);

    eventBus.on('room:switch', (roomId: RoomId) => {
      this.switchRoom(roomId);
    });
    // Room buttons and chat links: in walk mode she walks to the door herself
    eventBus.on('room:travel', (roomId: RoomId) => this.travelTo(roomId));
    eventBus.on('travel:cancel', () => {
      if (this.travelling) {
        this.travelling = false;
        this.walkResolve?.(false);
      }
    });
  }

  private createFadeOverlay(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'room-fade-overlay';
    el.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #5A3A32;
      opacity: 0;
      pointer-events: none;
      z-index: 500;
      transition: opacity 0.35s ease-in-out;
    `;
    return el;
  }

  async loadInitialRoom(): Promise<void> {
    await this.switchRoom('bedroom', true);
  }

  async switchRoom(targetRoomId: RoomId, instant: boolean = false): Promise<void> {
    if (this.isTransitioning || (!instant && this.currentRoomId === targetRoomId)) return;
    this.isTransitioning = true;

    if (!instant) {
      store.set('inputLocked', true);
      this.fadeOverlay.style.opacity = '1';
      await new Promise((r) => setTimeout(r, 360));
    }

    // 1. Dispose previous room
    if (this.currentRoom) {
      this.scene.remove(this.currentRoom.group);
      this.currentRoom.dispose();
      this.currentRoom = null;
    }

    // 2. Clear previous room collisions
    collisionSystem.clear();
    clickSystem.clear();

    // 3. Instantiate new room
    let newRoom: RoomInstance;
    switch (targetRoomId) {
      case 'gameRoom':
        newRoom = new GameRoom();
        break;
      case 'greenhouse':
        newRoom = new GreenhouseRoom();
        break;
      case 'study':
        newRoom = new StudyRoom(this.avatar);
        break;
      case 'devRealm':
        newRoom = new DevRealmRoom();
        break;
      case 'bedroom':
      default:
        newRoom = new BedroomRoom(this.avatar);
        break;
    }

    const fromRoom = this.currentRoomId;
    this.currentRoom = newRoom;
    this.currentRoomId = targetRoomId;
    this.scene.add(newRoom.group);

    // 4. Position Avatar at room spawn
    if (targetRoomId === 'bedroom' && store.get().isWakingUp) {
      const bedPos = new THREE.Vector3(-3.4, 0.52, -1.9);
      this.avatar.startInBed(bedPos);
      this.camera.snapTo(new THREE.Vector3(-3.4, 1.2, -1.9), 0);
    } else {
      if (this.avatar.isSitting) this.avatar.standUp(newRoom.spawnPoint);
      const entry = !instant ? newRoom.entries?.[fromRoom] : undefined;
      this.avatar.position.copy(entry?.pos ?? newRoom.spawnPoint);
      this.avatar.rotationY = entry?.yaw ?? newRoom.spawnRotationY ?? 0;
      this.avatar.isMoving = false;
      this.camera.snapTo(this.avatar.position, this.avatar.rotationY);
    }

    // 6. Update store
    store.set('currentRoom', targetRoomId);
    store.markRoomVisited(targetRoomId);

    // 7. Fade back in
    if (!instant) {
      this.fadeOverlay.style.opacity = '0';
      await new Promise((r) => setTimeout(r, 360));
      store.set('inputLocked', false);
    }

    this.isTransitioning = false;
    eventBus.emit('room:entered', targetRoomId);
  }

  /** Walk a navigation path; resolves false if the visitor takes over the controls. */
  private walkPath(to: THREE.Vector3, speed = 2.8): Promise<boolean> {
    const path = navGrid.findPath(this.avatar.position, to);
    if (!path) return Promise.resolve(true);
    return new Promise((resolve) => {
      this.walkResolve = resolve;
      this.avatar.followPath(path, speed, () => {
        this.walkResolve = null;
        resolve(true);
      });
    });
  }

  /** Auto mode: she walks to the right door, through the bedroom hub if needed, and into the room. */
  async travelTo(target: RoomId): Promise<void> {
    if (this.isTransitioning || this.travelling || target === this.currentRoomId) return;
    const s = store.get();
    if (s.travelMode === 'instant' || this.avatar.isSleeping || this.avatar.isWakingUp || s.inputLocked) {
      if (this.avatar.isSleeping || this.avatar.isWakingUp) return;
      eventBus.emit('room:switch', target);
      return;
    }
    if (this.avatar.isSitting) this.avatar.standUp();
    const hops: RoomId[] = this.currentRoomId === 'bedroom' || target === 'bedroom' ? [target] : ['bedroom', target];
    this.travelling = true;
    eventBus.emit('toast:show', `Walking to the ${ROOM_NAMES[target]}... (move to take over)`);
    for (const hop of hops) {
      const exit = this.currentRoom?.exits?.[hop];
      if (exit) {
        const ok = await this.walkPath(exit);
        if (!ok || !this.travelling) return;
      }
      if (hop === 'devRealm' || this.currentRoomId === 'devRealm') audioManager.playPortal();
      else audioManager.playDoor();
      await this.switchRoom(hop);
      if (!this.travelling) return;
    }
    // A few steps into the room
    const fwd = new THREE.Vector3(Math.sin(this.avatar.rotationY), 0, Math.cos(this.avatar.rotationY)).multiplyScalar(1.3);
    await this.walkPath(this.avatar.position.clone().add(fwd), 2.2);
    this.travelling = false;
  }

  get isTravelling(): boolean {
    return this.travelling;
  }

  update(delta: number): void {
    if (this.currentRoom) {
      this.currentRoom.update(delta);
    }
  }
}
