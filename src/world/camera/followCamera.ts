import * as THREE from 'three';
import { collisionSystem } from '../collision';
import { eventBus } from '../../core/events';
import { store } from '../../core/store';

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

  /** First-person look angles (yaw 0 = looking toward +Z, same as the avatar). */
  private fpYaw = 0;
  private fpPitch = -0.08;
  /** Height of her eyes above her root (changes when sitting / lying). */
  public eyeHeight = 1.02;
  public onModeChange: ((mode: 'third' | 'first') => void) | null = null;
  /** Meshes between the camera and the avatar fade out so furniture never hides her. */
  private occluderRoot: THREE.Object3D | null = null;
  private faded = new Set<THREE.Mesh>();
  private raycaster = new THREE.Raycaster();
  private occlusionTimer = 0;
  private lookAhead = new THREE.Vector3();
  private lastAvatarPos = new THREE.Vector3();

  /** Cinematic override (intro): when set, the camera eases to this pose instead of orbiting. */
  private cinematic: { position: THREE.Vector3; lookAt: THREE.Vector3 } | null = null;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.updateForScreenSize();
    window.addEventListener('resize', () => this.updateForScreenSize());

    eventBus.on('camera:orbit', ({ dx, dy }: { dx: number; dy: number }) => {
      if (this.isFirstPerson) {
        this.fpYaw -= dx * 0.006;
        this.fpPitch = THREE.MathUtils.clamp(this.fpPitch - dy * 0.004, -1.1, 0.9);
        return;
      }
      this.targetYaw -= dx * 0.008;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * 0.005, 0.05, 1.25);
    });
    eventBus.on('camera:zoom', (dir: number) => {
      if (this.isFirstPerson) {
        // Scrolling out of first person goes back to third person
        if (dir > 0) eventBus.emit('camera:toggleMode');
        return;
      }
      this.targetZoom = THREE.MathUtils.clamp(this.targetZoom + dir * 0.12, 0.45, 1.6);
    });
    eventBus.on('camera:toggleMode', () => this.setMode(this.isFirstPerson ? 'third' : 'first'));
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
      if (e.code === 'KeyV' && !store.get().inputLocked) eventBus.emit('camera:toggleMode');
    });
  }

  /** Avatar facing, kept so "look at face" knows where the front is. */
  private avatarYaw = 0;

  private updateForScreenSize(): void {
    const isPortrait = window.innerHeight > window.innerWidth;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    if (isPortrait) {
      this.camera.fov = 54;
      this.distance = 6.4;
      this.basePitch = 0.58;
    } else {
      this.camera.fov = 46;
      this.distance = 5.6;
      this.basePitch = 0.56;
    }
    if (store.get().cameraMode === 'first') this.camera.fov = 70;
    this.camera.updateProjectionMatrix();
  }

  get isFirstPerson(): boolean {
    return store.get().cameraMode === 'first';
  }

  setMode(mode: 'third' | 'first'): void {
    if (store.get().cameraMode === mode) return;
    if (mode === 'first') {
      this.fpYaw = this.avatarYaw;
      this.fpPitch = -0.08;
      this.camera.fov = 70;
    } else {
      // Come back out behind her
      this.yaw = this.targetYaw = this.avatarYaw;
      this.updateForScreenSize();
    }
    this.camera.updateProjectionMatrix();
    store.set('cameraMode', mode);
    this.clearFades();
    this.onModeChange?.(mode);
    eventBus.emit('toast:show', mode === 'first' ? '👁️ First person. Drag to look around, V or scroll out to switch back.' : '🎥 Third person view');
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

  /** Fade anything sitting between the camera and her upper body. */
  private updateOcclusion(avatarPosition: THREE.Vector3): void {
    if (!this.occluderRoot || this.isFirstPerson || this.cinematic) {
      if (this.faded.size) this.clearFades();
      return;
    }
    const target = avatarPosition.clone().add(new THREE.Vector3(0, 0.8, 0));
    const dir = target.clone().sub(this.camera.position);
    const dist = dir.length();
    if (dist < 0.3) return;
    const hitNow = new Set<THREE.Mesh>();
    // Three rays (head, chest, feet) so a low table or tall shelf both count
    for (const yOff of [0.45, 0, -0.55]) {
      const t = target.clone().add(new THREE.Vector3(0, yOff, 0));
      const d = t.clone().sub(this.camera.position);
      const len = d.length();
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

  /** Swing around to the front of the avatar, slightly lower and closer, to see her face. */
  lookAtFace(): void {
    if (this.isFirstPerson) this.setMode('third');
    let goal = this.avatarYaw + Math.PI;
    // take the short way round
    while (goal - this.targetYaw > Math.PI) goal -= Math.PI * 2;
    while (goal - this.targetYaw < -Math.PI) goal += Math.PI * 2;
    this.targetYaw = goal;
    this.targetPitch = 0.22;
    this.targetZoom = 0.55;
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
    this.fpYaw = avatarRotationY;
    this.lastAvatarPos.copy(avatarPosition);
    this.lookAhead.set(0, 0, 0);
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

    // First person: eyes at her head, look where the visitor drags
    if (this.isFirstPerson && !this.cinematic) {
      const eye = avatarPosition.clone().add(new THREE.Vector3(0, this.eyeHeight, 0));
      const fwd = new THREE.Vector3(Math.sin(this.fpYaw) * Math.cos(this.fpPitch), Math.sin(this.fpPitch), Math.cos(this.fpYaw) * Math.cos(this.fpPitch));
      eye.add(new THREE.Vector3(Math.sin(this.fpYaw), 0, Math.cos(this.fpYaw)).multiplyScalar(0.12));
      const k = 1 - Math.exp(-delta * 18);
      this.currentPosition.lerp(eye, k);
      this.currentLookAt.copy(this.currentPosition).add(fwd);
      this.camera.position.copy(this.currentPosition);
      this.camera.lookAt(this.currentLookAt);
      this.lastAvatarPos.copy(avatarPosition);
      return;
    }

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

      // Look a little ahead of her when she moves, so you can see where she's going
      const vel = avatarPosition.clone().sub(this.lastAvatarPos).setY(0).divideScalar(Math.max(delta, 1e-3));
      const ahead = vel.lengthSq() > 0.2 && vel.lengthSq() < 100 ? vel.clampLength(0, 5.6).multiplyScalar(0.18) : new THREE.Vector3();
      this.lookAhead.lerp(ahead, 1 - Math.exp(-delta * 3));

      // Look a little lower when zoomed in on the face so it sits mid-frame
      const lookY = THREE.MathUtils.lerp(0.95, 0.75, (this.zoom - 0.45) / 1.15);
      idealLookAt = avatarPosition.clone().add(new THREE.Vector3(0, lookY, 0)).add(this.lookAhead);
      idealPosition = this.clampToRoom(
        idealLookAt.clone().add(this.offsetFor(this.yaw, this.pitch, this.distance * this.zoom))
      );
    }
    this.lastAvatarPos.copy(avatarPosition);

    // Frame-rate independent damping (smooth at 30 fps and 144 fps alike)
    const factor = 1 - Math.exp(-delta * this.smoothness);
    this.currentPosition.lerp(idealPosition, factor);
    this.currentLookAt.lerp(idealLookAt, Math.min(1, factor * 1.6));

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);

    this.occlusionTimer += delta;
    if (this.occlusionTimer > 0.08) {
      this.occlusionTimer = 0;
      this.updateOcclusion(avatarPosition);
    }
  }
}
