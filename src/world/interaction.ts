import * as THREE from 'three';
import { eventBus } from '../core/events';
import { store } from '../core/store';
import { JellyController, jellyController } from './fx/jelly';

export interface InteractableConfig {
  id: string;
  label: string;
  keyHint?: string;
  radius: number;
  position: THREE.Vector3;
  mesh?: THREE.Object3D;
  focusPose?: { position: THREE.Vector3; lookAt: THREE.Vector3 };
  onInteract: () => void | Promise<void>;
}

export class InteractionSystem {
  private interactables: Map<string, InteractableConfig> = new Map();
  public currentActive: InteractableConfig | null = null;
  private tempVec = new THREE.Vector3();

  register(config: InteractableConfig): void {
    this.interactables.set(config.id, config);
    if (config.mesh) {
      jellyController.register(config.mesh);
    }
  }

  unregister(id: string): void {
    const item = this.interactables.get(id);
    if (item && item.mesh) {
      jellyController.unregister(item.mesh);
    }
    this.interactables.delete(id);
    if (this.currentActive?.id === id) {
      this.clearActive();
    }
  }

  clear(): void {
    this.interactables.forEach((item) => {
      if (item.mesh) jellyController.unregister(item.mesh);
    });
    this.interactables.clear();
    this.clearActive();
  }

  update(avatarPosition: THREE.Vector3, avatarRotationY: number): void {
    if (store.get().inputLocked) {
      this.clearActive();
      return;
    }

    const forward = new THREE.Vector3(Math.sin(avatarRotationY), 0, Math.cos(avatarRotationY)).normalize();
    let nearest: InteractableConfig | null = null;
    let minDistance = Infinity;

    for (const item of this.interactables.values()) {
      const dist = avatarPosition.distanceTo(item.position);
      if (dist <= item.radius) {
        // Check facing direction roughly
        this.tempVec.subVectors(item.position, avatarPosition).normalize();
        const dot = forward.dot(this.tempVec);

        // Require either very close (<= 1.1m) or roughly facing (dot > -0.2)
        if (dist <= 1.1 || dot > -0.2) {
          if (dist < minDistance) {
            minDistance = dist;
            nearest = item;
          }
        }
      }
    }

    if (nearest !== this.currentActive) {
      if (nearest) {
        this.currentActive = nearest;
        eventBus.emit('interaction:available', {
          id: nearest.id,
          label: nearest.label,
          keyHint: nearest.keyHint || 'E',
          position: nearest.position
        });
        if (nearest.mesh) {
          jellyController.trigger(nearest.mesh, 0.08, -0.1, 0.08);
        }
      } else {
        this.clearActive();
      }
    }
  }

  triggerCurrent(): void {
    if (this.currentActive && !store.get().inputLocked) {
      const item = this.currentActive;
      if (item.mesh) {
        jellyController.trigger(item.mesh, 0.25, -0.3, 0.25);
      }
      item.onInteract();
      eventBus.emit('interaction:trigger', item.id);
    }
  }

  private clearActive(): void {
    if (this.currentActive) {
      this.currentActive = null;
      eventBus.emit('interaction:clear');
    }
  }
}

export const interactionSystem = new InteractionSystem();
