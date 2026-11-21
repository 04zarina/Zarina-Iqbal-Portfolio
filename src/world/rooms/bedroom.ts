import * as THREE from 'three';
import { collisionSystem } from '../collision';
import { interactionSystem } from '../interaction';
import { themeManager } from '../theme';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';
import { sparkleSystem } from '../fx/sparkles';
import { assetLoader } from '../../core/loaders';
import { Avatar } from '../avatar/avatar';
import { DECOR, placeDecor, recenter } from '../decor';

export class BedroomRoom {
  public group: THREE.Group = new THREE.Group();
  public spawnPoint = new THREE.Vector3(0, 0, 1.2);
  /** Face the back wall (mirror, desk, TV) when entering. */
  public spawnRotationY = Math.PI;
  public bedPos = new THREE.Vector3(-3.4, 0.52, -1.9);
  public outPos = new THREE.Vector3(-1.8, 0, -1.8);

  private avatar: Avatar | null = null;
  private tapeMesh: THREE.Object3D | null = null;
  private lampLight: THREE.PointLight | null = null;
  private fairyLights: THREE.Mesh[] = [];
  private portalGlow: THREE.Mesh | null = null;

  constructor(avatar?: Avatar) {
    this.avatar = avatar || null;
    this.buildRoom();
    this.loadGLBModels();
    this.setupInteractions();
    this.setupEvents();
  }

