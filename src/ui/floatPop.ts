import * as THREE from 'three';
import { refs } from '../world/refs';

/** Pops a short floating label (e.g. "+ Unity", "+10", "💖") at a 3D point. */
export function floatPop(text: string, world: THREE.Vector3, tone: 'green' | 'pink' | 'gold' | 'heart' = 'green'): void {
  const cam = refs.camera;
  if (!cam) return;
  const p = world.clone().project(cam);
  if (p.z > 1) return;
  const el = document.createElement('div');
  el.className = `float-pop ${tone === 'green' ? '' : tone}`;
  el.textContent = text;
  el.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`;
  el.style.top = `${((1 - p.y) / 2) * window.innerHeight}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}
