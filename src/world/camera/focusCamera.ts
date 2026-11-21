import * as THREE from 'three';

export interface FocusPose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov?: number;
}

export class FocusCameraManager {
  public isFocused = false;
  private camera: THREE.PerspectiveCamera;
  private startPosition = new THREE.Vector3();
  private startLookAt = new THREE.Vector3();
  private targetPosition = new THREE.Vector3();
  private targetLookAt = new THREE.Vector3();

  private progress = 1.0;
  private duration = 0.8;
  private easing = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  focus(pose: FocusPose, currentLookAt: THREE.Vector3, duration: number = 0.8): void {
    this.isFocused = true;
    this.duration = duration;
    this.progress = 0;

    this.startPosition.copy(this.camera.position);
    this.startLookAt.copy(currentLookAt);

    this.targetPosition.copy(pose.position);
    this.targetLookAt.copy(pose.lookAt);
  }

  unfocus(): void {
    this.isFocused = false;
  }

  update(delta: number): boolean {
    if (!this.isFocused) return false;

    if (this.progress < 1.0) {
      this.progress += delta / this.duration;
      if (this.progress > 1.0) this.progress = 1.0;

      const t = this.easing(this.progress);
      this.camera.position.lerpVectors(this.startPosition, this.targetPosition, t);

      const lookAt = new THREE.Vector3().lerpVectors(this.startLookAt, this.targetLookAt, t);
      this.camera.lookAt(lookAt);
    } else {
      this.camera.position.copy(this.targetPosition);
      this.camera.lookAt(this.targetLookAt);
    }

    return true; // camera handled by focus manager
  }
}
