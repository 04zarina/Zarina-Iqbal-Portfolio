import * as THREE from 'three';
import { clickSystem } from '../clickables';
import { makeDoor, makePortal, makeRug, makeSign, makeFireflies, NightLights, Door, Portal, Fireflies } from '../props';
import { registerSeat } from '../seats';
import { refs } from '../refs';
import type { RoomId } from '../../core/store';
import { audioManager } from '../../audio/audioManager';

/** Showreel tape: stands on the desk between the lamp and the front edge, big enough to spot. */
const TAPE_POS = new THREE.Vector3(1.5, 0.76, -2.98);
import { collisionSystem } from '../collision';
import { interactionSystem } from '../interaction';
import { themeManager } from '../theme';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';
import { sparkleSystem } from '../fx/sparkles';
import { assetLoader } from '../../core/loaders';
import { Avatar } from '../avatar/avatar';
import { DECOR, placeDecor, recenter } from '../decor';
import { profile } from '../../content/profile';

export class BedroomRoom {
  public group: THREE.Group = new THREE.Group();
  public spawnPoint = new THREE.Vector3(0, 0, 1.2);
  /** Face the back wall (mirror, desk, TV) when entering. */
  public spawnRotationY = Math.PI;
  public bedPos = new THREE.Vector3(-3.4, 0.52, -1.9);
  public outPos = new THREE.Vector3(-1.8, 0, -1.8);

  private avatar: Avatar | null = null;
  private tapeMesh: THREE.Object3D | null = null;
  private pickUpTape: (() => void) | null = null;
  private tapeTag: THREE.Mesh | null = null;
  private lampLight: THREE.PointLight | null = null;
  private fairyLights: THREE.Mesh[] = [];
  private portal: Portal | null = null;
  private doors: Door[] = [];
  private night = new NightLights();
  private fireflies: Fireflies | null = null;
  private tapePad: THREE.Mesh | null = null;
  private windowMat: THREE.MeshBasicMaterial | null = null;
  private moon: THREE.Mesh | null = null;

  /** Where to stand when arriving from another room, and where to walk to leave for it. */
  public entries: Partial<Record<RoomId, { pos: THREE.Vector3; yaw: number }>> = {
    gameRoom: { pos: new THREE.Vector3(-3.9, 0, 1.8), yaw: Math.PI / 2 },
    greenhouse: { pos: new THREE.Vector3(-1.8, 0, 2.9), yaw: Math.PI },
    study: { pos: new THREE.Vector3(2.0, 0, 2.9), yaw: Math.PI },
    devRealm: { pos: new THREE.Vector3(3.3, 0, -1.2), yaw: -Math.PI / 2 }
  };
  public exits: Partial<Record<RoomId, THREE.Vector3>> = {
    gameRoom: new THREE.Vector3(-4.15, 0, 1.8),
    greenhouse: new THREE.Vector3(-1.8, 0, 3.25),
    study: new THREE.Vector3(2.0, 0, 3.25),
    devRealm: new THREE.Vector3(3.55, 0, -1.2)
  };

