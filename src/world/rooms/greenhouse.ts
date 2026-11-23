import * as THREE from 'three';
import { collisionSystem } from '../collision';
import { interactionSystem } from '../interaction';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';
import { sparkleSystem } from '../fx/sparkles';
import { jellyController } from '../fx/jelly';
import skillsData from '../../../content/skills.json';
import { clickSystem } from '../clickables';
import { SKILL_GARDENS } from '../../ui/skillsOverlay';
import { makeDoor, makeRug, makeFireflies, NightLights, Door, Fireflies } from '../props';
import { refs } from '../refs';
import type { RoomId } from '../../core/store';
import { audioManager } from '../../audio/audioManager';
import { floatPop } from '../../ui/floatPop';

type Skill = { id: string; name: string; plantGroup: string; level: number };
const CAN_HOME = new THREE.Vector3(1.75, 0, -2.75);

export class GreenhouseRoom {
  public group: THREE.Group = new THREE.Group();
  public spawnPoint = new THREE.Vector3(0, 0, -1.8);
  private plants: THREE.Group[] = [];
  private beds: { group: string; label: string; center: THREE.Vector3 }[] = [];
  private bedPlants = new Map<string, { plant: THREE.Group; skill: Skill }[]>();
  private watered = new Set<string>();
  private doors: Door[] = [];
  private night = new NightLights();
  private fireflies: Fireflies | null = null;
  private can: THREE.Group | null = null;
  private canStand: THREE.Group | null = null;
  private pouring: { t: number; bed: string } | null = null;
  private drops: THREE.Points | null = null;
  public entries: Partial<Record<RoomId, { pos: THREE.Vector3; yaw: number }>> = {
    bedroom: { pos: new THREE.Vector3(0, 0, -1.8), yaw: 0 }
  };
  public exits: Partial<Record<RoomId, THREE.Vector3>> = { bedroom: new THREE.Vector3(0, 0, -3.25) };

  constructor() {
    this.buildRoom();
    this.setupInteractions();
  }

