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

export class GreenhouseRoom {
  public group: THREE.Group = new THREE.Group();
  public spawnPoint = new THREE.Vector3(0, 0, -2.8);
  private plants: THREE.Group[] = [];
  private beds: { group: string; label: string; center: THREE.Vector3 }[] = [];

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
    for (let x = -4; x <= 4; x += 2) {
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
    welcome.position.set(0, 2.55, 3.9);
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

    // 6. Doorway back to Bedroom (Back wall: x = 0, z = -3.9)
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.15), baseboardMat);
    doorFrame.position.set(0, 1.2, -3.9);
    const doorSign = this.createSign('BEDROOM', 0xFFC9B0);
    doorSign.position.set(0, 2.5, -3.85);
    this.group.add(doorFrame, doorSign);
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
      clickSystem.register(plant, `🌱 ${sk.name}`, () => this.openSkills(sk.id, plant));

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
        onInteract: () => this.openSkills(bed.group)
      });
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

  update(delta: number): void {
    // Gentle foliage sway
    const t = performance.now() * 0.002;
    this.plants.forEach((plant, idx) => {
      plant.rotation.z = Math.sin(t + idx) * 0.04;
    });
  }

  dispose(): void {
    interactionSystem.clear();
    this.plants = [];
    this.beds = [];
    this.group.clear();
  }
}
