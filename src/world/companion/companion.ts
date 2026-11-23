import * as THREE from 'three';
import { assetLoader } from '../../core/loaders';
import { createBlobShadow } from '../fx/blobShadow';
import { interactionSystem } from '../interaction';
import { collisionSystem } from '../collision';
import { eventBus } from '../../core/events';
import { store } from '../../core/store';
import { audioManager } from '../../audio/audioManager';
import { sparkleSystem } from '../fx/sparkles';
import { clickSystem } from '../clickables';
import { refs } from '../refs';
import { navGrid } from '../nav';
import { floatPop } from '../../ui/floatPop';

const IDLE_LINES = [
  'Psst! Play fetch with me in the Dev Realm 🎾',
  'The watering can in the greenhouse makes skills grow 🌱',
  'Drag the screen to look around, F to see Zarina up close 👀',
  "Zarina's resume is on the Study desk 📄",
  'Click a certificate on the cork board to see it ✨',
  'Click me for pets! 💕'
];

export class Companion {
  public group: THREE.Group = new THREE.Group();
  public position: THREE.Vector3 = new THREE.Vector3(1.0, 0, 1.0);
  public rotationY: number = 0;

  private modelNode: THREE.Group = new THREE.Group();
  private shadow: THREE.Mesh;
  private animTimer = 0;
  private isFollowing = false;
  public isPerched = false;
  private perchedPos = new THREE.Vector3();
  /** Zuzu only appears after the visitor presses "Ask Zuzu". */
  public summoned = false;
  private lastAvatarPos = new THREE.Vector3();
  private lastAvatarRotY = 0;
  private bubble: HTMLDivElement;
  private bubbleTimer = 0;
  private happyTimer = 0;
  private idleChatTimer = 30;
  /** While > 0 Zuzu stays put (being petted, or waiting for Zarina to walk over). */
  private holdTimer = 0;
  /** Fetch: Zuzu dashes to this spot instead of following. */
  public gameMode = false;
  public gameTarget: THREE.Vector3 | null = null;

