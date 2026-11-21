import * as THREE from 'three';
import { collisionSystem } from '../collision';

export class FollowCamera {
  public camera: THREE.PerspectiveCamera;
  public target: THREE.Vector3 = new THREE.Vector3();
  public currentPosition: THREE.Vector3 = new THREE.Vector3();
  public currentLookAt: THREE.Vector3 = new THREE.Vector3();

  // Settings
  public distance = 4.6;
  public height = 3.2;
  public lookAtOffset = new THREE.Vector3(0, 0.8, 0);
  public smoothness = 7.0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.updateForScreenSize();
    window.addEventListener('resize', () => this.updateForScreenSize());
  }

  private updateForScreenSize(): void {
    const isPortrait = window.innerHeight > window.innerWidth;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    if (isPortrait) {
      this.camera.fov = 54;
      this.distance = 5.8;
      this.height = 4.0;
    } else {
      this.camera.fov = 45;
      this.distance = 4.6;
      this.height = 3.2;
    }
    this.camera.updateProjectionMatrix();
  }

  snapTo(avatarPosition: THREE.Vector3, avatarRotationY: number): void {
    const offset = new THREE.Vector3(
      Math.sin(avatarRotationY) * -this.distance,
      this.height,
      Math.cos(avatarRotationY) * -this.distance
    );
    this.currentPosition.copy(avatarPosition).add(offset);
    this.currentLookAt.copy(avatarPosition).add(this.lookAtOffset);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  update(delta: number, avatarPosition: THREE.Vector3, avatarRotationY: number): void {
    // Ideal camera position behind character
    const idealOffset = new THREE.Vector3(
      Math.sin(avatarRotationY) * -this.distance,
      this.height,
      Math.cos(avatarRotationY) * -this.distance
    );

    const idealPosition = avatarPosition.clone().add(idealOffset);
    const idealLookAt = avatarPosition.clone().add(this.lookAtOffset);

    // Collision pull-in: ensure camera doesn't penetrate walls
    idealPosition.x = THREE.MathUtils.clamp(
      idealPosition.x,
      collisionSystem.roomBounds.minX + 0.5,
      collisionSystem.roomBounds.maxX - 0.5
    );
    idealPosition.z = THREE.MathUtils.clamp(
      idealPosition.z,
      collisionSystem.roomBounds.minZ + 0.5,
      collisionSystem.roomBounds.maxZ - 0.5
    );

    // Damped interpolation
    const factor = Math.min(delta * this.smoothness, 1.0);
    this.currentPosition.lerp(idealPosition, factor);
    this.currentLookAt.lerp(idealLookAt, factor);

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }
}
