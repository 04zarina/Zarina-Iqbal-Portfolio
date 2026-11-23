import * as THREE from 'three';
import { collisionSystem } from '../collision';
import { eventBus } from '../../core/events';
import { store } from '../../core/store';

const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/**
 * Third-person follow camera, the way most third-person games do it:
 * - It sits behind and above her, so you see her and the floor ahead of her.
 * - While she walks it slowly swings round behind her (never while she walks toward
 *   the camera, so the controls don't flip), and looks a little ahead so the path is visible.
 * - Drag to orbit, scroll to zoom, Q/R to turn, F to see her face. After a drag it waits a
 *   moment before it starts following again.
 * - Collision-safe: the boom shortens (and tilts up) instead of passing through walls,
 *   and furniture between the camera and her fades out.
 */
export class FollowCamera {
  public camera: THREE.PerspectiveCamera;
  public currentPosition: THREE.Vector3 = new THREE.Vector3();
  public currentLookAt: THREE.Vector3 = new THREE.Vector3();

  // Orbit state (camera sits at pivot + (-sin(yaw), , -cos(yaw)) * distance)
  public yaw = 0;
  public pitch = 0.5;
  private targetYaw = 0;
  private targetPitch = 0.5;
  private zoom = 1;
  private targetZoom = 1;
  /** Boom length actually used this frame after wall checks (shrinks fast, grows back slowly). */
  private boom = 5;

  // Settings
  public distance = 5.2;
  public smoothness = 7.0;
  private basePitch = 0.5;
  /** Seconds since the visitor last dragged / turned the camera by hand. */
  private sinceManual = 99;

  /** Meshes between the camera and the avatar fade out so furniture never hides her. */
  private occluderRoot: THREE.Object3D | null = null;
  private faded = new Set<THREE.Mesh>();
  private raycaster = new THREE.Raycaster();
  private occlusionTimer = 0;
  private lookAhead = new THREE.Vector3();
  private lastAvatarPos = new THREE.Vector3();
  private avatarYaw = 0;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  /** Cinematic override (intro): when set, the camera eases to this pose instead of following. */
  private cinematic: { position: THREE.Vector3; lookAt: THREE.Vector3 } | null = null;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.updateForScreenSize();
    window.addEventListener('resize', () => this.updateForScreenSize());

