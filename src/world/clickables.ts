import * as THREE from 'three';
import { store } from '../core/store';
import { eventBus } from '../core/events';
import { jellyController } from './fx/jelly';

export interface Clickable {
  object: THREE.Object3D;
  label: string;
  onClick: () => void;
  persistent?: boolean;
  /** Made on the fly for furniture matched to an interactable (not registered). */
  virtual?: boolean;
}

/** Given a point on the room's geometry, return what clicking there should do (or null). */
export type WorldResolver = (point: THREE.Vector3) => { label: string; onClick: () => void } | null;

/**
 * Mouse / touch input on the 3D canvas.
 * - A click (or tap) on a registered object runs its handler.
 * - Dragging on empty space orbits the camera (handled by whoever listens to `camera:orbit`).
 * - Hovering a clickable shows a pointer cursor and a small label.
 */
class ClickSystem {
  private items: Clickable[] = [];
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private camera: THREE.Camera | null = null;
  private canvas: HTMLElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private hovered: Clickable | null = null;
  /** The current room's root: clicks on its furniture are matched to nearby interactables. */
  private worldRoot: THREE.Object3D | null = null;
  private worldResolver: WorldResolver | null = null;
  private hoverQueued: { x: number; y: number } | null = null;
  private hoverRaf = 0;

  private down: { x: number; y: number; id: number } | null = null;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  attach(canvas: HTMLElement, camera: THREE.Camera): void {
    this.canvas = canvas;
    this.camera = camera;
    canvas.style.touchAction = 'none';

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'click-tooltip';
    this.tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.tooltip);

    canvas.addEventListener('pointerdown', (e) => {
      if (this.down) return;
      this.down = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.dragging = false;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (this.down && e.pointerId === this.down.id) {
        const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
        if (moved > 6) this.dragging = true;
        if (this.dragging) {
          eventBus.emit('camera:orbit', { dx: e.clientX - this.lastX, dy: e.clientY - this.lastY });
          this.hideTooltip();
        }
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        return;
      }
      if (e.pointerType === 'mouse') this.queueHover(e.clientX, e.clientY);
    });

    const end = (e: PointerEvent) => {
      if (!this.down || e.pointerId !== this.down.id) return;
      const wasDrag = this.dragging;
      this.down = null;
      this.dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!wasDrag && e.type === 'pointerup') this.click(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => this.hideTooltip());

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        eventBus.emit('camera:zoom', Math.sign(e.deltaY));
      },
      { passive: false }
    );
  }

  register(object: THREE.Object3D, label: string, onClick: () => void, persistent = false): void {
    this.items.push({ object, label, onClick, persistent });
  }

  unregister(object: THREE.Object3D): void {
    this.items = this.items.filter((i) => i.object !== object);
    if (this.hovered?.object === object) this.hideTooltip();
  }

  setWorldRoot(root: THREE.Object3D | null): void {
    this.worldRoot = root;
  }

  setWorldResolver(resolver: WorldResolver | null): void {
    this.worldResolver = resolver;
  }

  /** Called on room change. Persistent objects (like Zuzu) stay registered. */
  clear(): void {
    this.items = this.items.filter((i) => i.persistent);
    this.hideTooltip();
  }

  private pick(x: number, y: number): Clickable | null {
    if (!this.camera || !this.canvas || this.items.length === 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const roots = this.items.filter((i) => i.object.visible).map((i) => i.object);
    const hits = roots.length ? this.raycaster.intersectObjects(roots, true) : [];
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        const item = this.items.find((i) => i.object === o);
        if (item) return item;
        o = o.parent;
      }
    }
    return this.pickWorld();
  }

  /** Clicked the room itself: is it a piece of furniture someone can use (bed, lamp, door...)? */
  private pickWorld(): Clickable | null {
    if (!this.worldRoot || !this.worldResolver) return null;
    const hits = this.raycaster.intersectObject(this.worldRoot, true);
    for (const hit of hits) {
      if (!this.solid(hit.object)) continue;
      // The floor is for walking; only things standing on it can be used
      if (hit.point.y < 0.06) return null;
      const r = this.worldResolver(hit.point);
      return r ? { object: hit.object, label: r.label, onClick: r.onClick, virtual: true } : null;
    }
    return null;
  }

  /** A visible, opaque mesh (skips hidden helpers, particles and furniture faded out for the camera). */
  private solid(obj: THREE.Object3D): boolean {
    if (!(obj as THREE.Mesh).isMesh) return false;
    const mats = ([] as THREE.Material[]).concat((obj as THREE.Mesh).material as THREE.Material | THREE.Material[]);
    if (mats.every((m) => !m || !m.visible || (m.transparent && m.opacity < 0.5))) return false;
    for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  private blocked(): boolean {
    const s = store.get();
    return s.inputLocked || s.activeOverlay !== 'none';
  }

  private click(x: number, y: number): void {
    if (this.blocked()) return;
    const item = this.pick(x, y);
    if (!item) {
      // Empty space: let the world decide (click-to-walk on the floor)
      if (this.camera && this.canvas) {
        const rect = this.canvas.getBoundingClientRect();
        eventBus.emit('world:click', { x: ((x - rect.left) / rect.width) * 2 - 1, y: -((y - rect.top) / rect.height) * 2 + 1 });
      }
      return;
    }
    if (!item.virtual) jellyController.trigger(item.object, 0.2, -0.25, 0.2);
    this.hideTooltip();
    item.onClick();
  }

  /** Hover raycasts at most once per frame. */
  private queueHover(x: number, y: number): void {
    this.hoverQueued = { x, y };
    if (this.hoverRaf) return;
    this.hoverRaf = requestAnimationFrame(() => {
      this.hoverRaf = 0;
      const q = this.hoverQueued;
      this.hoverQueued = null;
      if (q && !this.down) this.updateHover(q.x, q.y);
    });
  }

  private updateHover(x: number, y: number): void {
    if (this.blocked()) {
      this.hideTooltip();
      return;
    }
    const item = this.pick(x, y);
    if (item !== this.hovered) {
      this.hovered = item;
      if (this.canvas) this.canvas.style.cursor = item ? 'pointer' : '';
    }
    if (item && this.tooltip) {
      this.tooltip.textContent = item.label;
      this.tooltip.style.transform = `translate(${x + 14}px, ${y + 12}px)`;
      this.tooltip.classList.add('visible');
    } else {
      this.tooltip?.classList.remove('visible');
    }
  }

  private hideTooltip(): void {
    this.hovered = null;
    if (this.canvas) this.canvas.style.cursor = '';
    this.tooltip?.classList.remove('visible');
  }
}

export const clickSystem = new ClickSystem();
