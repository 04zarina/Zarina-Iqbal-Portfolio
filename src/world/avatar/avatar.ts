import * as THREE from 'three';
import { createBlobShadow } from '../fx/blobShadow';
import { assetLoader } from '../../core/loaders';
import { AvatarRig, RigPose } from './rig';
import { MixamoAvatar, RIGGED_AVATAR_URL } from './mixamo';
import { audioManager } from '../../audio/audioManager';

export type GestureKind = 'reach' | 'pet' | 'cheer' | 'think' | 'throw';

export class Avatar {
  public group: THREE.Group = new THREE.Group();
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public rotationY: number = 0;

  // Root container for body movement/sway
  private rootNode: THREE.Group = new THREE.Group();
  private modelContainer: THREE.Group = new THREE.Group();
  private shadow: THREE.Mesh;
  public hasExternalModel = false;
  public modelReady = false;
  private resolveReady!: () => void;
  /** Resolves once her model (or the fallback) is in the scene. */
  public readonly ready: Promise<void> = new Promise((r) => (this.resolveReady = r));
  private lastStep = 0;

  // Animation state
  public isMoving = false;
  public isRunning = false;
  public isSitting = false;
  public isHopping = false;
  public isSleeping = false;
  public isWakingUp = false;

  /** Current ground speed in m/s, set by the controller; drives stride length and cadence. */
  public groundSpeed = 0;
  private rig = new AvatarRig();
  private rigged = false;
  private pose: Required<RigPose> = { armDownL: 1.3, armDownR: 1.3, armSwingL: 0, armSwingR: 0, legL: 0, legR: 0, elbowL: 0.15, elbowR: 0.15 };
  private waveTimer = -1;
  private readonly waveDuration = 2.0;
  /** Short one-off body gestures (reach toward an object, pet Zuzu, cheer, think). */
  private gesture: { kind: GestureKind; t: number; dur: number } | null = null;
  private mixamo: MixamoAvatar | null = null;
  /** True when the Mixamo-rigged model with real clips is in use. */
  get hasRig(): boolean {
    return this.mixamo !== null;
  }
  /** Head-height point used by the first-person camera. */
  public readonly eyeHeight = 1.02;
  /** Path queue for auto-walking (room travel, click-to-walk). */
  private pathQueue: THREE.Vector3[] = [];

  // Scripted walk (used by the intro)
  private walkTarget: THREE.Vector3 | null = null;
  private walkScriptSpeed = 1.6;
  private onWalkDone: (() => void) | null = null;

  private hopTimer = 0;
  private walkTime = 0;
  private idleTime = 0;

  // Waking up sequence state
  private wakeUpTimer = 0;
  private wakeUpDuration = 3.8;
  /** Where her hips end up on the side of the bed before she hops off (x/z), from wakeUp(). */
  private bedEdge = new THREE.Vector3();
  private bedOrigin = new THREE.Vector3();
  private wakeUpTarget = new THREE.Vector3();
  private onWakeUpDone: (() => void) | null = null;

  // Procedural fallback parts
  private headGroup: THREE.Group = new THREE.Group();
  private leftArm: THREE.Group = new THREE.Group();
  private rightArm: THREE.Group = new THREE.Group();
  private leftLeg: THREE.Group = new THREE.Group();
  private rightLeg: THREE.Group = new THREE.Group();

  constructor() {
    this.shadow = createBlobShadow(0.42);
    this.group.add(this.shadow);
    this.rootNode.add(this.modelContainer);
    this.group.add(this.rootNode);

    this.initModel().finally(() => this.resolveReady());
  }