  constructor(avatar?: Avatar) {
    this.avatar = avatar || null;
    this.buildRoom();
    this.loadGLBModels();
    this.setupInteractions();
    this.buildCommunityWall();
    this.setupSeats();
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

    // Cozy rugs: a big round one in the middle, a striped runner by the bed, a doormat strip by the doors
    const rug = makeRug({ shape: 'round', w: 3.4, colors: ['#FFF3E6', '#FFC9D6', '#F2A7B8'], pattern: 'rings' });
    rug.position.set(0, 0.012, 0.3);
    const runner = makeRug({ shape: 'rect', w: 1.0, d: 2.0, colors: ['#BDEBD3', '#FFF6EC', '#76B885'], pattern: 'stripes' });
    runner.position.set(-2.05, 0.013, -1.75);
    const mat = makeRug({ shape: 'rect', w: 5.0, d: 0.9, colors: ['#D9C8FF', '#FFF6EC', '#9C86D9'], pattern: 'diamond' });
    mat.position.set(0.1, 0.013, 3.2);
    this.group.add(rug, runner, mat);

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
    // Desk collision (matches the 1.3 x 0.74 m table, so you can walk right up to it)
    collisionSystem.addBox(1.15, 2.47, -3.8, -2.76);
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

    // 5. Doors to the other rooms, each themed and labelled with where it leads
    const arcadeDoor = makeDoor('arcade', 'ARCADE', 'Featured games');
    arcadeDoor.group.position.set(-4.8, 0, 1.8);
    arcadeDoor.group.rotation.y = Math.PI / 2;
    const gardenDoor = makeDoor('garden', 'GREENHOUSE', 'Skill garden');
    gardenDoor.group.position.set(-1.8, 0, 3.8);
    gardenDoor.group.rotation.y = Math.PI;
    const studyDoor = makeDoor('study', 'STUDY HUB', 'Resume · projects');
    studyDoor.group.position.set(2.0, 0, 3.8);
    studyDoor.group.rotation.y = Math.PI;
    this.doors.push(arcadeDoor, gardenDoor, studyDoor);
    this.group.add(arcadeDoor.group, gardenDoor.group, studyDoor.group);

    // Window with a sky that turns to a starry night in Dusk mode
    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 1.5), baseboardMat);
    winFrame.position.set(-4.82, 2.0, -1.0);
    this.windowMat = new THREE.MeshBasicMaterial({ color: 0xbde0ff });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.16), this.windowMat);
    pane.position.set(-4.77, 2.0, -1.0);
    pane.rotation.y = Math.PI / 2;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.16, 0.05), baseboardMat);
    cross.position.set(-4.76, 2.0, -1.0);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.36), baseboardMat);
    crossH.position.copy(cross.position);
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: 0xfff6d6, transparent: true }));
    this.moon.position.set(-4.765, 2.25, -0.7);
    this.moon.rotation.y = Math.PI / 2;
    this.group.add(winFrame, pane, cross, crossH, this.moon);
    const moonLight = new THREE.PointLight(0x9bb4ff, 0, 6);
    moonLight.position.set(-4.2, 2.0, -1.0);
    this.group.add(this.night.addLight(moonLight, 0, 1.2));

    // Trophy Shelf above Mirror
    const shelfBoard = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.35), baseboardMat);
    shelfBoard.position.set(-1.4, 2.15, -3.65);
    const trophy = this.createTrophyCup();
    trophy.position.set(-1.4, 2.19, -3.65);
    this.group.add(shelfBoard, trophy);

    // String fairy lights (glow and cast warm light at night)
    this.createFairyLights();
    const fairyGlow = new THREE.PointLight(0xffc98a, 0, 6);
    fairyGlow.position.set(0, 2.9, -3.2);
    this.group.add(this.night.addLight(fairyGlow, 0, 1.6));

    // A handful of fireflies drift in through the window at night
    this.fireflies = makeFireflies(14, new THREE.Box3(new THREE.Vector3(-4.4, 0.6, -3.4), new THREE.Vector3(-1.5, 2.6, 0.5)), 0xfff3a0, 0);
    this.group.add(this.fireflies.points);
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

    // Swirling portal in the wardrobe doorway, with a sign so you know where it goes
    this.portal = makePortal(0.95, 1.75, 0xb18cff, 0xffb3e1);
    this.portal.group.position.set(4.08, 1.2, -1.2);
    this.portal.group.rotation.y = -Math.PI / 2;
    this.group.add(this.portal.group);
    const realmSign = makeSign('DEV REALM', { emoji: '☁️', subtitle: 'Mailbox · mini game', width: 1.1, bg: '#EDE4FF' });
    realmSign.position.set(4.3, 2.78, -1.2);
    realmSign.rotation.y = -Math.PI / 2;
    this.group.add(realmSign);

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
      // Tucked at the right end of the desk so it no longer sits between you and the tape
      chairGltf.position.set(2.75, 0, -2.05);
      chairGltf.rotation.y = -0.5;
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
      // Stand it up, leaning back a little and angled toward the room
      tapeGltf.scale.setScalar(0.04);
      tapeGltf.rotation.set(-0.3, 0.35, 0);
      tapeGltf.position.set(TAPE_POS.x, TAPE_POS.y - 0.134 * 0.04 + 0.01, TAPE_POS.z);
      this.tapeMesh = tapeGltf;
      this.group.add(tapeGltf);
      if (store.get().holdingTape) tapeGltf.visible = false;
      else clickSystem.register(tapeGltf, 'Pick up the showreel tape 📼', () => this.pickUpTape?.());
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
    tapeMesh.position.set(TAPE_POS.x, 0.88, TAPE_POS.z);
    const tapeBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.04), new THREE.MeshLambertMaterial({ color: 0xFFB3C7 }));
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

  private createFairyLights(): void {
    const colors = [0xffd27a, 0xffa8c8, 0xa8e6ff, 0xc8ffb0];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const c = colors[i % colors.length];
      const lightBulb = this.night.bulb(c, 0.045);
      const x = -4.2 + (8.4 / (count - 1)) * i;
      const y = 3.2 + Math.sin((i / (count - 1)) * Math.PI) * -0.3;
      lightBulb.position.set(x, y, -3.78);
      const halo = this.night.halo(c, 0.42);
      halo.position.set(x, y, -3.7);
      this.group.add(lightBulb, halo);
      this.fairyLights.push(lightBulb);
    }
  }

  /** Framed GameCon photos on the right wall; click one (or press E nearby) for the story. */
  private buildCommunityWall(): void {
    const loader = new THREE.TextureLoader();
    const frames: { z: number; w: number; h: number }[] = [
      { z: 1.0, w: 0.66, h: 0.5 }, // GameCon'25 (landscape)
      { z: 0.15, w: 0.45, h: 0.6 }, // GameCon'26 (portrait)
      { z: 1.95, w: 0.7, h: 0.33 } // Light Up The House on stage (wide)
    ];
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xffb3c7 });
    profile.community.forEach((photo, i) => {
      const f = frames[i];
      if (!f) return;
      const g = new THREE.Group();
      g.position.set(4.77, 1.75, f.z);
      g.rotation.y = -Math.PI / 2;
      const border = new THREE.Mesh(new THREE.BoxGeometry(f.w + 0.08, f.h + 0.08, 0.04), frameMat);
      const tex = loader.load(photo.src);
      tex.colorSpace = THREE.SRGBColorSpace;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), new THREE.MeshBasicMaterial({ map: tex }));
      pic.position.z = 0.025;
      g.add(border, pic);
      this.group.add(g);
      clickSystem.register(g, `📸 ${photo.title}`, () => eventBus.emit('open:community', i));
    });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.2),
      new THREE.MeshBasicMaterial({ map: this.makeSignTexture('🎤 Community'), transparent: true })
    );
    sign.position.set(4.78, 2.38, 1.0);
    sign.rotation.y = -Math.PI / 2;
    this.group.add(sign);

    interactionSystem.register({
      id: 'community_wall',
      label: 'See GameCon photos 🎤',
      keyHint: 'E',
      radius: 1.6,
      position: new THREE.Vector3(4.3, 0.5, 1.0),
      onInteract: () => eventBus.emit('open:community', 0)
    });
  }

  private makeSignTexture(text: string): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 112;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#FFF6EC';
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 104, 30);
    ctx.fill();
    ctx.strokeStyle = '#8A5A4A';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#5A3A32';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 58);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
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

    // 3. Tape Pickup: front-left corner of the desk, ahead of the TV and lamp so it wins when you walk up
    const pickUpTape = () => {
      if (store.get().holdingTape) return;
      store.set('holdingTape', true);
      if (this.tapeMesh) {
        this.tapeMesh.visible = false;
        clickSystem.unregister(this.tapeMesh);
      }
      interactionSystem.unregister('tape');
      sparkleSystem.burst(new THREE.Vector3(TAPE_POS.x, 1.0, TAPE_POS.z), 16);
      audioManager.playPickup();
      if (this.tapePad) this.tapePad.visible = false;
      store.collectItem('tape');
      store.completeQuest('pickup_tape');
      eventBus.emit('toast:show', 'Picked up Zarina\'s Showreel Tape! 📼 Insert it into the TV.');
    };
    if (!store.get().holdingTape) {
      interactionSystem.register({
        id: 'tape',
        label: 'Pick up Reel Tape 📼',
        keyHint: 'E',
        radius: 1.7,
        priority: 0.35,
        position: new THREE.Vector3(TAPE_POS.x, 0.8, TAPE_POS.z + 0.3),
        onInteract: pickUpTape
      });
    }
    this.pickUpTape = pickUpTape;

    // Floating tag so the small tape is easy to spot (and click)
    this.tapeTag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.1),
      new THREE.MeshBasicMaterial({ map: this.makeSignTexture('📼 Showreel'), transparent: true, depthWrite: false })
    );
    this.tapeTag.position.set(TAPE_POS.x, 1.22, TAPE_POS.z + 0.05);
    // Glowing pad under the tape so it stands out on the desk
    this.tapePad = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.22, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.6, depthWrite: false })
    );
    this.tapePad.rotation.x = -Math.PI / 2;
    this.tapePad.position.set(TAPE_POS.x, TAPE_POS.y + 0.006, TAPE_POS.z);
    this.tapePad.visible = !store.get().holdingTape;
    this.group.add(this.tapePad);
    this.tapeTag.rotation.y = 0;
    this.group.add(this.tapeTag);
    clickSystem.register(this.tapeTag, 'Pick up the showreel tape 📼', () => this.pickUpTape?.());

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
      label: 'See Achievements & Certificates 🏆',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(-1.4, 1.6, -2.9),
      onInteract: () => eventBus.emit('open:journal', 'collectibles')
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
        audioManager.playPortal();
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

  private setupSeats(): void {
    registerSeat({ id: 'seat_armchair', label: 'Sit in the armchair 🛋️', position: new THREE.Vector3(3.95, 0, 2.85), yaw: -Math.PI * 0.75, height: 0.4 });
    registerSeat({ id: 'seat_deskchair', label: 'Sit on the desk chair 🪑', position: new THREE.Vector3(2.75, 0, -2.05), yaw: -0.5, height: 0.45, radius: 1.1 });
    registerSeat({ id: 'seat_bed', label: 'Sit on the bed 🛏️', position: new THREE.Vector3(-2.35, 0, -0.9), yaw: Math.PI / 2, height: 0.5, radius: 1.0, priority: -0.2 });
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

    const av = refs.avatar?.position ?? null;
    this.doors.forEach((d) => d.update(delta, av));
    this.portal?.update(delta);
    this.night.update();
    this.fireflies?.update(delta);
    const p = themeManager.themeProgress;
    if (this.windowMat) this.windowMat.color.setRGB(0.74 - 0.62 * p, 0.88 - 0.74 * p, 1.0 - 0.66 * p);
    if (this.moon) (this.moon.material as THREE.MeshBasicMaterial).opacity = p;
    if (this.tapePad && this.tapePad.visible) {
      (this.tapePad.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(time * 1.4) * 0.25;
      this.tapePad.scale.setScalar(1 + Math.sin(time * 1.4) * 0.08);
    }

    if (this.tapeTag) {
      this.tapeTag.visible = !store.get().holdingTape;
      this.tapeTag.position.y = 1.22 + Math.sin(time * 0.7) * 0.03;
    }
  }

  dispose(): void {
    interactionSystem.clear();
    this.fairyLights = [];
    this.portal = null;
    this.doors = [];
    this.tapeTag = null;
    this.tapePad = null;
    this.group.clear();
  }
}
