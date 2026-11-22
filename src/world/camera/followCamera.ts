import * as THREE from 'three';
import { collisionSystem } from '../collision';
import { eventBus } from '../../core/events';

/**
 * Third-person orbit camera.
 * The camera keeps its own yaw instead of copying the avatar's facing, so turning
 * left/right no longer swings the view around (which made movement feel jerky).
 * Drag to orbit, scroll to zoom, press F (or the eye button) to look at her face.
 */
export class FollowCamera {
  public camera: THREE.PerspectiveCamera;
  public target: THREE.Vector3 = new THREE.Vector3();
  public currentPosition: THREE.Vector3 = new THREE.Vector3();
  public currentLookAt: THREE.Vector3 = new THREE.Vector3();

  // Orbit state
  public yaw = 0; // camera sits at avatar + (-sin(yaw), , -cos(yaw)) * distance
  public pitch = 0.6; // radians above the horizon
  private targetYaw = 0;
  private targetPitch = 0.6;
  private zoom = 1;
  private targetZoom = 1;

  // Settings
  public distance = 4.6;
  public lookAtOffset = new THREE.Vector3(0, 0.8, 0);
  public smoothness = 6.0;
  private basePitch = 0.6;

  /** Cinematic override (intro): when set, the camera eases to this pose instead of orbiting. */
  private cinematic: { position: THREE.Vector3; lookAt: THREE.Vector3 } | null = null;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.updateForScreenSize();
    window.addEventListener('resize', () => this.updateForScreenSize());

    eventBus.on('camera:orbit', ({ dx, dy }: { dx: number; dy: number }) => {
      this.targetYaw -= dx * 0.008;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * 0.005, 0.05, 1.15);
    });
    eventBus.on('camera:zoom', (dir: number) => {
      this.targetZoom = THREE.MathUtils.clamp(this.targetZoom + dir * 0.12, 0.55, 1.4);
    });
    eventBus.on('camera:face', () => this.lookAtFace());
    eventBus.on('camera:reset', () => {
      this.targetPitch = this.basePitch;
      this.targetZoom = 1;
    });

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'KeyQ') this.targetYaw += 0.35;
      if (e.code === 'KeyR') this.targetYaw -= 0.35;
      if (e.code === 'KeyF') this.lookAtFace();
    });
  }

  /** Avatar facing, kept so "look at face" knows where the front is. */
  private avatarYaw = 0;

  private updateForScreenSize(): void {
    const isPortrait = window.innerHeight > window.innerWidth;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    if (isPortrait) {
      this.camera.fov = 54;
      this.distance = 6.2;
      this.basePitch = 0.52;
    } else {
      this.camera.fov = 45;
      this.distance = 5.0;
      this.basePitch = 0.48;
    }
    this.camera.updateProjectionMatrix();
  }

  /** Swing around to the front of the avatar, slightly lower and closer, to see her face. */
  lookAtFace(): void {
    let goal = this.avatarYaw + Math.PI;
    // take the short way round
    while (goal - this.targetYaw > Math.PI) goal -= Math.PI * 2;
    while (goal - this.targetYaw < -Math.PI) goal += Math.PI * 2;
    this.targetYaw = goal;
    this.targetPitch = 0.22;
    this.targetZoom = 0.6;
  }

  setCinematic(pose: { position: THREE.Vector3; lookAt: THREE.Vector3 } | null, avatarPosition?: THREE.Vector3): void {
    this.cinematic = pose;
    if (!pose && avatarPosition) {
      // Hand back to the orbit camera from wherever the shot ended, so there's no jump
      const offset = this.currentPosition.clone().sub(avatarPosition.clone().add(new THREE.Vector3(0, 0.9, 0)));
      const len = Math.max(0.5, offset.length());
      this.yaw = this.targetYaw = Math.atan2(-offset.x, -offset.z);
      this.pitch = THREE.MathUtils.clamp(Math.asin(offset.y / len), 0.05, 1.15);
      this.targetPitch = this.basePitch;
      this.zoom = THREE.MathUtils.clamp(len / this.distance, 0.55, 1.4);
      this.targetZoom = 1;
    }
  }

  private offsetFor(yaw: number, pitch: number, dist: number): THREE.Vector3 {
    const flat = Math.cos(pitch) * dist;
    return new THREE.Vector3(-Math.sin(yaw) * flat, Math.sin(pitch) * dist, -Math.cos(yaw) * flat);
  }

  snapTo(avatarPosition: THREE.Vector3, avatarRotationY: number): void {
    this.avatarYaw = avatarRotationY;
    this.yaw = this.targetYaw = avatarRotationY;
    this.pitch = this.targetPitch = this.basePitch;
    this.zoom = this.targetZoom = 1;
    this.currentPosition.copy(this.clampToRoom(avatarPosition.clone().add(this.offsetFor(this.yaw, this.pitch, this.distance))));
    this.currentLookAt.copy(avatarPosition).add(this.lookAtOffset);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  private clampToRoom(p: THREE.Vector3): THREE.Vector3 {
    const b = collisionSystem.roomBounds;
    p.x = THREE.MathUtils.clamp(p.x, b.minX + 0.4, b.maxX - 0.4);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ + 0.4, b.maxZ - 0.4);
    p.y = Math.max(p.y, 0.6);
    return p;
  }

  update(delta: number, avatarPosition: THREE.Vector3, avatarRotationY: number): void {
    this.avatarYaw = avatarRotationY;

    let idealPosition: THREE.Vector3;
    let idealLookAt: THREE.Vector3;

    if (this.cinematic) {
      idealPosition = this.cinematic.position.clone();
      idealLookAt = this.cinematic.lookAt.clone();
    } else {
      const k = 1 - Math.exp(-delta * 8);
      this.yaw += (this.targetYaw - this.yaw) * k;
      this.pitch += (this.targetPitch - this.pitch) * k;
      this.zoom += (this.targetZoom - this.zoom) * k;

      // Look a little lower when zoomed in on the face so it sits mid-frame
      const lookY = THREE.MathUtils.lerp(0.95, 0.8, (this.zoom - 0.55) / 0.85);
      idealLookAt = avatarPosition.clone().add(new THREE.Vector3(0, lookY, 0));
      idealPosition = this.clampToRoom(
        idealLookAt.clone().add(this.offsetFor(this.yaw, this.pitch, this.distance * this.zoom))
      );
    }

    // Frame-rate independent damping (smooth at 30 fps and 144 fps alike)
    const factor = 1 - Math.exp(-delta * this.smoothness);
    this.currentPosition.lerp(idealPosition, factor);
    this.currentLookAt.lerp(idealLookAt, Math.min(1, factor * 1.6));

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }
}
