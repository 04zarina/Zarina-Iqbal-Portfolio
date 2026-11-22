import * as THREE from 'three';
import { createBlobShadow } from '../fx/blobShadow';
import { assetLoader } from '../../core/loaders';
import { AvatarRig, RigPose } from './rig';

export class Avatar {
  public group: THREE.Group = new THREE.Group();
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public rotationY: number = 0;

  // Root container for body movement/sway
  private rootNode: THREE.Group = new THREE.Group();
  private modelContainer: THREE.Group = new THREE.Group();
  private shadow: THREE.Mesh;
  public hasExternalModel = false;

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
  private pose: RigPose = { armDownL: 1.3, armDownR: 1.3, armSwingL: 0, armSwingR: 0, legL: 0, legR: 0 };
  private waveTimer = -1;
  private readonly waveDuration = 2.0;

  // Scripted walk (used by the intro)
  private walkTarget: THREE.Vector3 | null = null;
  private walkScriptSpeed = 1.6;
  private onWalkDone: (() => void) | null = null;

  private hopTimer = 0;
  private walkTime = 0;
  private idleTime = 0;

  // Waking up sequence state
  private wakeUpTimer = 0;
  private wakeUpDuration = 2.6;
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

    this.initModel();
  }

  private async initModel(): Promise<void> {
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

  startInBed(bedPos: THREE.Vector3): void {
    this.isSleeping = true;
    this.isWakingUp = false;
    this.isSitting = false;
    this.isMoving = false;
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
    this.isSleeping = true;
    this.isWakingUp = false;
    this.isSitting = false;
    this.isMoving = false;
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
    this.onWakeUpDone = onComplete || null;
  }

  sitOnChair(chairPos: THREE.Vector3, rotY: number = 0): void {
    this.isSitting = true;
    this.isSleeping = false;
    this.isMoving = false;
    this.position.copy(chairPos);
    this.position.y = 0.42; // Chair seat height
    this.rotationY = rotY;
    // Drop the hips onto the seat; the rig swings the legs forward (see updateRig)
    this.rootNode.position.set(0, this.rigged ? -0.4 : -0.06, 0);
    this.shadow.visible = false;
  }

  standUp(standPos?: THREE.Vector3): void {
    this.isSitting = false;
    if (standPos) {
      this.position.copy(standPos);
    }
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
    if (!this.rigged) return;
    const target: RigPose = { armDownL: 1.3, armDownR: 1.3, armSwingL: 0, armSwingR: 0, legL: 0, legR: 0 };
    let snap = false;

    if (this.wakeRig) {
      target.legL = target.legR = this.wakeRig.legs;
      target.armDownL = target.armDownR = this.wakeRig.arms;
      snap = true;
    } else if (this.isSitting) {
      target.legL = target.legR = 1.05;
      target.armDownL = target.armDownR = 1.2;
      target.armSwingL = target.armSwingR = 0.55;
    } else if (this.isMoving && !this.isSleeping) {
      const s = THREE.MathUtils.clamp(this.groundSpeed / 3.2, 0, 1.5);
      const stride = Math.sin(this.walkTime) * (0.18 + 0.32 * Math.min(s, 1)) * (this.isRunning ? 1.25 : 1);
      target.legL = stride;
      target.legR = -stride;
      target.armSwingL = -stride * 0.85;
      target.armSwingR = stride * 0.85;
      target.armDownL = target.armDownR = this.isRunning ? 1.15 : 1.25;
      snap = true;
    } else if (!this.isSleeping) {
      // Idle: arms drift very slightly with breathing
      const b = Math.sin(this.idleTime * 2.2) * 0.03;
      target.armDownL = 1.3 + b;
      target.armDownR = 1.3 + b;
    }

    if (this.waveTimer >= 0) {
      this.waveTimer += delta;
      const t = this.waveTimer / this.waveDuration;
      const w = Math.min(1, Math.min(t, 1 - t) * 6); // ease in and out
      target.armDownR = THREE.MathUtils.lerp(target.armDownR, -1.05 + Math.sin(this.waveTimer * 13) * 0.28, Math.max(0, w));
      target.armSwingR = THREE.MathUtils.lerp(target.armSwingR, 0.35, Math.max(0, w));
      if (t >= 1) this.waveTimer = -1;
    }

    const k = snap ? 1 - Math.exp(-delta * 20) : 1 - Math.exp(-delta * 9);
    (Object.keys(target) as (keyof RigPose)[]).forEach((key) => {
      this.pose[key] += (target[key] - this.pose[key]) * (this.waveTimer >= 0 && key.endsWith('R') ? 1 - Math.exp(-delta * 18) : k);
    });
    this.rig.set(this.pose);
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

    // 1. Waking-up Sequence
    if (this.isWakingUp) {
      this.wakeUpTimer += delta;
      const p = Math.min(this.wakeUpTimer / this.wakeUpDuration, 1.0);

      if (p < 0.35) {
        // Phase 1: Sit up in bed, pivoting at the hips so the legs stay flat on the mattress
        const sitProgress = THREE.MathUtils.smoothstep(p / 0.35, 0, 1);
        const theta = THREE.MathUtils.lerp(-Math.PI / 2, 0, sitProgress);
        this.setSitUpPose(theta);
        this.wakeRig = { legs: -theta, arms: 1.3 };
      } else if (p < 0.65) {
        // Phase 2: Yawn and stretch both arms up
        const yawnP = (p - 0.35) / 0.3;
        const stretch = Math.sin(yawnP * Math.PI);
        this.setSitUpPose(0);
        this.rootNode.scale.set(1.0 - stretch * 0.04, 1.0 + stretch * 0.06, 1.0 - stretch * 0.04);
        this.rootNode.rotation.z = Math.sin(yawnP * Math.PI * 2) * 0.06;
        this.wakeRig = { legs: Math.PI / 2, arms: THREE.MathUtils.lerp(1.3, -1.25, stretch) };
      } else {
        // Phase 3: Swing the legs down, stand, and step out of bed
        const stepP = (p - 0.65) / 0.35;
        const standP = THREE.MathUtils.smoothstep(stepP / 0.45, 0, 1);
        this.rootNode.scale.set(1, 1, 1);
        this.rootNode.rotation.set(0, 0, 0);
        this.rootNode.position.set(0, THREE.MathUtils.lerp(-0.3, 0, standP), THREE.MathUtils.lerp(-0.52, 0, standP));
        this.wakeRig = { legs: (Math.PI / 2) * (1 - standP), arms: 1.3 };
        this.position.lerpVectors(this.bedOrigin, this.wakeUpTarget, stepP);
        // Turn toward the side of the bed she steps out of
        this.rotationY = THREE.MathUtils.lerp(0, this.stepOutYaw(), Math.min(1, stepP * 1.6));
        this.position.y = THREE.MathUtils.lerp(0.52, 0, THREE.MathUtils.smoothstep(stepP, 0.35, 1));
        this.shadow.visible = stepP > 0.5;
      }

      if (p >= 1.0) {
        this.isWakingUp = false;
        this.isSleeping = false;
        this.wakeRig = null;
        this.rootNode.position.set(0, 0, 0);
        this.position.copy(this.wakeUpTarget);
        this.rotationY = this.stepOutYaw();
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
        this.rootNode.position.y = 0;
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
