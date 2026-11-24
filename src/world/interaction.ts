import * as THREE from 'three';
import { eventBus } from '../core/events';
import { store } from '../core/store';
import { jellyController } from './fx/jelly';
import { clickSystem } from './clickables';
import { navGrid } from './nav';
import { refs } from './refs';

export interface InteractableConfig {
  id: string;
  label: string;
  radius: number;
  position: THREE.Vector3;
  mesh?: THREE.Object3D;
  focusPose?: { position: THREE.Vector3; lookAt: THREE.Vector3 };
  /** Meters subtracted from the distance when picking between overlapping items. */
  priority?: number;
  /** Body language when used: 'reach' (default) touches the object, 'think' reads, 'none' for doors/seats. */
  gesture?: 'reach' | 'think' | 'none';
  /** False keeps it off mouse/tap clicks (e.g. Zuzu, who has her own click handler). Default true. */
  clickable?: boolean;
  /** How far (m, on the floor plane) from `position` a click on the furniture still counts. Default 0.9. */
  clickRadius?: number;
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
      // Compare on the floor plane so tall props (corkboards, shelves) aren't penalised
      const dist = Math.hypot(item.position.x - avatarPosition.x, item.position.z - avatarPosition.z);
      if (dist <= item.radius) {
        // Check facing direction roughly
        this.tempVec.subVectors(item.position, avatarPosition).setY(0).normalize();
        const dot = forward.dot(this.tempVec);

        // Require either very close (<= 1.1m) or roughly facing (dot > -0.2)
        if (dist <= 1.1 || dot > -0.2) {
          const score = dist - (item.priority || 0);
          if (score < minDistance) {
            minDistance = score;
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

  /** Re-announce the nearest item (after its label changed). */
  refresh(): void {
    this.clearActive();
  }

  get(id: string): InteractableConfig | undefined {
    return this.interactables.get(id);
  }

  /** Keyboard shortcut (E / Enter): use whatever she's standing next to. No on-screen prompt. */
  triggerCurrent(): void {
    if (this.currentActive) this.trigger(this.currentActive);
  }

  private trigger(item: InteractableConfig): void {
    if (store.get().inputLocked || !this.interactables.has(item.id)) return;
    if (item.mesh) {
      jellyController.trigger(item.mesh, 0.25, -0.3, 0.25);
    }
    eventBus.emit('interaction:use', item);
    item.onInteract();
    eventBus.emit('interaction:trigger', item.id);
  }

  /** The clickable interactable nearest to a point on the room's furniture, if one is close enough. */
  nearestTo(point: THREE.Vector3): InteractableConfig | null {
    let best: InteractableConfig | null = null;
    let bestD = Infinity;
    for (const item of this.interactables.values()) {
      if (item.clickable === false) continue;
      const d = Math.hypot(item.position.x - point.x, item.position.z - point.z);
      if (d <= (item.clickRadius ?? 0.9) && d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  /**
   * Clicked / tapped: use it straight away if she's close enough, otherwise she walks over first
   * (around the furniture) and uses it when she gets there.
   */
  activate(item: InteractableConfig): void {
    const avatar = refs.avatar;
    if (store.get().inputLocked) return;
    if (!avatar || avatar.isSleeping || avatar.isWakingUp) return this.trigger(item);
    const dist = Math.hypot(item.position.x - avatar.position.x, item.position.z - avatar.position.z);
    if (dist <= item.radius) return this.trigger(item);

    // Aim for a spot well inside its range, on the side she's coming from
    const dir = avatar.position.clone().sub(item.position).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const spot = item.position.clone().addScaledVector(dir, Math.min(item.radius * 0.55, 0.9)).setY(0);
    const path = navGrid.findPath(avatar.position, spot);
    if (!path || !path.length) return;
    if (avatar.isSitting) avatar.standUp();
    eventBus.emit('travel:cancel');
    avatar.followPath(path, 2.9, () => {
      const d = Math.hypot(item.position.x - avatar.position.x, item.position.z - avatar.position.z);
      if (d <= item.radius + 0.35) this.trigger(item);
    });
  }

  private clearActive(): void {
    if (this.currentActive) {
      this.currentActive = null;
      eventBus.emit('interaction:clear');
    }
  }
}

export const interactionSystem = new InteractionSystem();

// Mouse and touch: clicking a bed, lamp, door, chair... uses it (with a pointer cursor + label on hover)
clickSystem.setWorldResolver((point) => {
  const item = interactionSystem.nearestTo(point);
  return item ? { label: item.label, onClick: () => interactionSystem.activate(item) } : null;
});