  private buildRoom(): void {
    // Interior room bounds: -4.7 to 4.7 in X, -3.7 to 3.7 in Z
    collisionSystem.setBounds(-4.7, 4.7, -3.7, 3.7);

    // Materials
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xEED6BA }); // Warm wooden floor
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xFFC9B0 }); // Peach walls
    const baseboardMat = new THREE.MeshLambertMaterial({ color: 0x8A5A4A }); // Cocoa trim

    // 1. Floor
    const floorGeo = new THREE.PlaneGeometry(10, 8);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // Cozy circular rug
    const rugGeo = new THREE.CircleGeometry(1.8, 32);
    const rugMat = new THREE.MeshLambertMaterial({ color: 0xFFF3E6 });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.01, 0.2);
    this.group.add(rug);

    // 2. Walls (Back, Left, Right, Front segments)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 0.2), wallMat);
    backWall.position.set(0, 2, -3.9);
    this.group.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 8), wallMat);
    leftWall.position.set(-4.9, 2, 0);
    this.group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 8), wallMat);
    rightWall.position.set(4.9, 2, 0);
    this.group.add(rightWall);

    // Front Wall segments with door cutouts
    const frontWallLeft = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4, 0.2), wallMat);
    frontWallLeft.position.set(-3.4, 2, 3.9);
    const frontWallMid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4, 0.2), wallMat);
    frontWallMid.position.set(0, 2, 3.9);
    const frontWallRight = new THREE.Mesh(new THREE.BoxGeometry(1.8, 4, 0.2), wallMat);
    frontWallRight.position.set(4.1, 2, 3.9);
    this.group.add(frontWallLeft, frontWallMid, frontWallRight);

    // Baseboards
    const baseBack = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 0.05), baseboardMat);
    baseBack.position.set(0, 0.075, -3.8);
    this.group.add(baseBack);

    // 3. Obstacle Collision Boxes (sealed to back and side walls to prevent any wall penetration)
    // Bed collision
    collisionSystem.addBox(-4.8, -2.1, -3.8, -1.0);
    // Desk collision
    collisionSystem.addBox(0.8, 2.9, -3.8, -2.4);
    // Wardrobe collision
    collisionSystem.addBox(4.0, 4.8, -1.9, -0.5);
    // Grandfather clock, floor lamp, armchair and plant
    collisionSystem.addBox(-0.3, 0.5, -3.8, -3.3);
    collisionSystem.addBox(3.9, 4.8, -3.8, -2.9);
    collisionSystem.addBox(3.4, 4.8, 2.2, 3.8);
    collisionSystem.addBox(-4.8, -3.7, 2.8, 3.8);

    // 4. Point light for bedroom lamp
    this.lampLight = new THREE.PointLight(0xFFD08A, 1.4, 7);
    this.lampLight.position.set(1.4, 1.35, -3.0);
    this.group.add(this.lampLight);

    // 5. Doorways to other rooms:
    // Game Room Door (Left Wall: x = -4.9, z = 1.8)
    const gameDoorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 1.3), baseboardMat);
    gameDoorFrame.position.set(-4.8, 1.2, 1.8);
    const gameSign = this.createDoorSign('ARCADE', 0xFFE9A3);
    gameSign.position.set(-4.75, 2.5, 1.8);
    gameSign.rotation.y = Math.PI / 2;
    this.group.add(gameDoorFrame, gameSign);

    // Greenhouse Door (Front Wall Left: x = -1.8, z = 3.9)
    const ghDoorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.4, 0.15), baseboardMat);
    ghDoorFrame.position.set(-1.8, 1.2, 3.8);
    const ghSign = this.createDoorSign('GARDEN', 0xBDEBD3);
    ghSign.position.set(-1.8, 2.5, 3.75);
    this.group.add(ghDoorFrame, ghSign);

    // Study Door (Front Wall Right: x = 2.0, z = 3.9)
    const studyDoorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.4, 0.15), baseboardMat);
    studyDoorFrame.position.set(2.0, 1.2, 3.8);
    const studySign = this.createDoorSign('STUDY', 0xFFC9B0);
    studySign.position.set(2.0, 2.5, 3.75);
    this.group.add(studyDoorFrame, studySign);

    // Trophy Shelf above Mirror
    const shelfBoard = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.35), baseboardMat);
    shelfBoard.position.set(-1.4, 2.15, -3.65);
    const trophy = this.createTrophyCup();
    trophy.position.set(-1.4, 2.19, -3.65);
    this.group.add(shelfBoard, trophy);

    // String fairy lights
    this.createFairyLights();
  }

  private async loadGLBModels(): Promise<void> {
    // Start every download at once; the awaits below then resolve as each arrives
    assetLoader.preload(['bed', 'wardrobe', 'desk', 'chair', 'tv', 'tape', 'mirror', 'lamp_table', 'nightstand', 'plant']);

    // Furniture-pack decor (loads in parallel with the hero props below)
    const decorReady = placeDecor(this.group, [
      { url: DECOR.clock, position: [0.1, 0, -3.72] },
      { url: DECOR.floorLamp, position: [4.35, 0, -3.35], scale: 1.1 },
      { url: DECOR.picturePyramid, position: [1.8, 1.95, -3.8], scale: 1.1 },
      { url: DECOR.pictureFlowers, position: [-4.8, 1.75, -0.2], rotY: Math.PI / 2 },
      { url: DECOR.armchairRed, position: [4.05, 0, 2.95], rotY: -Math.PI * 0.75 },
      { url: DECOR.plantPalm, position: [-4.25, 0, 3.3], scale: 0.62 },
      { url: DECOR.bookStack, position: [-2.0, 2.19, -3.66] },
      { url: DECOR.toyCar, position: [-0.8, 2.19, -3.66], rotY: -0.4 }
    ]);

    // 1. Bed (Bed_02.glb)
    const bedGltf = await assetLoader.loadGLTF('bed');
    if (bedGltf) {
      bedGltf.position.set(-3.4, 0, -2.4);
      bedGltf.rotation.y = 0;
      this.group.add(bedGltf);
    } else {
      this.buildFallbackBed();
    }

    // 2. Wardrobe (Closet_02.glb): back against the right wall, doors facing into the room
    const closetGltf = await assetLoader.loadGLTF('wardrobe');
    if (closetGltf) {
      closetGltf.position.set(4.78, 0, -1.2);
      closetGltf.rotation.y = -Math.PI / 2;
      closetGltf.scale.set(1.5, 1.5, 1.5);
      this.group.add(closetGltf);
    } else {
      this.buildFallbackWardrobe();
    }

    // Soft magic glow on the wardrobe doors (pulses in update)
    this.portalGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 1.95),
      new THREE.MeshBasicMaterial({ color: 0xD9C8FF, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.portalGlow.rotation.y = -Math.PI / 2;
    this.portalGlow.position.set(4.1, 1.25, -1.2);
    this.group.add(this.portalGlow);

    // 3. Desk (Work_Table_06.glb): top surface at y = 0.76
    const deskGltf = await assetLoader.loadGLTF('desk');
    if (deskGltf) {
      deskGltf.position.set(1.8, 0, -3.1);
      deskGltf.rotation.y = 0;
      this.group.add(deskGltf);
    } else {
      this.buildFallbackDesk();
    }

    // 4. Desk Chair (Chair_17.glb)
    const chairGltf = await assetLoader.loadGLTF('chair');
    if (chairGltf) {
      chairGltf.position.set(1.8, 0, -2.15);
      chairGltf.rotation.y = 0;
      this.group.add(chairGltf);
    }

    // 5. Retro TV (old tv off by Justin Randall). The model's screen faces -Z and its
    //    origin is off-center, so recenter it, sit it on the desk and turn it to face the room.
    const tvGltf = await assetLoader.loadGLTF('tv');
    if (tvGltf) {
      const tv = recenter(tvGltf);
      tv.position.set(2.1, 0.76, -3.15);
      tv.rotation.y = Math.PI;
      tv.scale.setScalar(0.36);
      this.group.add(tv);
    }

    // 6. Cassette Tape (Poly by Google Cassette Tape with texture)
    const tapeGltf = await assetLoader.loadGLTF('tape');
    if (tapeGltf) {
      tapeGltf.position.set(1.55, 0.77, -2.9);
      tapeGltf.rotation.set(-Math.PI / 2, 0, 0.2);
      tapeGltf.scale.set(0.02, 0.02, 0.02);
      this.tapeMesh = tapeGltf;
      this.group.add(tapeGltf);
    } else {
      this.buildFallbackTape();
    }

    // 7. Wall Mirror (Mirror by Poly by Google). The repo copy is already normalized to
    //    ~1.2 m tall, so it needs ~1x scale (the old 0.034 scale shrank it to 4 cm).
    const mirrorGltf = await assetLoader.loadGLTF('mirror');
    if (mirrorGltf) {
      const mirror = recenter(mirrorGltf, true);
      mirror.position.set(-1.4, 1.2, -3.76);
      mirror.scale.setScalar(0.9);
      this.styleMirror(mirror);
      this.group.add(mirror);
    } else {
      this.buildFallbackMirror();
    }

    // 8. Table lamp (Lamp Round Table by Kenney) on the desk; drives the Day/Dusk toggle
    const lampGltf = await assetLoader.loadGLTF('lamp_table');
    if (lampGltf) {
      const lamp = recenter(lampGltf);
      lamp.position.set(1.4, 0.76, -3.25);
      lamp.scale.setScalar(1.9);
      this.group.add(lamp);
    } else {
      this.buildFallbackLamp();
    }

    // 9. Nightstand & Plant (nightstand back sits against the wall)
    const nightstandGltf = await assetLoader.loadGLTF('nightstand');
    if (nightstandGltf) {
      nightstandGltf.position.set(-2.05, 0, -3.78);
      this.group.add(nightstandGltf);
    }

    const plantGltf = await assetLoader.loadGLTF('plant');
    if (plantGltf) {
      plantGltf.position.set(-2.05, 0.57, -3.55);
      plantGltf.scale.set(1.6, 1.6, 1.6);
      this.group.add(plantGltf);
    }

    await decorReady;
  }

  /** Gives the mirror's glass a soft reflective sheen so it reads as a mirror. */
  private styleMirror(mirror: THREE.Object3D): void {
    mirror.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat || !('color' in mat)) return;
      const hsl = { h: 0, s: 0, l: 0 };
      mat.color.getHSL(hsl);
      if (hsl.l > 0.3) {
        // Light material = glass
        mesh.material = new THREE.MeshStandardMaterial({ color: 0xCFE6F5, roughness: 0.15, metalness: 0.6, emissive: 0x7A93A8, emissiveIntensity: 0.35 });
      } else {
        // Dark material = frame: warm it up to match the room's gold trim
        mesh.material = new THREE.MeshStandardMaterial({ color: 0xE8C77A, roughness: 0.45, metalness: 0.5 });
      }
    });
  }

  private createTrophyCup(): THREE.Group {
    const cup = new THREE.Group();
    const profile = [
      new THREE.Vector2(0.0, 0.0), new THREE.Vector2(0.07, 0.0), new THREE.Vector2(0.07, 0.025),
      new THREE.Vector2(0.025, 0.04), new THREE.Vector2(0.02, 0.1), new THREE.Vector2(0.03, 0.12),
      new THREE.Vector2(0.075, 0.15), new THREE.Vector2(0.085, 0.24), new THREE.Vector2(0.075, 0.24)
    ];
    const gold = new THREE.MeshStandardMaterial({ color: 0xF2C14E, roughness: 0.3, metalness: 0.8 });
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), gold);
    const handleGeo = new THREE.TorusGeometry(0.04, 0.008, 8, 16, Math.PI);
    const handleL = new THREE.Mesh(handleGeo, gold);
    handleL.position.set(-0.085, 0.19, 0);
    handleL.rotation.z = Math.PI / 2;
    const handleR = handleL.clone();
    handleR.position.x = 0.085;
    handleR.rotation.z = -Math.PI / 2;
    cup.add(body, handleL, handleR);
    return cup;
  }

  private buildFallbackLamp(): void {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(1.4, 0.76, -3.25);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 16), new THREE.MeshLambertMaterial({ color: 0xBBD4DD }));
    base.position.y = 0.02;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0xBBD4DD }));
    stem.position.y = 0.18;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.22, 16), new THREE.MeshLambertMaterial({ color: 0xFFE9A3 }));
    shade.position.y = 0.4;
    lampGroup.add(base, stem, shade);
    this.group.add(lampGroup);
  }

  private buildFallbackBed(): void {
    const bedFrameMat = new THREE.MeshLambertMaterial({ color: 0x8A5A4A });
    const mattressMat = new THREE.MeshLambertMaterial({ color: 0xFFF6EC });
    const blanketMat = new THREE.MeshLambertMaterial({ color: 0xBDEBD3 });
    const pillowMat = new THREE.MeshLambertMaterial({ color: 0xFFB3C7 });

    const bedGroup = new THREE.Group();
    bedGroup.position.set(-3.4, 0, -2.4);

    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 2.4), bedFrameMat);
    bedFrame.position.y = 0.2;
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.2), bedFrameMat);
    headboard.position.set(0, 0.5, -1.1);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 2.2), mattressMat);
    mattress.position.set(0, 0.4, 0);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.2, 1.4), blanketMat);
    blanket.position.set(0, 0.5, 0.4);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.45), pillowMat);
    pillow.position.set(0, 0.62, -0.7);

    bedGroup.add(bedFrame, headboard, mattress, blanket, pillow);
    this.group.add(bedGroup);
  }

  private buildFallbackWardrobe(): void {
    const wardrobeGroup = new THREE.Group();
    wardrobeGroup.position.set(4.3, 0, -1.2);
    const wardrobeBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.6, 1.6), new THREE.MeshLambertMaterial({ color: 0x8A5A4A }));
    wardrobeBody.position.y = 1.3;
    wardrobeGroup.add(wardrobeBody);
    this.group.add(wardrobeGroup);
  }

  private buildFallbackDesk(): void {
    const deskGroup = new THREE.Group();
    deskGroup.position.set(1.8, 0, -3.1);
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.1), new THREE.MeshLambertMaterial({ color: 0xD8B294 }));
    deskTop.position.y = 0.75;
    deskGroup.add(deskTop);
    this.group.add(deskGroup);
  }

  private buildFallbackTape(): void {
    const tapeMesh = new THREE.Group();
    tapeMesh.position.set(1.35, 0.8, -2.9);
    const tapeBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.15), new THREE.MeshLambertMaterial({ color: 0xFFB3C7 }));
    tapeMesh.add(tapeBody);
    this.tapeMesh = tapeMesh;
    this.group.add(tapeMesh);
  }

  private buildFallbackMirror(): void {
    const mirrorFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 32), new THREE.MeshLambertMaterial({ color: 0xFFE9A3 }));
    mirrorFrame.rotation.x = Math.PI / 2;
    mirrorFrame.position.set(-1.4, 1.15, -3.8);
    const mirrorGlass = new THREE.Mesh(new THREE.CircleGeometry(0.48, 32), new THREE.MeshBasicMaterial({ color: 0xBDE0FF }));
    mirrorGlass.position.set(-1.4, 1.15, -3.76);
    this.group.add(mirrorFrame, mirrorGlass);
  }

  private createDoorSign(text: string, colorHex: number): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFF6EC';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#8A5A4A';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 56);
    ctx.fillStyle = '#5A3A32';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);

    const tex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(0.8, 0.22);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    return new THREE.Mesh(geo, mat);
  }

  private createFairyLights(): void {
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xFFE9A3 });
    const count = 12;
    for (let i = 0; i < count; i++) {
      const lightBulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), lightMat);
      const x = -4.2 + (8.4 / (count - 1)) * i;
      const y = 3.2 + Math.sin((i / (count - 1)) * Math.PI) * -0.3;
      lightBulb.position.set(x, y, -3.8);
      this.group.add(lightBulb);
      this.fairyLights.push(lightBulb);
    }
  }

  private setupInteractions(): void {
    // 1. Bed Interaction: "Lie Down & Sleep" / "Wake Up"
    interactionSystem.register({
      id: 'bed',
      label: 'Sleep in Bed / Lie Down 🛏️',
      keyHint: 'E',
      radius: 2.0,
      position: new THREE.Vector3(-2.1, 0.6, -2.2),
      onInteract: () => {
        if (this.avatar?.isSleeping) {
          this.wakeUpAvatar();
        } else {
          this.sleepAvatar();
        }
      }
    });

    // 2. Lamp (Day/Dusk Toggle)
    interactionSystem.register({
      id: 'lamp',
      label: 'Switch Lamp',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(1.4, 1.0, -3.0),
      onInteract: () => {
        themeManager.toggleTheme();
        sparkleSystem.burst(new THREE.Vector3(1.4, 1.4, -3.1), 12);
        eventBus.emit('toast:show', `Switched to ${store.get().theme === 'dusk' ? 'Dusk 🌙' : 'Day ☀️'} mode!`);
      }
    });

    // 3. Tape Pickup
    interactionSystem.register({
      id: 'tape',
      label: 'Pick up Reel Tape',
      keyHint: 'E',
      radius: 1.6,
      position: new THREE.Vector3(1.55, 0.8, -2.8),
      onInteract: () => {
        store.set('holdingTape', true);
        if (this.tapeMesh) this.tapeMesh.visible = false;
        sparkleSystem.burst(new THREE.Vector3(1.55, 1.0, -2.8), 16);
        store.collectItem('tape');
        store.completeQuest('pickup_tape');
        eventBus.emit('toast:show', 'Picked up Zarina\'s Showreel Tape! 📼 Insert it into the TV.');
      }
    });

    // 4. TV (Play Promo Video)
    interactionSystem.register({
      id: 'tv',
      label: 'Watch Reel on TV',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(2.1, 0.9, -2.6),
      focusPose: {
        position: new THREE.Vector3(2.1, 1.3, -1.7),
        lookAt: new THREE.Vector3(2.1, 1.05, -3.15)
      },
      onInteract: () => {
        store.set('activeOverlay', 'tv');
        store.set('tvPlaying', true);
        store.completeQuest('watch_reel');
        eventBus.emit('overlay:open', 'tv');
      }
    });

    // 5. Mirror (About Zarina) - Lowered to avatar eye level
    interactionSystem.register({
      id: 'mirror',
      label: 'Look in Mirror (About Zarina)',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(-1.4, 1.2, -3.1),
      onInteract: () => {
        store.set('activeOverlay', 'about');
        eventBus.emit('overlay:open', 'about');
      }
    });

    // 6. Trophy Shelf (Achievements)
    interactionSystem.register({
      id: 'shelf',
      label: 'Inspect Trophies & Certificates 🏆',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(-1.4, 1.6, -2.9),
      onInteract: () => {
        store.set('activeOverlay', 'journal');
        eventBus.emit('overlay:open', 'journal');
      }
    });

    // 7. Wardrobe (Portal to Dev Realm)
    interactionSystem.register({
      id: 'wardrobe',
      label: 'Enter Dev Realm Portal 🌀',
      keyHint: 'E',
      radius: 2.0,
      position: new THREE.Vector3(3.8, 1.0, -1.2),
      onInteract: () => {
        sparkleSystem.burst(new THREE.Vector3(3.9, 1.5, -1.2), 24);
        eventBus.emit('room:switch', 'devRealm');
      }
    });

    // 8. Doorway Triggers
    interactionSystem.register({
      id: 'DOOR_game',
      label: 'Enter Arcade Room 🕹️',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(-4.4, 0.5, 1.8),
      onInteract: () => eventBus.emit('room:switch', 'gameRoom')
    });

    interactionSystem.register({
      id: 'DOOR_greenhouse',
      label: 'Enter Greenhouse 🌿',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(-1.8, 0.5, 3.4),
      onInteract: () => eventBus.emit('room:switch', 'greenhouse')
    });

    interactionSystem.register({
      id: 'DOOR_study',
      label: 'Enter Study Nook 📚',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(2.0, 0.5, 3.4),
      onInteract: () => eventBus.emit('room:switch', 'study')
    });
  }

  private setupEvents(): void {
    eventBus.on('bed:interact', () => {
      if (this.avatar?.isSleeping) {
        this.wakeUpAvatar();
      } else {
        this.sleepAvatar();
      }
    });

    eventBus.on('bed:wakeup', () => {
      if (this.avatar?.isSleeping && !this.avatar?.isWakingUp) {
        this.wakeUpAvatar();
      }
    });
  }

  public sleepAvatar(): void {
    if (!this.avatar) return;
    this.avatar.goToBed(this.bedPos, () => {
      store.set('isSleeping', true);
      eventBus.emit('toast:show', 'Tucked warmly into bed! Press E or move to wake up 💤');
      sparkleSystem.burst(new THREE.Vector3(-3.4, 1.0, -2.6), 14);
    });
  }

  public wakeUpAvatar(): void {
    if (!this.avatar || this.avatar.isWakingUp) return;
    eventBus.emit('toast:show', 'Yaaawn... 🥱 Good morning!');
    this.avatar.wakeUp(this.bedPos, this.outPos, () => {
      store.set('inputLocked', false);
      store.set('isWakingUp', false);
      store.set('isSleeping', false);
      sparkleSystem.burst(new THREE.Vector3(-1.8, 0.8, -1.8), 16);
    });
  }

  setAvatar(avatar: Avatar): void {
    this.avatar = avatar;
  }

  update(delta: number): void {
    const time = performance.now() * 0.003;
    this.fairyLights.forEach((light, i) => {
      const pulse = 0.8 + Math.sin(time + i * 0.6) * 0.2;
      light.scale.set(pulse, pulse, pulse);
    });

    if (this.lampLight) {
      this.lampLight.intensity = THREE.MathUtils.lerp(0.8, 2.2, themeManager.themeProgress);
    }

    if (this.portalGlow) {
      (this.portalGlow.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(time * 0.6) * 0.1;
    }
  }

  dispose(): void {
    interactionSystem.clear();
    this.fairyLights = [];
    this.portalGlow = null;
    this.group.clear();
  }
}
