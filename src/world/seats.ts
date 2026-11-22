import * as THREE from 'three';
import { interactionSystem } from './interaction';
import { refs } from './refs';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';

export interface SeatConfig {
  id: string;
  label: string;
  /** Where her hips go (x/z) and which way she faces. */
  position: THREE.Vector3;
  yaw: number;
  /** Seat height in metres (chairs ~0.42, sofas ~0.4, stools ~0.55). */
  height?: number;
  /** Where she stands when getting up (defaults to 0.6 m in front of the seat). */
  standAt?: THREE.Vector3;
  radius?: number;
  priority?: number;
  onSit?: () => void;
}

/** Registers a sit-able spot: press E (or tap the prompt) and she sits; move to stand up. */
export function registerSeat(cfg: SeatConfig): void {
  const stand = cfg.standAt ?? cfg.position.clone().add(new THREE.Vector3(Math.sin(cfg.yaw) * 0.7, 0, Math.cos(cfg.yaw) * 0.7));
  interactionSystem.register({
    id: cfg.id,
    label: cfg.label,
    keyHint: 'E',
    radius: cfg.radius ?? 1.4,
    priority: cfg.priority,
    gesture: 'none',
    position: new THREE.Vector3(cfg.position.x, 0.5, cfg.position.z),
    onInteract: () => {
      const a = refs.avatar;
      if (!a || a.isSitting) return;
      a.standUpAt = stand.clone().setY(0);
      a.sitOnChair(new THREE.Vector3(cfg.position.x, 0, cfg.position.z), cfg.yaw, cfg.height ?? 0.42);
      audioManager.playSit();
      eventBus.emit('toast:show', 'Comfy! 🛋️ Move or press Space to stand up.');
      cfg.onSit?.();
    }
  });
}