  private buildRoom(): void {
    // 10 x 8 (safe interior bounds)
    collisionSystem.setBounds(-4.7, 4.7, -3.7, 3.7);

    const stoneFloorMat = this.createStoneFloor();
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xFFFDF8 }); // Cream window frames
    const glassMat = new THREE.MeshBasicMaterial({ color: 0xBDE0FF, transparent: true, opacity: 0.45 });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0xD8B294 });
    const baseboardMat = new THREE.MeshLambertMaterial({ color: 0x8A5A4A });

    // 1. Floor
    const floorGeo = new THREE.PlaneGeometry(10, 8);
    const floor = new THREE.Mesh(floorGeo, stoneFloorMat);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // 2. Glass walls & sky windows
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 0.1), glassMat);
    backWall.position.set(0, 2, 4);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4, 8), glassMat);
    leftWall.position.set(-5, 2, 0);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4, 8), glassMat);
    rightWall.position.set(5, 2, 0);
    this.group.add(backWall, leftWall, rightWall);

    // Chunky window frame mullions
    for (const x of [-4, -2.6, 2.6, 4]) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4, 0.15), frameMat);
      mullion.position.set(x, 2, 3.95);
      this.group.add(mullion);
    }

    // 3. Skill Garden: five raised beds in a gentle arc facing the entrance, one per
    //    skill category, with one labelled plant per skill. Nothing else in the room,
    //    so the skills are the only thing on show.
    const path = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), new THREE.MeshLambertMaterial({ color: 0xd8c3a5 }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.012, -0.6);
    this.group.add(path);
    const welcome = this.createLabel('🌿 Skill Garden · click a plant', 0.95, '#FFF6EC', 34);
    // In front of the glass wall's mullions (they used to cut through the sign)
    welcome.position.set(0, 2.75, 3.72);
    welcome.rotation.y = Math.PI;
    welcome.scale.setScalar(2.2);
    this.group.add(welcome);

    SKILL_GARDENS.forEach((garden, gi) => {
      const theta = THREE.MathUtils.degToRad(-64 + gi * 32);
      const center = new THREE.Vector3(Math.sin(theta) * 3.3, 0, -0.9 + Math.cos(theta) * 3.3);
      const items = (skillsData as { id: string; name: string; plantGroup: string; level: number }[]).filter(
        (sk) => sk.plantGroup === garden.group
      );
      const bed = this.createBed(garden, items, gi);
      bed.position.copy(center);
      bed.rotation.y = theta + Math.PI; // front faces the middle of the room
      this.group.add(bed);
      this.beds.push({ group: garden.group, label: garden.label, center });
      collisionSystem.addBox(center.x - 0.72, center.x + 0.72, center.z - 0.62, center.z + 0.62);
    });

    // 6. Door back to the Bedroom
    const homeDoor = makeDoor('home', 'BEDROOM', 'Back to the hub');
    homeDoor.group.position.set(0, 0, -3.9);
    this.doors.push(homeDoor);
    this.group.add(homeDoor.group);
    void baseboardMat;
    void woodMat;

    // Woven doormat
    const mat = makeRug({ shape: 'rect', w: 1.6, d: 1.0, colors: ['#D8B294', '#FFF6EC', '#8A5A4A'], pattern: 'stripes' });
    mat.position.set(0, 0.013, -2.9);
    this.group.add(mat);

    // 7. Watering can on a little stand by the door
    this.buildWateringCan();

    // 8. Night: lantern string under the glass roof, moonlight and fireflies
    for (let i = 0; i < 9; i++) {
      const x = -4 + i;
      const y = 3.35 + Math.sin((i / 8) * Math.PI) * -0.25;
      const c = [0xffd27a, 0xffb3c7, 0xc8ffb0][i % 3];
      const bulb = this.night.bulb(c, 0.07);
      bulb.position.set(x, y, 1.0);
      const halo = this.night.halo(c, 0.7);
      halo.position.copy(bulb.position);
      this.group.add(bulb, halo);
    }
    const moon = new THREE.DirectionalLight(0x9bb4ff, 0);
    moon.position.set(-3, 6, 4);
    this.group.add(this.night.addLight(moon, 0, 0.6));
    const lanternGlow = new THREE.PointLight(0xffd27a, 0, 9);
    lanternGlow.position.set(0, 3.0, 1.0);
    this.group.add(this.night.addLight(lanternGlow, 0, 1.4));
    this.fireflies = makeFireflies(40, new THREE.Box3(new THREE.Vector3(-4.5, 0.4, -2.5), new THREE.Vector3(4.5, 2.6, 3.6)), 0xd6ff9a, 0.15);
    this.group.add(this.fireflies.points);
  }

  /** Raised wooden planter with a category sign and one labelled plant per skill. */
  private createBed(
    garden: (typeof SKILL_GARDENS)[number],
    items: { id: string; name: string; level: number }[],
    gi: number
  ): THREE.Group {
    const bed = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0xc08a5c });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 0.62), wood);
    box.position.y = 0.21;
    const soil = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.04, 0.5), new THREE.MeshLambertMaterial({ color: 0x6e4c3e }));
    soil.position.y = 0.42;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 0.68), new THREE.MeshLambertMaterial({ color: new THREE.Color(garden.color) }));
    trim.position.y = 0.43;
    bed.add(box, trim, soil);

    // Category plaque on the front face (+Z in bed space faces the room centre)
    const plaque = this.createLabel(`${garden.emoji} ${garden.label}`, 1.1, garden.color, 40);
    plaque.position.set(0, 0.22, 0.315);
    bed.add(plaque);
    clickSystem.register(plaque, `${garden.emoji} ${garden.label}: see these skills`, () => this.openSkills(garden.group));

    const types: ('cactus' | 'sunflower' | 'monstera' | 'fern')[] = ['monstera', 'sunflower', 'cactus', 'fern'];
    const spacing = 1.3 / items.length;
    items.forEach((sk, i) => {
      const x = -0.65 + spacing * (i + 0.5);
      const plant = this.createPottedPlant(sk.id, new THREE.Color(garden.color).getHex(), types[(i + gi) % types.length]);
      jellyController.unregister(plant); // re-register after scaling so the jelly spring keeps this size
      plant.scale.setScalar(0.62 + sk.level * 0.04);
      jellyController.register(plant);
      plant.position.set(x, 0.42, -0.06);
      bed.add(plant);
      this.plants.push(plant);
      if (!this.bedPlants.has(garden.group)) this.bedPlants.set(garden.group, []);
      this.bedPlants.get(garden.group)!.push({ plant, skill: sk as Skill });
      clickSystem.register(plant, `🌱 ${sk.name}`, () => {
        if (refs.avatar?.holding) this.waterPlant(plant, sk as Skill);
        else this.openSkills(sk.id, plant);
      });

      // Name stake in front of the plant, tilted up toward the visitor
      const tag = this.createLabel(sk.name, Math.min(0.4, spacing - 0.02), '#FFFDF8', 34, 256);
      tag.position.set(x, 0.5, 0.27);
      tag.rotation.x = -0.85;
      bed.add(tag);
      clickSystem.register(tag, `🌱 ${sk.name}`, () => this.openSkills(sk.id, plant));
    });
    return bed;
  }

  /** Rounded label plane drawn on a canvas; width in metres, height follows the text. */
  private createLabel(text: string, width: number, bg: string, fontPx: number, cw = 512): THREE.Mesh {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `bold ${fontPx}px sans-serif`;
    // Wrap to at most two lines
    const maxW = cw - 40;
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    lines.push(line);
    const chh = Math.round(fontPx * 1.35 * lines.length + 28);
    canvas.width = cw;
    canvas.height = chh;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(3, 3, cw - 6, chh - 6, 18);
    ctx.fill();
    ctx.strokeStyle = '#8A5A4A';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#5A3A32';
    ctx.font = `bold ${fontPx}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, cw / 2, 14 + fontPx * 1.35 * (i + 0.5)));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(width, (width * chh) / cw),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
  }

  private openSkills(target: string, plant?: THREE.Object3D): void {
    if (plant) {
      const p = plant.getWorldPosition(new THREE.Vector3());
      sparkleSystem.burst(p.add(new THREE.Vector3(0, 0.4, 0)), 14);
      jellyController.trigger(plant, 0.3, -0.4, 0.3);
    }
    store.completeQuest('water_plant');
    eventBus.emit('open:skills', target);
  }

  private createStoneFloor(): THREE.MeshLambertMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#E8EFEA';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#8A5A4A';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 60, 60);
    ctx.strokeRect(66, 2, 60, 60);
    ctx.strokeRect(2, 66, 60, 60);
    ctx.strokeRect(66, 66, 60, 60);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 4);
    return new THREE.MeshLambertMaterial({ map: tex });
  }

  private createPottedPlant(_id: string, potColor: number, type: 'cactus' | 'bonsai' | 'sunflower' | 'monstera' | 'fern'): THREE.Group {
    const plantGroup = new THREE.Group();

    // Pastel pot
    const potMat = new THREE.MeshLambertMaterial({ color: potColor });
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x6E4C3E });
    const plantMat = new THREE.MeshLambertMaterial({ color: 0x76B885 }); // Soft pastel green
    const flowerMat = new THREE.MeshLambertMaterial({ color: 0xFFE9A3 });

    const potGeo = new THREE.CylinderGeometry(0.24, 0.18, 0.36, 16);
    const pot = new THREE.Mesh(potGeo, potMat);
    pot.position.y = 0.18;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), soilMat);
    soil.position.y = 0.34;
    plantGroup.add(pot, soil);

    // Plant foliage based on type
    if (type === 'cactus') {
      const stem = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), plantMat);
      stem.scale.set(0.9, 1.4, 0.9);
      stem.position.y = 0.52;
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshLambertMaterial({ color: 0xFFB3C7 }));
      flower.position.set(0, 0.76, 0);
      plantGroup.add(stem, flower);
    } else if (type === 'sunflower') {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55), plantMat);
      stem.position.y = 0.6;
      const center = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 16), soilMat);
      center.rotation.x = Math.PI / 4;
      center.position.set(0, 0.88, 0.05);
      const petals = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 16), flowerMat);
      petals.rotation.x = Math.PI / 4;
      petals.position.set(0, 0.88, 0.05);
      plantGroup.add(stem, center, petals);
    } else if (type === 'monstera') {
      for (let i = 0; i < 4; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), plantMat);
        leaf.scale.set(1.4, 0.15, 0.9);
        const angle = (i / 4) * Math.PI * 2;
        leaf.position.set(Math.cos(angle) * 0.2, 0.55 + i * 0.06, Math.sin(angle) * 0.2);
        leaf.rotation.y = angle;
        leaf.rotation.z = 0.3;
        plantGroup.add(leaf);
      }
    } else {
      // Fern / tiered leaves
      for (let i = 0; i < 5; i++) {
        const tier = new THREE.Mesh(new THREE.ConeGeometry(0.28 - i * 0.04, 0.2, 12), plantMat);
        tier.position.y = 0.45 + i * 0.12;
        plantGroup.add(tier);
      }
    }

    jellyController.register(plantGroup);
    return plantGroup;
  }

  private createSign(text: string, colorHex: number): THREE.Mesh {
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

  private setupInteractions(): void {
    this.beds.forEach((bed) => {
      interactionSystem.register({
        id: `bed_${bed.group}`,
        label: `See ${bed.label} skills 🌱`,
        keyHint: 'E',
        radius: 1.7,
        position: bed.center,
        onInteract: () => {
          if (refs.avatar?.holding) this.waterBed(bed.group);
          else this.openSkills(bed.group);
        }
      });
    });

    interactionSystem.register({
      id: 'watering_can',
      label: 'Pick up the watering can 🚿',
      keyHint: 'E',
      radius: 1.3,
      priority: 0.3,
      position: CAN_HOME.clone().setY(0.6),
      onInteract: () => this.toggleCan()
    });

    // Doorway back to Bedroom
    interactionSystem.register({
      id: 'DOOR_bedroom',
      label: 'Back to Bedroom 🚪',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(0, 0.5, -3.3),
      onInteract: () => eventBus.emit('room:switch', 'bedroom')
    });
  }

  /** A little pastel watering can on a wooden stool. */
  private buildWateringCan(): void {
    const stand = new THREE.Group();
    stand.position.copy(CAN_HOME);
    const wood = new THREE.MeshLambertMaterial({ color: 0xc08a5c });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 20), wood);
    top.position.y = 0.5;
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), wood);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.18, 0.25, Math.sin(a) * 0.18);
      stand.add(leg);
    }
    stand.add(top);
    this.group.add(stand);
    this.canStand = stand;
    collisionSystem.addBox(CAN_HOME.x - 0.3, CAN_HOME.x + 0.3, CAN_HOME.z - 0.3, CAN_HOME.z + 0.3);

    const can = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: 0x8fd3c9 });
    const trim = new THREE.MeshLambertMaterial({ color: 0xffe9a3 });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.2, 18), body);
    tank.position.y = 0.1;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.025, 18), trim);
    lid.position.y = 0.2;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.28, 8), body);
    spout.position.set(0, 0.16, 0.2);
    spout.rotation.x = 1.0;
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.025, 0.04, 10), trim);
    rose.position.set(0, 0.25, 0.31);
    rose.rotation.x = 1.0;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 16, Math.PI), trim);
    handle.position.set(0, 0.2, -0.04);
    handle.rotation.y = Math.PI / 2;
    can.add(tank, lid, spout, rose, handle);
    can.position.set(CAN_HOME.x, 0.53, CAN_HOME.z);
    this.group.add(can);
    this.can = can;
    clickSystem.register(can, '🚿 Watering can: pick up and water the skills!', () => this.toggleCan());

    // Water droplets (shown while pouring)
    const N = 60;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.drops = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x7fd3ff, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false }));
    this.drops.visible = false;
    this.drops.frustumCulled = false;
    this.group.add(this.drops);
  }

  private toggleCan(): void {
    const avatar = refs.avatar;
    if (!avatar || !this.can) return;
    const cfg = interactionSystem.get('watering_can');
    if (avatar.holding === this.can) {
      // Put it back
      avatar.attachToHand(null);
      this.can.position.set(CAN_HOME.x, 0.53, CAN_HOME.z);
      this.can.rotation.set(0, 0, 0);
      this.group.add(this.can);
      if (cfg) cfg.label = 'Pick up the watering can 🚿';
      this.relabelBeds(false);
      audioManager.playPop();
    } else {
      this.group.remove(this.can);
      this.can.rotation.set(0, 0, 0);
      avatar.attachToHand(this.can);
      if (cfg) cfg.label = 'Put the watering can back';
      this.relabelBeds(true);
      audioManager.playPickup();
      eventBus.emit('toast:show', '🚿 Got the watering can! Walk up to a bed and press E (or click a plant) to water it.');
    }
    interactionSystem.refresh();
  }

  private relabelBeds(holding: boolean): void {
    this.beds.forEach((b) => {
      const cfg = interactionSystem.get(`bed_${b.group}`);
      if (cfg) cfg.label = holding ? `Water the ${b.label} bed 💧` : `See ${b.label} skills 🌱`;
    });
  }

  /** Pour over a whole bed: every plant grows and its skill pops up. */
  private waterBed(group: string): void {
    const entries = this.bedPlants.get(group) || [];
    const bed = this.beds.find((b) => b.group === group);
    if (!bed || this.pouring) return;
    const avatar = refs.avatar;
    if (avatar) avatar.faceYaw = Math.atan2(bed.center.x - avatar.position.x, bed.center.z - avatar.position.z);
    this.pouring = { t: 0, bed: group };
    audioManager.playWater();
    entries.forEach((e, i) => setTimeout(() => this.growPlant(e.plant, e.skill), 350 + i * 260));
    setTimeout(() => {
      this.watered.add(group);
      store.completeQuest('water_plant');
      if (this.watered.size === this.beds.length) {
        avatar?.doGesture('cheer');
        audioManager.playGameOver(true);
        eventBus.emit('toast:show', '🌻 The whole skill garden is watered! Thanks for helping it grow.');
      } else {
        eventBus.emit('toast:show', `💧 ${bed.label} watered (${this.watered.size}/${this.beds.length}). Click any plant to read about that skill.`);
      }
    }, 450 + entries.length * 260);
  }

  private waterPlant(plant: THREE.Group, skill: Skill): void {
    if (this.pouring) return;
    const p = plant.getWorldPosition(new THREE.Vector3());
    const avatar = refs.avatar;
    if (avatar) avatar.faceYaw = Math.atan2(p.x - avatar.position.x, p.z - avatar.position.z);
    this.pouring = { t: 0, bed: skill.plantGroup };
    audioManager.playWater();
    setTimeout(() => this.growPlant(plant, skill), 400);
  }

  private growPlant(plant: THREE.Group, skill: Skill): void {
    const p = plant.getWorldPosition(new THREE.Vector3());
    floatPop(`+ ${skill.name}`, p.clone().add(new THREE.Vector3(0, 0.75, 0)), 'green');
    sparkleSystem.burst(p.add(new THREE.Vector3(0, 0.45, 0)), 10);
    audioManager.playLevelUp();
    jellyController.unregister(plant);
    const base = plant.scale.x;
    const grown = Math.min(base * 1.12, 1.15);
    plant.scale.setScalar(grown);
    jellyController.register(plant);
    jellyController.trigger(plant, 0.35, -0.4, 0.35);
  }

  update(delta: number): void {
    const av = refs.avatar?.position ?? null;
    this.doors.forEach((d) => d.update(delta, av));
    this.night.update();
    this.fireflies?.update(delta);

    // Pouring: tip the can and spray droplets from the spout
    if (this.pouring && this.can && this.drops) {
      this.pouring.t += delta;
      const t = this.pouring.t;
      const tip = Math.min(1, t * 4) * Math.min(1, Math.max(0, (1.6 - t) * 4));
      this.can.rotation.x = tip * 0.9;
      const spout = new THREE.Vector3(0, 0.25, 0.32);
      this.can.localToWorld(spout);
      this.group.worldToLocal(spout);
      const arr = this.drops.geometry.attributes.position.array as Float32Array;
      const fwd = refs.avatar ? new THREE.Vector3(Math.sin(refs.avatar.rotationY), 0, Math.cos(refs.avatar.rotationY)) : new THREE.Vector3(0, 0, 1);
      for (let i = 0; i < arr.length / 3; i++) {
        const life = ((t * 2.2 + i / (arr.length / 3)) % 1);
        arr[i * 3] = spout.x + fwd.x * life * 0.5 + Math.sin(i * 12.9) * 0.04;
        arr[i * 3 + 1] = spout.y - life * life * 0.9;
        arr[i * 3 + 2] = spout.z + fwd.z * life * 0.5 + Math.cos(i * 7.3) * 0.04;
      }
      this.drops.geometry.attributes.position.needsUpdate = true;
      this.drops.visible = tip > 0.5;
      if (t > 1.7) {
        this.pouring = null;
        this.drops.visible = false;
        this.can.rotation.x = 0;
      }
    }

    // Gentle foliage sway
    const t = performance.now() * 0.002;
    this.plants.forEach((plant, idx) => {
      plant.rotation.z = Math.sin(t + idx) * 0.04;
    });
  }

  dispose(): void {
    if (refs.avatar && refs.avatar.holding === this.can) refs.avatar.attachToHand(null);
    interactionSystem.clear();
    this.doors = [];
    this.bedPlants.clear();
    this.can = null;
    this.plants = [];
    this.beds = [];
    this.group.clear();
  }
}
