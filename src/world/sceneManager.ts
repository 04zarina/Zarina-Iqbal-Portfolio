import * as THREE from 'three';
import { BedroomRoom } from './rooms/bedroom';
import { GameRoom } from './rooms/gameRoom';
import { GreenhouseRoom } from './rooms/greenhouse';
import { StudyRoom } from './rooms/study';
import { DevRealmRoom } from './rooms/devRealm';
import { RoomId, store } from '../core/store';
import { eventBus } from '../core/events';
import { collisionSystem } from './collision';
import { Avatar } from './avatar/avatar';
import { FollowCamera } from './camera/followCamera';

export interface RoomInstance {
  group: THREE.Group;
  spawnPoint: THREE.Vector3;
  /** Direction the avatar faces on entry (0 = +Z). Defaults to 0. */
  spawnRotationY?: number;
  update(delta: number): void;
  dispose(): void;
}

export class SceneManager {
  public scene: THREE.Scene;
  public currentRoomId: RoomId = 'bedroom';
  public currentRoom: RoomInstance | null = null;
  private avatar: Avatar;
  private camera: FollowCamera;
  private isTransitioning = false;
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

    this.currentRoom = newRoom;
    this.currentRoomId = targetRoomId;
    this.scene.add(newRoom.group);

    // 4. Position Avatar at room spawn
    if (targetRoomId === 'bedroom' && store.get().isWakingUp) {
      const bedPos = new THREE.Vector3(-3.4, 0.52, -1.9);
      this.avatar.startInBed(bedPos);
      this.camera.snapTo(new THREE.Vector3(-3.4, 1.2, -1.9), 0);
    } else {
      this.avatar.position.copy(newRoom.spawnPoint);
      this.avatar.rotationY = newRoom.spawnRotationY ?? 0;
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

  update(delta: number): void {
    if (this.currentRoom) {
      this.currentRoom.update(delta);
    }
  }
}