  private async initModel(): Promise<void> {
    const rigged = await MixamoAvatar.load(RIGGED_AVATAR_URL);
    if (rigged) {
      const model = rigged.scene;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const s = 1.22 / Math.max(0.01, box.getSize(new THREE.Vector3()).y);
      model.scale.setScalar(s);
      model.updateMatrixWorld(true);
      model.position.y = -new THREE.Box3().setFromObject(model).min.y;
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        // Matte skin and cloth: a metallic material renders almost black without an env map
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && 'metalness' in mat) {
          mat.metalness = 0;
          mat.roughness = Math.max(mat.roughness, 0.8);
          mat.needsUpdate = true;
        }
      });
      this.modelContainer.add(model);
      this.mixamo = new MixamoAvatar(model, rigged.clips);
      this.mixamo.setSpeed('wave', 1.3);
      this.mixamo.setSpeed('cheer', 1.4);
      this.mixamo.setSpeed('reach', 1.3);
      this.mixamo.setSpeed('throw', 1.2);
      this.mixamo.setSpeed('pet', 1.6);
      this.mixamo.setSpeed('sleep', 1.4);
      this.mixamo.setSpeed('wake', 1.5);
      this.hasExternalModel = true;
      this.modelReady = true;
      // startInBed() may have run before the model arrived: switch to the clip-based bed pose
      if (this.isSleeping && !this.isWakingUp && this.lastBedPos) this.startInBed(this.lastBedPos);
      else this.mixamo.play('idle', 0);
      return;
    }
    const gltf = await assetLoader.loadGLTF('avatar');
    if (gltf) {
      // Auto-scale: measure raw height then scale to target
      gltf.scale.set(1, 1, 1);
      // The avatar GLB faces +X, but the controller treats +Z as forward.
      // Turn it so she faces the direction she walks.
      gltf.rotation.y = -Math.PI / 2;
      gltf.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(gltf);
      const size = box.getSize(new THREE.Vector3());
      const rawHeight = size.y > 0 ? size.y : 1.0;

      // Target height ~1.22m (chibi proportions)
      const targetHeight = 1.22;
      const scale = targetHeight / rawHeight;
      gltf.scale.set(scale, scale, scale);
      gltf.updateMatrixWorld(true);

      // Align feet to ground (y = 0)
      const scaledBox = new THREE.Box3().setFromObject(gltf);
      gltf.position.y = -scaledBox.min.y;

      // Ensure PBR + standard materials both work under ambient/directional lights
      gltf.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          // Convert basic materials to Lambert so they respond to scene lighting
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => {
              if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
                // Keep PBR as-is — works fine with DirectionalLight + AmbientLight
                m.envMapIntensity = 0.6;
                m.needsUpdate = true;
              }
              return m;
            });
          } else if (
            mesh.material instanceof THREE.MeshStandardMaterial ||
            mesh.material instanceof THREE.MeshPhysicalMaterial
          ) {
            mesh.material.envMapIntensity = 0.6;
            mesh.material.needsUpdate = true;
          }
        }
      });

      this.modelContainer.add(gltf);
      this.hasExternalModel = true;
      this.rigged = this.rig.apply(gltf);
      this.modelReady = true;
      console.log('✨ Loaded avatar GLB successfully! Height:', rawHeight.toFixed(3), '→ scale:', scale.toFixed(4));
    } else {
      // Procedural Chibi Girl fallback
      this.buildProceduralChibiGirl();
      console.log('✨ Using procedural chibi avatar');
    }
  }

  private buildProceduralChibiGirl(): void {
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xFFE6D5 });
    const blushMat = new THREE.MeshLambertMaterial({ color: 0xFFB3C7 });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x8A5A4A });
    const beanieMat = new THREE.MeshLambertMaterial({ color: 0xFFE9A3 });
    const pompomMat = new THREE.MeshLambertMaterial({ color: 0xFFF6EC });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x5A3A32 });
    const eyeHighlightMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const vestMat = new THREE.MeshLambertMaterial({ color: 0xFFB3C7 });
    const hoodieMat = new THREE.MeshLambertMaterial({ color: 0xFFF6EC });
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0xBDE0FF });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0xFFF6EC });

    // Torso
    const torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.45, 16), vestMat);
    torsoMesh.position.y = 0.58;
    this.modelContainer.add(torsoMesh);

    // Collar
    const collarMesh = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 8, 16), hoodieMat);
    collarMesh.rotation.x = Math.PI / 2;
    collarMesh.position.y = 0.8;
    this.modelContainer.add(collarMesh);

    // Head
    this.headGroup.position.set(0, 1.05, 0);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 20), skinMat);
    this.headGroup.add(headMesh);

    // Blush
    const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), blushMat);
    cheekL.position.set(0.2, -0.06, 0.34);
    const cheekR = cheekL.clone();
    cheekR.position.set(-0.2, -0.06, 0.34);
    this.headGroup.add(cheekL, cheekR);

    // Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), eyeMat);
    eyeL.position.set(0.14, 0.02, 0.36);
    const eyeR = eyeL.clone();
    eyeR.position.set(-0.14, 0.02, 0.36);
    const sparkL = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), eyeHighlightMat);
    sparkL.position.set(0.155, 0.045, 0.375);
    const sparkR = sparkL.clone();
    sparkR.position.set(-0.125, 0.045, 0.375);
    this.headGroup.add(eyeL, eyeR, sparkL, sparkR);

    // Beanie & Hair
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.41, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), beanieMat);
    beanie.position.y = 0.05;
    const pompom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), pompomMat);
    pompom.position.set(0, 0.45, -0.1);
    this.headGroup.add(beanie, pompom);
    this.modelContainer.add(this.headGroup);

    // Limbs
    const armGeo = new THREE.CapsuleGeometry(0.07, 0.22, 8, 12);
    this.leftArm.position.set(0.32, 0.72, 0);
    this.leftArm.add(new THREE.Mesh(armGeo, vestMat));
    this.rightArm.position.set(-0.32, 0.72, 0);
    this.rightArm.add(new THREE.Mesh(armGeo, vestMat));
    this.modelContainer.add(this.leftArm, this.rightArm);

    const legGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.26, 12);
    const shoeGeo = new THREE.BoxGeometry(0.15, 0.12, 0.22);
    this.leftLeg.position.set(0.14, 0.38, 0);
    this.leftLeg.add(new THREE.Mesh(legGeo, pantsMat));
    const sL = new THREE.Mesh(shoeGeo, shoeMat); sL.position.set(0, -0.22, 0.03);
    this.leftLeg.add(sL);

    this.rightLeg.position.set(-0.14, 0.38, 0);
    this.rightLeg.add(new THREE.Mesh(legGeo, pantsMat));
    const sR = new THREE.Mesh(shoeGeo, shoeMat); sR.position.set(0, -0.22, 0.03);
    this.rightLeg.add(sR);

    this.modelContainer.add(this.leftLeg, this.rightLeg);
  }

  /** Blend from where she stood into the bed-edge pose when she lies down. */
  private bedTween: { from: THREE.Vector3; yaw: number; t: number } | null = null;

  /** Last bed spot given to startInBed/goToBed. */
  private lastBedPos: THREE.Vector3 | null = null;

  /**
   * Rigged avatar in bed. p = 0: lying along the bed, head on the pillow (-Z). p = 1: sitting on
   * the side edge of the mattress facing the room (+X), legs over the side. In between (while
   * the WakeUp / LyingDown clip sits her up) she swivels on her bottom from one to the other, so
   * her legs drop over the edge instead of through the mattress. The group stands on the clip's
   * floor 0.27 m up, which rests her back on top of the blanket (~0.65 m).
   */
  private placeInBed(bedPos: THREE.Vector3, p: number): void {
    // Hips position (relative to the clip origin, along her facing) through the WakeUp clip
    const hipsZ = p < 0.4 ? -0.27 : p < 0.6 ? THREE.MathUtils.lerp(-0.27, -0.23, (p - 0.4) / 0.2) : p < 0.8 ? THREE.MathUtils.lerp(-0.23, -0.02, (p - 0.6) / 0.2) : -0.01;
    const k = THREE.MathUtils.smoothstep(p, 0.42, 0.78);
    const yaw = k * (Math.PI / 2);
    // Lying on the room-side half of the bed (head on that pillow), so going from the edge to
    // lying down is a short shuffle sideways rather than a slide across the mattress
    const hipsX = THREE.MathUtils.lerp(bedPos.x + 0.4, bedPos.x + 0.62, k);
    const hipsWZ = bedPos.z - 0.55;
    this.position.set(hipsX - Math.sin(yaw) * hipsZ, 0.27, hipsWZ - Math.cos(yaw) * hipsZ);
    this.rotationY = yaw;
    this.rootNode.position.set(0, 0, 0);
    this.rootNode.rotation.set(0, 0, 0);
    this.rootNode.scale.set(1, 1, 1);
    this.shadow.visible = false;
  }

  startInBed(bedPos: THREE.Vector3): void {
    this.isSleeping = true;
    this.isWakingUp = false;
    this.isSitting = false;
    this.isMoving = false;
    this.lastBedPos = bedPos.clone();
    if (this.mixamo) {
      this.bedTween = null;
      this.placeInBed(bedPos, 0);
      this.mixamo.play('sleep', 0, true, true); // already lying down
      return;
    }
    this.position.copy(bedPos);
    this.position.y = 0.52; // Bed mattress height
    this.rotationY = 0; // Lie along the bed with the head on the pillow (-Z)

    // Lie down nestled on bed
    this.rootNode.rotation.x = -Math.PI / 2;
    this.rootNode.rotation.y = 0;
    this.rootNode.rotation.z = 0;
    this.rootNode.position.set(0, 0.22, 0);
    this.shadow.visible = false;
  }

  goToBed(bedPos: THREE.Vector3, onComplete?: () => void): void {
    this.cancelAutoWalk();
    this.isSleeping = true;
    this.isWakingUp = false;
    this.isSitting = false;
    this.isMoving = false;
    this.waveTimer = -1;
    this.gesture = null;
    this.lastBedPos = bedPos.clone();
    if (this.mixamo) {
      // Walk up to the side of the bed, sit on the edge, lie back and swivel onto the pillow
      // (LyingDown clip, held on its last frame)
      this.isSleeping = false;
      const stand = new THREE.Vector3(bedPos.x + 1.1, 0, bedPos.z - 0.55);
      const lie = () => {
        this.isSleeping = true;
        this.isWakingUp = false;
        this.isMoving = false;
        this.groundSpeed = 0;
        this.bedTween = { from: this.position.clone(), yaw: this.rotationY, t: 0 };
        this.mixamo!.play('sleep', 0.45, true);
        this.shadow.visible = false;
        onComplete?.();
      };
      if (Math.hypot(this.position.x - stand.x, this.position.z - stand.z) > 0.25) this.walkTo(stand, 1.8, lie);
      else lie();
      return;
    }
    this.position.copy(bedPos);
    this.position.y = 0.52;
    this.rotationY = 0;

    this.rootNode.rotation.x = -Math.PI / 2;
    this.rootNode.rotation.y = 0;
    this.rootNode.rotation.z = 0;
    this.rootNode.position.set(0, 0.22, 0);
    this.shadow.visible = false;
    if (onComplete) onComplete();
  }

  wakeUp(bedPos: THREE.Vector3, outPos: THREE.Vector3, onComplete?: () => void): void {
    this.isSleeping = true;
    this.isWakingUp = true;
    this.isSitting = false;
    this.wakeUpTimer = 0;
    this.bedOrigin.copy(bedPos);
    this.bedOrigin.y = 0.52;
    this.wakeUpTarget.copy(outPos);
    this.wakeUpTarget.y = 0;
    // Sit on the mattress edge facing the way she gets out, hips ~0.7 m short of where she'll stand
    const yaw = this.stepOutYaw();
    this.bedEdge.set(outPos.x - Math.sin(yaw) * 0.72, 0, outPos.z - Math.cos(yaw) * 0.72);
    this.onWakeUpDone = onComplete || null;
    this.lastBedPos = bedPos.clone();
    if (this.mixamo) {
      // WakeUp clip (LyingDown reversed): sit up on the edge, then hop down and walk out
      this.bedTween = null;
      this.placeInBed(bedPos, 0);
      this.mixamo.play('sleep', 0, true, true);
      this.mixamo.play('wake', 0.15, true);
      this.wakeUpDuration = this.mixamo.duration('wake');
    }
  }

  /** Rigged wake-up: where she sits on the bed edge before hopping down. */
  private wakeHopFrom = new THREE.Vector3();
  private readonly wakeHopTime = 0.6;
  private get wakeHopping(): boolean {
    return this.isWakingUp && !!this.mixamo && this.wakeUpTimer >= this.wakeUpDuration;
  }

  sitOnChair(chairPos: THREE.Vector3, rotY: number = 0, seatHeight = 0.42): void {
    this.isSitting = true;
    this.isSleeping = false;
    this.isMoving = false;
    this.pathQueue = [];
    this.walkTarget = null;
    this.waveTimer = -1;
    this.gesture = null;
    this.position.copy(chairPos);
    this.position.y = seatHeight;
    this.rotationY = rotY;
    // Drop the hips onto the seat. Sitting clip: hips are 0.365 m above its floor, which puts
    // them ~0.07 m above the seat. GPU rig: the rig swings the legs forward (see updateRig).
    this.rootNode.rotation.set(0, 0, 0);
    this.rootNode.scale.set(1, 1, 1);
    if (this.mixamo) {
      // Seat heights in room code are estimates; measure the real seat top under her hips so she
      // never sinks into a stool or floats above a cushion. Sitting clip: hips 0.365 m above its floor.
      const top = this.findSeatTop(chairPos.x, chairPos.z, seatHeight);
      this.rootNode.position.set(0, top - seatHeight + 0.06 - 0.365, 0);
    } else {
      this.rootNode.position.set(0, this.rigged ? -0.4 : -0.06, 0);
    }
    this.shadow.visible = false;
  }

  private seatRay = new THREE.Raycaster();

  /** Highest surface within ~0.3 m of the expected seat height at (x, z), or the guess itself. */
  private findSeatTop(x: number, z: number, guess: number): number {
    let root: THREE.Object3D = this.group;
    while (root.parent) root = root.parent;
    if (root === this.group) return guess;
    const meshes: THREE.Object3D[] = [];
    root.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o);
    });
    const avatar = this.group;
    this.seatRay.set(new THREE.Vector3(x, guess + 0.35, z), new THREE.Vector3(0, -1, 0));
    this.seatRay.far = 0.65;
    for (const hit of this.seatRay.intersectObjects(meshes, false)) {
      let o: THREE.Object3D | null = hit.object;
      let mine = false;
      while (o) {
        if (o === avatar) mine = true;
        o = o.parent;
      }
      if (!mine && hit.point.y >= guess - 0.25) return hit.point.y;
    }
    return guess;
  }

  /** Where to stand when getting up from the current seat. */
  public standUpAt: THREE.Vector3 | null = null;

  standUp(standPos?: THREE.Vector3): void {
    if (!this.isSitting && !standPos) return;
    this.isSitting = false;
    const to = standPos ?? this.standUpAt;
    if (to) {
      this.position.copy(to);
    }
    this.standUpAt = null;
    this.position.y = 0;
    this.rootNode.position.set(0, 0, 0);
    this.rootNode.rotation.set(0, 0, 0);
    this.rootNode.scale.set(1, 1, 1);
    this.shadow.visible = true;
  }

  hop(): void {
    if (!this.isHopping && !this.isSitting && !this.isSleeping) {
      this.isHopping = true;
      this.hopTimer = 0;
    }
  }

  /** Rig override used while getting out of bed (legs and arms angles). */
  private wakeRig: { legs: number; arms: number } | null = null;

  /** Upper body tilted by theta (−π/2 = lying, 0 = upright) around the hips, which stay put on the mattress. */
  private setSitUpPose(theta: number): void {
    const hip = 0.525; // hip height above the feet for a 1.22 m avatar
    this.rootNode.rotation.set(theta, 0, 0);
    this.rootNode.position.set(0, 0.22 - hip * Math.cos(theta), -hip - hip * Math.sin(theta));
  }

  private stepOutYaw(): number {
    return Math.atan2(this.wakeUpTarget.x - this.bedOrigin.x, this.wakeUpTarget.z - this.bedOrigin.z);
  }

  /** Friendly wave with her right hand. */
  wave(): void {
    if (!this.isSleeping && !this.isSitting) this.waveTimer = 0;
  }

  get isWaving(): boolean {
    return this.waveTimer >= 0;
  }

  /** One-off gesture. 'reach' for touching objects, 'pet' for Zuzu, 'cheer' for wins, 'think' for reading. */
  /** Returns how long the gesture lasts in seconds (0 if skipped). */
  doGesture(kind: GestureKind, dur?: number): number {
    if (this.isSleeping || this.isWakingUp) return 0;
    if (this.isSitting && kind !== 'think' && kind !== 'reach') return 0;
    if (this.mixamo) {
      // Clips: keep the Sitting pose while seated; standing gestures play their whole clip
      if (this.isSitting || kind === 'think') return 0;
      const d = this.mixamo.duration(kind) || dur || 1;
      this.gesture = { kind, t: 0, dur: d };
      this.mixamo.play(kind, 0.2, true);
      return d;
    }
    const d = dur ?? { reach: 0.9, pet: 1.6, cheer: 1.4, think: 1.8, throw: 0.9 }[kind];
    this.gesture = { kind, t: 0, dur: d };
    return d;
  }

  /**
   * Seconds from the start of a gesture to its key moment: the hand touching Zuzu ('pet') or
   * letting go of the ball ('throw'). Use it to time hearts, purrs and the ball's launch.
   */
  gestureContact(kind: GestureKind): number {
    if (!this.mixamo) return kind === 'pet' ? 0.4 : kind === 'throw' ? 0.35 : 0;
    // Clip times after trimming (see TRIM in mixamo.ts), divided by playback speed
    if (kind === 'pet') return 2.5 / 1.6;
    if (kind === 'throw') return 0.6 / 1.2;
    return 0;
  }

  /** Walk a list of waypoints in order (from the navigation grid). */
  followPath(points: THREE.Vector3[], speed = 2.4, onDone?: () => void): void {
    if (!points.length) {
      onDone?.();
      return;
    }
    this.pathQueue = points.slice(1).map((p) => p.clone().setY(0));
    const finish = onDone || null;
    const next = () => {
      const p = this.pathQueue.shift();
      if (p) this.walkTo(p, speed, next);
      else finish?.();
    };
    this.walkTo(points[0], speed, next);
  }

  /** True while a scripted walk is running (intro, travel, click-to-walk). */
  get isAutoWalking(): boolean {
    return this.walkTarget !== null;
  }

  cancelAutoWalk(): void {
    this.walkTarget = null;
    this.pathQueue = [];
    this.onWalkDone = null;
    this.isMoving = false;
    this.groundSpeed = 0;
  }

  /** Something held in her right hand (e.g. the watering can). */
  private heldProp: THREE.Object3D | null = null;
  attachToHand(obj: THREE.Object3D | null): void {
    if (this.heldProp) this.rootNode.remove(this.heldProp);
    this.heldProp = obj;
    if (obj) {
      obj.position.set(-0.3, 0.5, 0.22);
      this.rootNode.add(obj);
    }
  }
  get holding(): THREE.Object3D | null {
    return this.heldProp;
  }

  /** Hide/show the body (first-person camera hides it). */
  setBodyVisible(v: boolean): void {
    this.rootNode.visible = v;
    this.shadow.visible = v && !this.isSleeping && !this.isSitting;
  }

  /** Walk on her own to a point (used by the intro). Input should be locked meanwhile. */
  walkTo(target: THREE.Vector3, speed = 1.6, onDone?: () => void): void {
    this.walkTarget = target.clone().setY(0);
    this.walkScriptSpeed = speed;
    this.onWalkDone = onDone || null;
  }

  /** Smoothly turn toward a yaw over time; returns true once facing it. */
  private turnToward(yaw: number, delta: number, rate = 8): boolean {
    let d = yaw - this.rotationY;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.rotationY += d * (1 - Math.exp(-delta * rate));
    return Math.abs(d) < 0.05;
  }

  public faceYaw: number | null = null;

  /** Blend the GPU rig toward the pose for her current state. */
  private updateRig(delta: number): void {
    if (this.gesture) {
      this.gesture.t += delta;
      if (this.gesture.t >= this.gesture.dur) this.gesture = null;
    }
    if (this.mixamo) {
      this.updateMixamo(delta);
      return;
    }
    if (!this.rigged) return;
    const target: Required<RigPose> = { armDownL: 1.3, armDownR: 1.3, armSwingL: 0, armSwingR: 0, legL: 0, legR: 0, elbowL: 0.15, elbowR: 0.15 };
    let snap = false;

    if (this.wakeRig) {
      target.legL = target.legR = this.wakeRig.legs;
      target.armDownL = target.armDownR = this.wakeRig.arms;
      snap = true;
    } else if (this.isSitting) {
      // Hands resting on the lap: upper arms forward, forearms folded a little
      target.legL = target.legR = 1.05;
      target.armDownL = target.armDownR = 1.25;
      target.armSwingL = target.armSwingR = 0.45;
      target.elbowL = target.elbowR = 0.7;
    } else if (this.isMoving && !this.isSleeping) {
      const s = THREE.MathUtils.clamp(this.groundSpeed / 3.2, 0, 1.5);
      const stride = Math.sin(this.walkTime) * (0.18 + 0.32 * Math.min(s, 1)) * (this.isRunning ? 1.25 : 1);
      target.legL = stride;
      target.legR = -stride;
      target.armSwingL = -stride * 0.85;
      target.armSwingR = stride * 0.85;
      target.armDownL = target.armDownR = this.isRunning ? 1.15 : 1.25;
      target.elbowL = target.elbowR = this.isRunning ? 0.9 : 0.3;
      snap = true;
    } else if (!this.isSleeping) {
      // Idle: arms drift very slightly with breathing
      const b = Math.sin(this.idleTime * 2.2) * 0.03;
      target.armDownL = 1.3 + b;
      target.armDownR = 1.3 + b;
    }

    if (this.heldProp && !this.isSitting) {
      // Carry it in front of her: right forearm forward and bent
      target.armDownR = 1.2;
      target.armSwingR = 0.55;
      target.elbowR = 0.85;
    }

    if (this.gesture && !this.isMoving) {
      const g = this.gesture;
      const p = g.t / g.dur;
      const w = Math.max(0, Math.min(1, Math.min(p, 1 - p) * 5));
      const set = (k: keyof RigPose, v: number) => (target[k] = THREE.MathUtils.lerp(target[k] as number, v, w));
      if (g.kind === 'reach' || g.kind === 'throw') {
        set('armDownR', 1.05);
        set('armSwingR', 1.0);
        set('elbowR', 0.25);
      } else if (g.kind === 'pet') {
        // Reach down and forward, hand stroking back and forth
        set('armDownR', 1.1);
        set('armSwingR', 0.85 + Math.sin(g.t * 9) * 0.22);
        set('elbowR', 0.35);
      } else if (g.kind === 'cheer') {
        const bounce = Math.sin(g.t * 14) * 0.15;
        set('armDownL', -1.15 + bounce);
        set('armDownR', -1.15 - bounce);
        set('elbowL', 0.35);
        set('elbowR', 0.35);
      } else if (g.kind === 'think') {
        // Hand up to the chin
        set('armDownR', 1.0);
        set('armSwingR', 0.9);
        set('elbowR', 2.1);
      }
    }

    if (this.waveTimer >= 0) {
      this.waveTimer += delta;
      const t = this.waveTimer / this.waveDuration;
      const w = Math.max(0, Math.min(1, Math.min(t, 1 - t) * 6)); // ease in and out
      // Upper arm out to the side and a little down, forearm folded up, hand rocking side to side
      target.armDownR = THREE.MathUtils.lerp(target.armDownR, 0.5, w);
      target.armSwingR = THREE.MathUtils.lerp(target.armSwingR, 0.3, w);
      target.elbowR = THREE.MathUtils.lerp(target.elbowR, 1.85 + Math.sin(this.waveTimer * 11) * 0.38, w);
      if (t >= 1) this.waveTimer = -1;
    }

    const k = snap ? 1 - Math.exp(-delta * 20) : 1 - Math.exp(-delta * 9);
    const fast = 1 - Math.exp(-delta * 18);
    (Object.keys(target) as (keyof RigPose)[]).forEach((key) => {
      const quick = (this.waveTimer >= 0 || this.gesture) && key.endsWith('R');
      this.pose[key] += ((target[key] as number) - this.pose[key]) * (quick ? fast : k);
    });
    this.rig.set(this.pose);
  }

  private updateMixamo(delta: number): void {
    const m = this.mixamo!;
    if (this.isSleeping && !this.isWakingUp) m.play('sleep', 0, true, true);
    else if (this.wakeHopping) m.play('idle', 0.4);
    else if (this.isWakingUp) m.play('wake', 0.15, true);
    else if (this.isSitting) m.play('sit', 0.3);
    else if (this.isMoving) {
      // Walking cancels one-off clips so she never slides around mid-gesture
      this.waveTimer = -1;
      this.gesture = null;
      const clip = this.isRunning ? 'run' : 'walk';
      m.play(clip, 0.18);
      // The Walk clip covers roughly 1.6 m/s at 1x; running plays the same clip faster
      m.setSpeed(clip, THREE.MathUtils.clamp(this.groundSpeed / 1.6, 0.6, this.isRunning ? 2.6 : 1.8));
    } else if (this.waveTimer >= 0) {
      m.play('wave', 0.2, true);
      this.waveTimer += delta;
      if (this.waveTimer > m.duration('wave')) this.waveTimer = -1;
    } else if (this.gesture) {
      m.play(this.gesture.kind === 'think' ? 'idle' : this.gesture.kind, 0.2, true);
    } else m.play('idle', 0.3);
    m.update(delta);
  }

  update(delta: number): void {
    // Scripted walk for the intro
    if (this.walkTarget && !this.isSleeping && !this.isSitting) {
      const toTarget = this.walkTarget.clone().sub(this.position).setY(0);
      const dist = toTarget.length();
      if (dist > 0.05) {
        const step = Math.min(dist, this.walkScriptSpeed * delta);
        this.position.addScaledVector(toTarget.normalize(), step);
        this.turnToward(Math.atan2(toTarget.x, toTarget.z), delta, 10);
        this.isMoving = true;
        this.isRunning = false;
        this.groundSpeed = this.walkScriptSpeed;
      } else {
        this.walkTarget = null;
        this.isMoving = false;
        this.groundSpeed = 0;
        const done = this.onWalkDone;
        this.onWalkDone = null;
        done?.();
      }
    } else if (this.faceYaw !== null && !this.isMoving) {
      if (this.turnToward(this.faceYaw, delta, 6)) this.faceYaw = null;
    }

    this.updateRig(delta);
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;

    // 1a. Rigged wake-up: WakeUp clip on the bed edge, then hop down and walk to outPos
    if (this.isWakingUp && this.mixamo) {
      this.wakeUpTimer += delta;
      const hopT = this.wakeUpTimer - this.wakeUpDuration;
      if (hopT < 0 && this.lastBedPos) {
        this.placeInBed(this.lastBedPos, this.mixamo.progress('wake'));
        this.wakeHopFrom.copy(this.position);
      }
      if (hopT >= 0) {
        const k = THREE.MathUtils.smoothstep(Math.min(1, hopT / this.wakeHopTime), 0, 1);
        const landing = this.wakeHopFrom.clone().add(new THREE.Vector3(Math.sin(this.rotationY) * 0.45, 0, Math.cos(this.rotationY) * 0.45));
        landing.y = 0;
        this.position.lerpVectors(this.wakeHopFrom, landing, k);
        this.shadow.visible = k > 0.6;
        if (hopT >= this.wakeHopTime) {
          this.isWakingUp = false;
          this.isSleeping = false;
          this.shadow.visible = true;
          const done = this.onWakeUpDone;
          this.onWakeUpDone = null;
          this.walkTo(this.wakeUpTarget, 1.4, () => done?.());
        }
      }
      return;
    }

    // Clips carry their own breathing, bob and crouch: keep the body container neutral
    if (this.mixamo && !this.isSleeping) {
      this.rootNode.rotation.set(0, 0, 0);
      this.rootNode.scale.set(1, 1, 1);
      if (!this.isSitting) this.rootNode.position.set(0, 0, 0);
      if (this.isMoving) {
        this.walkTime += delta * (4.5 + this.groundSpeed * 1.6);
        const step = Math.floor(this.walkTime / Math.PI);
        if (step !== this.lastStep) {
          this.lastStep = step;
          audioManager.playStep(this.isRunning);
        }
      }
      if (this.isHopping && !this.isSitting) {
        this.hopTimer += delta * 4;
        if (this.hopTimer >= 1.0) this.isHopping = false;
        else this.rootNode.position.y = Math.max(0, Math.sin(this.hopTimer * Math.PI) * 0.55);
      }
      return;
    }

    // 1. Waking-up Sequence
    if (this.isWakingUp) {
      this.wakeUpTimer += delta;
      const p = Math.min(this.wakeUpTimer / this.wakeUpDuration, 1.0);

      // Hips stay ON the mattress the whole time (top of the blanket is ~0.68 m), so she
      // never sinks into the bed: sit up, stretch, swivel to the edge, then hop down beside it.
      const hipsY = this.bedOrigin.y + 0.22;
      const seatY = hipsY - 0.125; // sitOnChair convention: hips = position.y + 0.125
      const yawOut = this.stepOutYaw();
      if (p < 0.24) {
        // Phase 1: sit up, pivoting at the hips so the legs stay flat on top of the blanket
        const sitProgress = THREE.MathUtils.smoothstep(p / 0.24, 0, 1);
        const theta = THREE.MathUtils.lerp(-Math.PI / 2, 0, sitProgress);
        this.position.copy(this.bedOrigin);
        this.rotationY = 0;
        this.setSitUpPose(theta);
        // Legs stay flat on the bed while the torso rises: 0 lying down, 90° once upright
        this.wakeRig = { legs: theta + Math.PI / 2, arms: 1.3 };
      } else if (p < 0.44) {
        // Phase 2: yawn and stretch both arms up
        const yawnP = (p - 0.24) / 0.2;
        const stretch = Math.sin(yawnP * Math.PI);
        this.position.copy(this.bedOrigin);
        this.setSitUpPose(0);
        this.rootNode.scale.set(1.0 - stretch * 0.04, 1.0 + stretch * 0.06, 1.0 - stretch * 0.04);
        this.rootNode.rotation.z = Math.sin(yawnP * Math.PI * 2) * 0.06;
        this.wakeRig = { legs: Math.PI / 2, arms: THREE.MathUtils.lerp(1.3, -1.25, stretch) };
      } else if (p < 0.7) {
        // Phase 3: swivel on her bottom toward the side of the bed, legs swinging over the edge
        const k = THREE.MathUtils.smoothstep((p - 0.44) / 0.26, 0, 1);
        const hipStart = new THREE.Vector3(this.bedOrigin.x, seatY, this.bedOrigin.z - 0.525);
        this.position.lerpVectors(hipStart, new THREE.Vector3(this.bedEdge.x, seatY, this.bedEdge.z), k);
        this.rotationY = THREE.MathUtils.lerp(0, yawOut, k);
        this.rootNode.scale.set(1, 1, 1);
        this.rootNode.rotation.set(0, 0, 0);
        this.rootNode.position.set(0, -0.4, 0);
        this.wakeRig = { legs: THREE.MathUtils.lerp(Math.PI / 2, 1.15, k), arms: 1.3 };
      } else {
        // Phase 4: slide forward off the edge, feet to the floor, stand up and take a step
        const k = (p - 0.7) / 0.3;
        const standP = THREE.MathUtils.smoothstep(k / 0.6, 0, 1);
        const stepP = THREE.MathUtils.smoothstep(k, 0, 1);
        this.rotationY = yawOut;
        this.rootNode.scale.set(1, 1, 1);
        this.rootNode.rotation.set(0, 0, 0);
        this.position.lerpVectors(new THREE.Vector3(this.bedEdge.x, seatY, this.bedEdge.z), this.wakeUpTarget, stepP);
        this.position.y = THREE.MathUtils.lerp(seatY, 0, standP);
        this.rootNode.position.set(0, THREE.MathUtils.lerp(-0.4, 0, standP), 0);
        this.wakeRig = { legs: 1.15 * (1 - standP), arms: 1.3 };
        this.shadow.visible = standP > 0.6;
      }

      if (p >= 1.0) {
        this.isWakingUp = false;
        this.isSleeping = false;
        this.wakeRig = null;
        this.rootNode.position.set(0, 0, 0);
        this.position.copy(this.wakeUpTarget);
        this.rotationY = yawOut;
        this.rootNode.rotation.set(0, 0, 0);
        this.rootNode.scale.set(1, 1, 1);
        this.shadow.visible = true;
        if (this.onWakeUpDone) {
          this.onWakeUpDone();
          this.onWakeUpDone = null;
        }
      }
      return;
    }

    if (this.isSleeping && this.mixamo) {
      if (this.lastBedPos) {
        this.placeInBed(this.lastBedPos, 1 - this.mixamo.progress('sleep'));
        const tw = this.bedTween;
        if (tw) {
          tw.t += delta;
          const k = THREE.MathUtils.smoothstep(Math.min(1, tw.t / 0.45), 0, 1);
          this.position.lerpVectors(tw.from, this.position, k);
          let d = this.rotationY - tw.yaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          this.rotationY = tw.yaw + d * k;
          if (k >= 1) this.bedTween = null;
        }
      }
      return;
    }

    if (this.isSleeping) {
      // Peaceful breathing while nestled in bed
      this.idleTime += delta;
      const breath = Math.sin(this.idleTime * 1.8) * 0.02;
      this.rootNode.scale.set(1 + breath * 0.3, 1 + breath, 1 + breath * 0.3);
      return;
    }

    if (this.isSitting) {
      // Gentle sitting breathing
      this.idleTime += delta;
      const breath = Math.sin(this.idleTime * 2.0) * 0.015;
      this.rootNode.scale.set(1 + breath * 0.3, 1 + breath, 1 + breath * 0.3);
      return;
    }

    // 2. Hopping jump curve
    if (this.isHopping) {
      this.hopTimer += delta * 4;
      const hopHeight = Math.sin(this.hopTimer * Math.PI) * 0.55;
      if (this.hopTimer >= 1.0) {
        this.isHopping = false;
        this.rootNode.position.y = 0;
      } else {
        this.rootNode.position.y = Math.max(0, hopHeight);
      }
    }

    // 3. Locomotion & Idle Animation
    if (this.isMoving) {
      this.idleTime = 0;
      // Cadence follows ground speed (about 1.6 steps a second at a walk)
      this.walkTime += delta * (4.5 + this.groundSpeed * 1.6);

      // Footstep sound twice per stride cycle
      const step = Math.floor(this.walkTime / Math.PI);
      if (step !== this.lastStep) {
        this.lastStep = step;
        audioManager.playStep(this.isRunning);
      }

      // Cute chibi walking bob and side tilt
      const bob = Math.abs(Math.cos(this.walkTime)) * (this.isRunning ? 0.06 : 0.035);
      if (!this.isHopping) {
        this.rootNode.position.y = bob;
      }

      // Waddle side-to-side tilt
      const tilt = Math.sin(this.walkTime) * (this.isRunning ? 0.05 : 0.025);
      this.rootNode.rotation.z = tilt;
      this.rootNode.rotation.x = THREE.MathUtils.lerp(this.rootNode.rotation.x, this.isRunning ? 0.1 : 0.03, delta * 8);

      // If using procedural parts, swing limbs
      if (!this.hasExternalModel) {
        const legAngle = Math.sin(this.walkTime) * (this.isRunning ? 0.7 : 0.45);
        this.leftLeg.rotation.x = legAngle;
        this.rightLeg.rotation.x = -legAngle;
        this.leftArm.rotation.x = -legAngle * 0.9;
        this.rightArm.rotation.x = legAngle * 0.9;
      }
    } else {
      this.walkTime = 0;
      this.idleTime += delta;

      // Smooth reset of tilt & lean
      this.rootNode.rotation.z = THREE.MathUtils.lerp(this.rootNode.rotation.z, 0, delta * 10);
      this.rootNode.rotation.x = THREE.MathUtils.lerp(this.rootNode.rotation.x, 0, delta * 10);

      // Idle breathing squash and stretch
      const breath = Math.sin(this.idleTime * 2.2) * 0.02;
      this.rootNode.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.5);
      if (!this.isHopping) {
        // Crouch a little while petting Zuzu
        const g = this.gesture;
        const crouch = g && g.kind === 'pet' ? Math.min(1, Math.min(g.t, g.dur - g.t) * 4) * 0.12 : 0;
        this.rootNode.position.y = -crouch;
        this.rootNode.rotation.x = THREE.MathUtils.lerp(this.rootNode.rotation.x, crouch * 1.4, delta * 10);
      }

      if (!this.hasExternalModel) {
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, delta * 10);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, delta * 10);
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, delta * 10);
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, delta * 10);

        if (this.idleTime > 5) {
          this.headGroup.rotation.y = Math.sin((this.idleTime - 5) * 1.5) * 0.35;
        } else {
          this.headGroup.rotation.y = THREE.MathUtils.lerp(this.headGroup.rotation.y, 0, delta * 6);
        }
      }
    }
  }
}
