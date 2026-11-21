import * as THREE from 'three';

export interface JellyTarget {
  object: THREE.Object3D;
  baseScale: THREE.Vector3;
  velocity: THREE.Vector3;
  targetScale: THREE.Vector3;
  stiffness: number;
  damping: number;
}

export class JellyController {
  private targets: Map<THREE.Object3D, JellyTarget> = new Map();

  register(object: THREE.Object3D, stiffness: number = 220, damping: number = 14): void {
    if (!this.targets.has(object)) {
      this.targets.set(object, {
        object,
        baseScale: object.scale.clone(),
        velocity: new THREE.Vector3(),
        targetScale: object.scale.clone(),
        stiffness,
        damping
      });
    }
  }

  unregister(object: THREE.Object3D): void {
    const item = this.targets.get(object);
    if (item) {
      object.scale.copy(item.baseScale);
      this.targets.delete(object);
    }
  }

  trigger(object: THREE.Object3D, impulseX: number = 0.25, impulseY: number = -0.3, impulseZ: number = 0.25): void {
    const item = this.targets.get(object);
    if (item) {
      item.velocity.x += impulseX * 6;
      item.velocity.y += impulseY * 6;
      item.velocity.z += impulseZ * 6;
    }
  }

  update(delta: number): void {
    this.targets.forEach((item) => {
      // Spring simulation: F = -k*(x - target) - c*v
      const diffX = item.object.scale.x - item.targetScale.x;
      const diffY = item.object.scale.y - item.targetScale.y;
      const diffZ = item.object.scale.z - item.targetScale.z;

      item.velocity.x += (-item.stiffness * diffX - item.damping * item.velocity.x) * delta;
      item.velocity.y += (-item.stiffness * diffY - item.damping * item.velocity.y) * delta;
      item.velocity.z += (-item.stiffness * diffZ - item.damping * item.velocity.z) * delta;

      item.object.scale.x += item.velocity.x * delta;
      item.object.scale.y += item.velocity.y * delta;
      item.object.scale.z += item.velocity.z * delta;
    });
  }
}

export const jellyController = new JellyController();