  constructor() {
    this.shadow = createBlobShadow(0.22);
    this.group.add(this.shadow);
    this.group.add(this.modelNode);

    this.group.visible = false;
    this.bubble = document.createElement('div');
    this.bubble.className = 'zuzu-bubble';
    this.bubble.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.bubble);
    this.initModel();
    this.initEvents();
    clickSystem.register(this.group, '🤚 Pet Zuzu (E to chat)', () => this.pet(), true);
  }

  private async initModel(): Promise<void> {
    const gltfModel = await assetLoader.loadGLTF('companion');
    if (gltfModel) {
      gltfModel.scale.set(1, 1, 1);
      gltfModel.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(gltfModel);
      const size = box.getSize(new THREE.Vector3());
      const rawHeight = size.y > 0 ? size.y : 2.0;

      // Small pet that still reads next to her: 0.46 m (avatar is ~1.22 m)
      const targetHeight = 0.46;
      const scale = targetHeight / rawHeight;
      gltfModel.scale.set(scale, scale, scale);
      gltfModel.updateMatrixWorld(true);

      const finalBox = new THREE.Box3().setFromObject(gltfModel);
      gltfModel.position.y = -finalBox.min.y;

      this.modelNode.add(gltfModel);
      console.log('🐾 Loaded 3D companion model (Hanini Red Panda) with height: 0.46m');
    } else {
      this.buildProceduralCat();
      console.log('🐾 Using procedural marshmallow companion cat');
    }
  }

  private buildProceduralCat(): void {
    this.modelNode.scale.set(0.65, 0.65, 0.65);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xFFFDF8 });
    const earMat = new THREE.MeshLambertMaterial({ color: 0xFFB3C7 });
    const cheekMat = new THREE.MeshLambertMaterial({ color: 0xFFB3C7 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x5A3A32 });
    const noseMat = new THREE.MeshBasicMaterial({ color: 0x8A5A4A });

    const bodyGeo = new THREE.SphereGeometry(0.28, 16, 16);
    bodyGeo.scale(1, 0.9, 1.15);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.28;
    this.modelNode.add(bodyMesh);

    const earGeo = new THREE.ConeGeometry(0.08, 0.14, 8);
    const leftEar = new THREE.Mesh(earGeo, bodyMat);
    leftEar.position.set(0.14, 0.52, 0.08);
    leftEar.rotation.set(-0.1, 0, -0.2);

    const leftInnerEar = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8), earMat);
    leftInnerEar.position.set(0.14, 0.52, 0.11);
    leftInnerEar.rotation.set(-0.1, 0, -0.2);

    const rightEar = new THREE.Mesh(earGeo, bodyMat);
    rightEar.position.set(-0.14, 0.52, 0.08);
    rightEar.rotation.set(-0.1, 0, 0.2);

    const rightInnerEar = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8), earMat);
    rightInnerEar.position.set(-0.14, 0.52, 0.11);
    rightInnerEar.rotation.set(-0.1, 0, 0.2);

    this.modelNode.add(leftEar, leftInnerEar, rightEar, rightInnerEar);

    const eyeGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(0.09, 0.32, 0.27);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(-0.09, 0.32, 0.27);

    const cheekGeo = new THREE.SphereGeometry(0.04, 8, 8);
    cheekGeo.scale(1.2, 0.7, 0.4);
    const leftCheek = new THREE.Mesh(cheekGeo, cheekMat);
    leftCheek.position.set(0.13, 0.27, 0.26);
    const rightCheek = new THREE.Mesh(cheekGeo, cheekMat);
    rightCheek.position.set(-0.13, 0.27, 0.26);

    const noseMesh = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), noseMat);
    noseMesh.position.set(0, 0.28, 0.29);

    const tailGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.2, 8);
    const tailMesh = new THREE.Mesh(tailGeo, bodyMat);
    tailMesh.position.set(0, 0.22, -0.28);
    tailMesh.rotation.x = -0.8;

    this.modelNode.add(leftEye, rightEye, leftCheek, rightCheek, noseMesh, tailMesh);
  }

  /** Speech bubble above Zuzu's head. */
  say(text: string, seconds?: number): void {
    if (!this.summoned) return;
    const clean = text.replace(/\*\*?|__|`/g, '').replace(/\s*\[\d+\]/g, '');
    const short = clean.length > 150 ? clean.slice(0, 147).replace(/\s+\S*$/, '') + '…' : clean;
    this.bubble.textContent = short;
    this.bubble.classList.add('show');
    this.bubbleTimer = seconds ?? Math.min(9, 3 + short.length / 22);
    eventBus.emit('zuzu:bubble', true);
    this.happyTimer = 0.6;
    audioManager.playMrrp();
  }

  private showTyping(): void {
    if (!this.summoned) return;
    this.bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    this.bubble.classList.add('show');
    eventBus.emit('zuzu:bubble', true);
    this.bubbleTimer = 20;
  }

  /** Click Zuzu: Zarina walks over, crouches and strokes Zuzu with her right hand. */
  private pet(): void {
    const avatar = refs.avatar;
    if (!avatar || avatar.isSleeping || this.gameMode) return;
    // Zuzu waits where it is (otherwise it would trot round to her other side)
    this.holdTimer = 6;
    const doPet = () => {
      // Turn a little to the left of Zuzu so it sits right under her right hand
      const toZuzu = Math.atan2(this.position.x - avatar.position.x, this.position.z - avatar.position.z);
      avatar.faceYaw = toZuzu + 0.34;
      avatar.doGesture('pet', 1.8);
      this.holdTimer = 2.2;
      this.happyTimer = 1.8;
      this.rotationY = toZuzu + Math.PI;
      audioManager.playPurr();
      store.completeQuest('pet_zuzu');
      const head = this.position.clone().add(new THREE.Vector3(0, 0.62, 0));
      setTimeout(() => floatPop('💖', head, 'heart'), 250);
      setTimeout(() => floatPop('💕', head.clone().add(new THREE.Vector3(0.15, 0.1, 0)), 'heart'), 650);
      sparkleSystem.burst(head, 8);
      this.say(['Purrr~ 💕', 'Mrrp! More pets please!', 'Hehe, that tickles! 🐾', 'You found my favourite spot ✨'][Math.floor(Math.random() * 4)], 2.5);
    };
    if (avatar.isSitting) avatar.standUp();
    const d = Math.hypot(this.position.x - avatar.position.x, this.position.z - avatar.position.z);
    // Stand 0.55 m from Zuzu (arm's reach for a chibi), on the side she's coming from
    const dir = avatar.position.clone().sub(this.position).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const spot = this.position.clone().addScaledVector(dir, 0.55).setY(0);
    if (this.isPerched || Math.abs(d - 0.55) < 0.2) doPet();
    else {
      const path = navGrid.findPath(avatar.position, spot);
      if (path && path.length) avatar.followPath(path, 2.2, doPet);
      else {
        avatar.walkTo(spot, 1.8, doPet);
      }
    }
  }

  private initInteraction(): void {
    interactionSystem.register({
      id: 'companion',
      label: 'Chat with Zuzu 🐾',
      keyHint: 'E',
      radius: 1.4,
      position: this.position,
      mesh: this.modelNode,
      onInteract: () => {
        store.set('activeOverlay', 'chat');
        eventBus.emit('overlay:open', 'chat');
      }
    });
  }

  private initEvents(): void {
    eventBus.on('zuzu:say', (text: string) => this.say(text));
    eventBus.on('travel:cancel', () => (this.holdTimer = Math.min(this.holdTimer, 0.3)));
    eventBus.on('zuzu:typing', () => this.showTyping());
    // Summon Zuzu button
    eventBus.on('companion:summon', (data?: { avatarPos?: THREE.Vector3; avatarRotY?: number; quiet?: boolean }) => {
      this.summonToAvatar(data?.avatarPos ?? this.lastAvatarPos, data?.avatarRotY ?? this.lastAvatarRotY, !data?.quiet);
    });

    eventBus.on('room:entered', (roomId: string) => {
      if (!this.summoned) return;
      // Rooms clear their interactables when unloading, so register Zuzu again
      this.initInteraction();
      if (roomId === 'study') {
        // In the study, Zuzu naps on the reading-corner coffee table (away from the resume on the desk)
        this.sitOnTable(new THREE.Vector3(3.0, 0.42, -0.25), -Math.PI / 2);
      } else {
        this.isPerched = false;
        this.shadow.visible = true;
      }
    });
  }

  sitOnTable(tablePos: THREE.Vector3, rotY: number = Math.PI): void {
    this.isPerched = true;
    this.perchedPos.copy(tablePos);
    this.position.copy(tablePos);
    this.rotationY = rotY;
    this.shadow.visible = false;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;
    this.updateInteractAnchor();
  }

  summonToAvatar(avatarPos?: THREE.Vector3, avatarRotY?: number, openChat = true): void {
    if (!this.summoned) {
      this.summoned = true;
      this.group.visible = true;
      this.initInteraction();
    }
    this.isPerched = false;
    this.shadow.visible = true;

    if (avatarPos) {
      const rot = avatarRotY || 0;
      // Spawn safely in front of the avatar inside room bounds
      const spawnOffset = new THREE.Vector3(
        Math.sin(rot) * 0.9,
        0,
        Math.cos(rot) * 0.9
      );
      const rawPos = avatarPos.clone().add(spawnOffset);
      this.position.copy(collisionSystem.resolve(rawPos, 0.35));
      this.rotationY = rot + Math.PI; // Face the player
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;
    this.updateInteractAnchor();

    audioManager.playChime();
    sparkleSystem.burst(new THREE.Vector3(this.position.x, this.position.y + 0.4, this.position.z), 16);
    // She turns and waves hello to Zuzu
    const avatar = refs.avatar;
    if (avatar && !avatar.isSleeping && !avatar.isSitting) {
      avatar.faceYaw = Math.atan2(this.position.x - avatar.position.x, this.position.z - avatar.position.z);
      setTimeout(() => avatar.wave(), 250);
    }
    if (!openChat) return;
    setTimeout(() => this.say("Hi! I'm Zuzu. Ask me anything about Zarina 🐾", 4), 300);

    // Open chat window immediately!
    store.set('activeOverlay', 'chat');
    eventBus.emit('overlay:open', 'chat');
    eventBus.emit('toast:show', 'Zuzu is here to help! 🐾');
  }

  private updateInteractAnchor(): void {
    const interactConfig = (interactionSystem as any).interactables?.get('companion');
    if (interactConfig) {
      interactConfig.position = this.position;
    }
  }

  private updateBubble(delta: number): void {
    if (!this.bubble.classList.contains('show')) return;
    this.bubbleTimer -= delta;
    const cam = refs.camera;
    if (this.bubbleTimer <= 0 || !cam || !this.group.visible) {
      this.bubble.classList.remove('show');
      eventBus.emit('zuzu:bubble', false);
      return;
    }
    const p = this.position.clone().add(new THREE.Vector3(0, 0.72, 0)).project(cam);
    if (p.z > 1) {
      this.bubble.style.opacity = '0';
      return;
    }
    this.bubble.style.opacity = '';
    const x = THREE.MathUtils.clamp(((p.x + 1) / 2) * window.innerWidth, 140, window.innerWidth - 140);
    const y = Math.max(120, ((1 - p.y) / 2) * window.innerHeight);
    this.bubble.style.left = `${x}px`;
    this.bubble.style.top = `${y}px`;
  }

  update(delta: number, avatarPosition: THREE.Vector3, avatarRotationY: number): void {
    this.lastAvatarPos.copy(avatarPosition);
    this.lastAvatarRotY = avatarRotationY;
    if (!this.summoned) return;
    this.animTimer += delta;
    this.updateBubble(delta);

    // Happy wiggle after pets / while talking
    if (this.happyTimer > 0) {
      this.happyTimer -= delta;
      // Happy wiggle with the feet kept on the floor (a tiny hop at most)
      this.modelNode.rotation.z = Math.sin(this.animTimer * 14) * 0.1 * Math.min(1, this.happyTimer * 2);
      this.modelNode.position.y = Math.abs(Math.sin(this.animTimer * 9)) * 0.025;
    } else this.modelNode.rotation.z *= 0.85;

    // Now and then Zuzu shares a tip (not while a panel is open)
    this.idleChatTimer -= delta;
    if (this.idleChatTimer <= 0) {
      this.idleChatTimer = 45 + Math.random() * 30;
      if (store.get().activeOverlay === 'none' && avatarPosition.distanceTo(this.position) < 4) {
        this.say(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)], 5);
      }
    }

    if (this.gameMode) {
      this.updateGame(delta, avatarPosition);
      return;
    }

    if (this.holdTimer > 0) {
      // Staying put to be petted: face Zarina and lean into her hand
      this.holdTimer -= delta;
      const dir = avatarPosition.clone().sub(this.position).setY(0);
      if (dir.lengthSq() > 1e-4) this.rotationY = this.lerpYaw(this.rotationY, Math.atan2(dir.x, dir.z), delta * 6);
      const lean = this.happyTimer > 0 ? Math.sin(this.animTimer * 6) * 0.08 : 0;
      this.modelNode.rotation.x = lean;
      if (this.happyTimer <= 0) this.modelNode.position.y = 0;
      this.group.position.copy(this.position);
      this.group.rotation.y = this.rotationY;
      this.updateInteractAnchor();
      return;
    }
    this.modelNode.rotation.x *= 0.85;

    if (this.isPerched) {
      // Sitting peacefully on table in study nook
      this.position.copy(this.perchedPos);
      if (this.happyTimer <= 0) this.modelNode.position.y = Math.sin(this.animTimer * 2.0) * 0.02;

      // Look toward avatar if nearby
      const dist = avatarPosition.distanceTo(this.position);
      if (dist < 2.8) {
        const dir = avatarPosition.clone().sub(this.position).normalize();
        const targetYaw = Math.atan2(dir.x, dir.z);
        this.rotationY = THREE.MathUtils.lerp(this.rotationY, targetYaw, delta * 4);
      } else {
        this.rotationY = THREE.MathUtils.lerp(this.rotationY, -Math.PI / 2, delta * 3);
      }

      this.group.position.copy(this.position);
      this.group.rotation.y = this.rotationY;
      this.updateInteractAnchor();
      return;
    }

    // Follow point: offset to the side and slightly behind avatar, resolved against room walls
    const followOffset = new THREE.Vector3(
      Math.sin(avatarRotationY - 0.7) * -1.0,
      0,
      Math.cos(avatarRotationY - 0.7) * -1.0
    );
    const rawTarget = avatarPosition.clone().add(followOffset);
    let targetPos = collisionSystem.resolve(rawTarget, 0.35);

    // If target got pushed too close to avatar due to a wall/obstacle behind avatar, target side
    if (targetPos.distanceTo(avatarPosition) < 0.45) {
      const sideOffset = new THREE.Vector3(Math.cos(avatarRotationY) * 0.85, 0, -Math.sin(avatarRotationY) * 0.85);
      targetPos = collisionSystem.resolve(avatarPosition.clone().add(sideOffset), 0.35);
    }

    const distToTarget = this.position.distanceTo(targetPos);
    this.isFollowing = distToTarget > 0.35;

    if (this.isFollowing) {
      this.position.lerp(targetPos, Math.min(delta * 4.5, 1));
      const resolvedPos = collisionSystem.resolve(this.position, 0.35);
      this.position.copy(resolvedPos);

      const moveDir = targetPos.clone().sub(this.position).normalize();
      if (moveDir.lengthSq() > 0.01) {
        const targetYaw = Math.atan2(moveDir.x, moveDir.z);
        this.rotationY = THREE.MathUtils.lerp(this.rotationY, targetYaw, delta * 8);
      }
      // Little trot: feet barely leave the floor (it used to look like Zuzu was flying)
      const bounce = Math.abs(Math.sin(this.animTimer * 12)) * 0.03;
      if (this.happyTimer <= 0) this.modelNode.position.y = bounce;
    } else {
      // Idling near player
      const resolvedPos = collisionSystem.resolve(this.position, 0.35);
      this.position.copy(resolvedPos);

      const breath = Math.sin(this.animTimer * 2.5) * 0.03;
      this.modelNode.scale.set(1 + breath * 0.5, 1 - breath, 1 + breath * 0.5);
      if (this.happyTimer <= 0) this.modelNode.position.y = 0;

      const dirToAvatar = avatarPosition.clone().sub(this.position).normalize();
      const targetYaw = Math.atan2(dirToAvatar.x, dirToAvatar.z);
      this.rotationY = THREE.MathUtils.lerp(this.rotationY, targetYaw, delta * 4);
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;
    this.updateInteractAnchor();
  }

  private lerpYaw(from: number, to: number, k: number): number {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return from + d * Math.min(1, k);
  }

  /** Fetch: dash to the ball, otherwise stay at Zarina's heels. */
  private updateGame(delta: number, avatarPosition: THREE.Vector3): void {
    const goal = this.gameTarget ?? avatarPosition.clone().add(new THREE.Vector3(0.6, 0, 0.4));
    const to = goal.clone().sub(this.position).setY(0);
    const dist = to.length();
    const speed = this.gameTarget ? 4.6 : 3.4;
    if (dist > (this.gameTarget ? 0.05 : 0.5)) {
      this.position.addScaledVector(to.normalize(), Math.min(dist, speed * delta));
      this.position.copy(collisionSystem.resolve(this.position, 0.3));
      this.rotationY = this.lerpYaw(this.rotationY, Math.atan2(to.x, to.z), delta * 12);
      if (this.happyTimer <= 0) this.modelNode.position.y = Math.abs(Math.sin(this.animTimer * 16)) * 0.04;
    } else if (this.happyTimer <= 0) this.modelNode.position.y = 0;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;
    this.updateInteractAnchor();
  }

  /** Celebrate a fetch. */
  cheer(): void {
    this.happyTimer = 0.7;
    audioManager.playMrrp();
  }
}