    eventBus.on('camera:orbit', ({ dx, dy }: { dx: number; dy: number }) => {
      this.targetYaw -= dx * 0.008;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * 0.005, 0.12, 1.2);
      this.sinceManual = 0;
    });
    eventBus.on('camera:zoom', (dir: number) => {
      this.targetZoom = THREE.MathUtils.clamp(this.targetZoom + dir * 0.12, 0.45, 1.5);
    });
    eventBus.on('camera:face', () => this.lookAtFace());
    eventBus.on('camera:reset', () => {
      this.targetPitch = this.basePitch;
      this.targetZoom = 1;
      this.targetYaw = this.closestYaw(this.avatarYaw);
    });

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'KeyQ') {
        this.targetYaw += 0.35;
        this.sinceManual = 0;
      }
      if (e.code === 'KeyR') {
        this.targetYaw -= 0.35;
        this.sinceManual = 0;
      }
      if (e.code === 'KeyF') this.lookAtFace();
    });
  }

  private updateForScreenSize(): void {
    const isPortrait = window.innerHeight > window.innerWidth;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    // Portrait phones get a wider lens and a longer boom so the room ahead still fits
    this.camera.fov = isPortrait ? 62 : 50;
    this.distance = isPortrait ? 5.6 : 5.0;
    this.basePitch = isPortrait ? 0.5 : 0.44;
    this.camera.updateProjectionMatrix();
  }

  /** The current room's root, used to find furniture blocking the view. */
  setOccluderRoot(root: THREE.Object3D | null): void {
    this.clearFades();
    this.occluderRoot = root;
  }

  private clearFades(): void {
    this.faded.forEach((m) => this.setFade(m, false));
    this.faded.clear();
  }

  private setFade(mesh: THREE.Mesh, fade: boolean): void {
    if (fade && !mesh.userData.fadeMats) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.userData.origMats = mesh.material;
      const clones = mats.map((m) => {
        const c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
        c.opacity = 0.22;
        return c;
      });
      mesh.userData.fadeMats = Array.isArray(mesh.material) ? clones : clones[0];
    }
    if (mesh.userData.fadeMats) mesh.material = fade ? mesh.userData.fadeMats : mesh.userData.origMats;
  }

  /** Fade anything sitting between the camera and her (head, chest and feet rays). */
  private updateOcclusion(avatarPosition: THREE.Vector3): void {
    if (!this.occluderRoot || this.cinematic) {
      if (this.faded.size) this.clearFades();
      return;
    }
    const hitNow = new Set<THREE.Mesh>();
    for (const yOff of [1.25, 0.8, 0.25]) {
      const t = this.tmpA.copy(avatarPosition).setY(avatarPosition.y + yOff);
      const d = this.tmpB.copy(t).sub(this.camera.position);
      const len = d.length();
      if (len < 0.3) continue;
      this.raycaster.set(this.camera.position, d.normalize());
      this.raycaster.camera = this.camera; // sprites need it to raycast
      this.raycaster.far = len - 0.35;
      for (const hit of this.raycaster.intersectObject(this.occluderRoot, true)) {
        const m = hit.object as THREE.Mesh;
        if (!m.isMesh || m.userData.noFade) continue;
        // Skip floors / rugs (big flat horizontals)
        if (hit.face && Math.abs(hit.face.normal.y) > 0.95 && hit.point.y < 0.05) continue;
        hitNow.add(m);
      }
    }
    this.faded.forEach((m) => {
      if (!hitNow.has(m)) {
        this.setFade(m, false);
        this.faded.delete(m);
      }
    });
    hitNow.forEach((m) => {
      if (!this.faded.has(m)) {
        this.setFade(m, true);
        this.faded.add(m);
      }
    });
  }

  /** Same direction as `yaw`, but the copy closest to the current target (no long spins). */
  private closestYaw(yaw: number): number {
    return this.targetYaw + wrapAngle(yaw - this.targetYaw);
  }

  /** Swing around to the front of the avatar, lower and closer, to see her face. */
  lookAtFace(): void {
    this.targetYaw = this.closestYaw(this.avatarYaw + Math.PI);
    this.targetPitch = 0.22;
    this.targetZoom = 0.55;
    this.sinceManual = -2.5; // stay on her face for a few seconds even if she starts walking
  }

  setCinematic(pose: { position: THREE.Vector3; lookAt: THREE.Vector3 } | null, avatarPosition?: THREE.Vector3): void {
    this.cinematic = pose;
    if (!pose && avatarPosition) {
      // Hand back from wherever the shot ended, so there's no jump
      const offset = this.currentPosition.clone().sub(avatarPosition.clone().add(new THREE.Vector3(0, 1.0, 0)));
      const len = Math.max(0.5, offset.length());
      this.yaw = this.targetYaw = Math.atan2(-offset.x, -offset.z);
      this.pitch = THREE.MathUtils.clamp(Math.asin(offset.y / len), 0.12, 1.1);
      this.targetPitch = this.basePitch;
      this.zoom = THREE.MathUtils.clamp(len / this.distance, 0.5, 1.4);
      this.boom = len;
      this.targetZoom = 1;
      this.sinceManual = 0;
    }
  }

  private offsetDir(yaw: number, pitch: number): THREE.Vector3 {
    const c = Math.cos(pitch);
    return new THREE.Vector3(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
  }

  /** Bounds the camera must stay inside: the room's walls (outdoors: a generous box). */
  private bounds(): { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number } {
    const b = collisionSystem.roomBounds;
    const outdoors = store.get().currentRoom === 'devRealm';
    const pad = outdoors ? -3 : 0.3; // outdoors the camera may float past the island edge
    return { minX: b.minX + pad, maxX: b.maxX - pad, minZ: b.minZ + pad, maxZ: b.maxZ - pad, maxY: outdoors ? 9 : 4.6 };
  }

  /** How far along `dir` from `pivot` the camera can go before leaving the room. */
  private freeLength(pivot: THREE.Vector3, dir: THREE.Vector3, want: number): number {
    const b = this.bounds();
    let t = want;
    const clip = (p: number, d: number, lo: number, hi: number) => {
      if (d > 1e-4) t = Math.min(t, (hi - p) / d);
      else if (d < -1e-4) t = Math.min(t, (lo - p) / d);
    };
    clip(pivot.x, dir.x, b.minX, b.maxX);
    clip(pivot.z, dir.z, b.minZ, b.maxZ);
    clip(pivot.y, dir.y, 0.4, b.maxY);
    return Math.max(0.6, t);
  }

  /** Closest the boom may get: any nearer and the wall behind is simply faded out instead. */
  private readonly minBoom = 2.3;

  snapTo(avatarPosition: THREE.Vector3, avatarRotationY: number): void {
    this.avatarYaw = avatarRotationY;
    this.yaw = this.targetYaw = avatarRotationY;
    this.pitch = this.targetPitch = this.basePitch;
    this.zoom = this.targetZoom = 1;
    this.sinceManual = 99;
    this.lastAvatarPos.copy(avatarPosition);
    this.lookAhead.set(0, 0, 0);
    const pivot = avatarPosition.clone().add(new THREE.Vector3(0, 1.0, 0));
    const pose = this.solve(pivot, this.yaw, this.pitch, this.distance);
    this.boom = pose.len;
    this.currentPosition.copy(pose.position);
    this.currentLookAt.copy(pivot);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  /** Camera position for a boom from `pivot`; tilts up when a wall forces it in close. */
  private solve(pivot: THREE.Vector3, yaw: number, pitch: number, want: number): { position: THREE.Vector3; len: number } {
    let p = pitch;
    let dir = this.offsetDir(yaw, p);
    let len = this.freeLength(pivot, dir, want);
    if (len < want * 0.85) {
      // Back to a wall: tilt up a little (rooms have no ceiling) so the floor ahead stays in view
      p = Math.min(Math.max(pitch, 0.82), pitch + (1 - len / want) * 0.45);
      dir = this.offsetDir(yaw, p);
      len = this.freeLength(pivot, dir, want);
    }
    // Never hug her back: past this the wall behind the camera is faded by updateOcclusion()
    len = Math.max(len, Math.min(want, this.minBoom));
    return { position: pivot.clone().addScaledVector(dir, len), len };
  }

  update(delta: number, avatarPosition: THREE.Vector3, avatarRotationY: number): void {
    this.avatarYaw = avatarRotationY;
    this.sinceManual += delta;

    let idealPosition: THREE.Vector3;
    let idealLookAt: THREE.Vector3;

    // Ground velocity of the avatar (works for keyboard, joystick, click-to-walk and travel)
    const vel = this.tmpA.copy(avatarPosition).sub(this.lastAvatarPos).setY(0).divideScalar(Math.max(delta, 1e-3));
    const speed = vel.length() < 12 ? vel.length() : 0; // ignore teleports between rooms
    this.lastAvatarPos.copy(avatarPosition);

    if (this.cinematic) {
      idealPosition = this.cinematic.position.clone();
      idealLookAt = this.cinematic.lookAt.clone();
    } else {
      // Swing round behind her while she walks (unless the visitor is steering the camera)
      if (speed > 0.6 && this.sinceManual > 1.2) {
        const d = wrapAngle(avatarRotationY - this.targetYaw);
        if (Math.abs(d) < 2.3) {
          const rate = 1.7 * Math.min(1, speed / 3) * (1 - Math.abs(d) / 3.2);
          this.targetYaw += d * (1 - Math.exp(-delta * rate));
        }
        this.targetPitch += (this.basePitch - this.targetPitch) * (1 - Math.exp(-delta * 0.8));
        this.targetZoom += (1 - this.targetZoom) * (1 - Math.exp(-delta * 0.8));
      }

      const k = 1 - Math.exp(-delta * 8);
      this.yaw += (this.targetYaw - this.yaw) * k;
      this.pitch += (this.targetPitch - this.pitch) * k;
      this.zoom += (this.targetZoom - this.zoom) * k;

      // Look ahead along her path so you can see where she's heading
      const ahead = speed > 0.4 ? vel.clone().normalize().multiplyScalar(Math.min(1.3, speed * 0.4)) : new THREE.Vector3();
      this.lookAhead.lerp(ahead, 1 - Math.exp(-delta * 2.5));

      // Boom pivot around her shoulders; zoomed in on her face it drops a little
      const pivotY = THREE.MathUtils.lerp(0.85, 1.05, THREE.MathUtils.clamp((this.zoom - 0.45) / 0.8, 0, 1));
      const pivot = avatarPosition.clone().add(new THREE.Vector3(0, pivotY, 0));
      const pose = this.solve(pivot, this.yaw, this.pitch, this.distance * this.zoom);
      // Pull in at once when a wall is near, ease back out when space opens up
      this.boom = pose.len < this.boom ? pose.len : this.boom + (pose.len - this.boom) * (1 - Math.exp(-delta * 2.5));
      const dir = pose.position.clone().sub(pivot).normalize();
      idealPosition = pivot.clone().addScaledVector(dir, this.boom);
      // Aim just above her head and ahead of her: she sits in the lower third, the path ahead fills the frame
      const aimY = THREE.MathUtils.lerp(0.85, 1.2, THREE.MathUtils.clamp((this.zoom - 0.45) / 0.55, 0, 1));
      idealLookAt = pivot.clone().add(this.lookAhead).setY(avatarPosition.y + aimY);
    }

    // Frame-rate independent damping (smooth at 30 fps and 144 fps alike)
    const factor = 1 - Math.exp(-delta * this.smoothness);
    this.currentPosition.lerp(idealPosition, factor);
    // Keep the smoothed camera near the room (it may sit just behind a faded wall)
    if (!this.cinematic) {
      const b = this.bounds();
      this.currentPosition.x = THREE.MathUtils.clamp(this.currentPosition.x, b.minX - 1.6, b.maxX + 1.6);
      this.currentPosition.z = THREE.MathUtils.clamp(this.currentPosition.z, b.minZ - 1.6, b.maxZ + 1.6);
      this.currentPosition.y = THREE.MathUtils.clamp(this.currentPosition.y, 0.4, b.maxY);
    }
    this.currentLookAt.lerp(idealLookAt, Math.min(1, factor * 1.4));

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);

    this.occlusionTimer += delta;
    if (this.occlusionTimer > 0.08) {
      this.occlusionTimer = 0;
      this.updateOcclusion(avatarPosition);
    }
  }
}
