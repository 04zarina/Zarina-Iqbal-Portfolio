import * as THREE from 'three';
import { collisionSystem } from '../collision';
import { interactionSystem } from '../interaction';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';
import { sparkleSystem } from '../fx/sparkles';
import { jellyController } from '../fx/jelly';
import skillsData from '../../../content/skills.json';
import { DECOR, placeDecor } from '../decor';

export class GreenhouseRoom {
  public group: THREE.Group = new THREE.Group();
  public spawnPoint = new THREE.Vector3(0, 0, -2.8);
  private plants: THREE.Group[] = [];

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

    // 3. Greenhouse Plant Tables (Center and sides)
    // Wooden potting tables (top at y = 0.8) plus floor plants in the corners
    placeDecor(this.group, [
      { url: DECOR.longTable, position: [-3.35, 0, 1.8], scale: 1.07 },
      { url: DECOR.longTable, position: [-1.65, 0, 1.8], scale: 1.07 },
      { url: DECOR.longTable, position: [1.65, 0, 1.8], scale: 1.07 },
      { url: DECOR.longTable, position: [3.35, 0, 1.8], scale: 1.07 },
      { url: DECOR.longTable, position: [0, 0, 2.95], scale: 1.07 },
      { url: DECOR.plantPalm, position: [-4.3, 0, -3.2], scale: 0.6 },
      { url: DECOR.plantTall, position: [4.3, 0, -3.2], scale: 1.5 },
      { url: DECOR.plantTall, position: [-4.4, 0, 3.4], scale: 1.3 },
      { url: DECOR.plantPalm, position: [4.3, 0, 3.4], scale: 0.55 }
    ]);
    collisionSystem.addBox(-4.3, -0.7, 1.35, 2.25);
    collisionSystem.addBox(0.7, 4.3, 1.35, 2.25);
    collisionSystem.addBox(-0.95, 0.95, 2.5, 3.4);
    collisionSystem.addBox(-4.8, -3.8, -3.8, -2.7);
    collisionSystem.addBox(3.8, 4.8, -3.8, -2.7);

    // 4. Five Skill Plants
    // 1. Engines Plant (Bonsai Tree)
    const plantEngines = this.createPottedPlant('engines', 0xFFB3C7, 'bonsai');
    plantEngines.position.set(-3.5, 0.8, 1.8);
    // 2. Languages Plant (Round Succulent Cactus)
    const plantLanguages = this.createPottedPlant('languages', 0xBDEBD3, 'cactus');
    plantLanguages.position.set(-1.8, 0.8, 1.8);
    // 3. Web Plant (Big Sunflower)
    const plantWeb = this.createPottedPlant('web', 0xFFE9A3, 'sunflower');
    plantWeb.position.set(0, 0.8, 2.95);
    // 4. 3D & Animation Plant (Monstera with big leaves)
    const plant3D = this.createPottedPlant('3d', 0xBDE0FF, 'monstera');
    plant3D.position.set(1.8, 0.8, 1.8);
    // 5. Tools Plant (Fluffy Fern)
    const plantTools = this.createPottedPlant('tools', 0xD9C8FF, 'fern');
    plantTools.position.set(3.5, 0.8, 1.8);

    this.group.add(plantEngines, plantLanguages, plantWeb, plant3D, plantTools);
    this.plants.push(plantEngines, plantLanguages, plantWeb, plant3D, plantTools);

    // 5. Cute Watering Can on floor
    const canGroup = new THREE.Group();
    canGroup.position.set(-0.9, 0, 0.6);
    const canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.28, 16), new THREE.MeshLambertMaterial({ color: 0xFFB3C7 }));
    canBody.position.y = 0.14;
    const canSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0xFFB3C7 }));
    canSpout.position.set(0.18, 0.22, 0);
    canSpout.rotation.z = -0.7;
    canGroup.add(canBody, canSpout);
    this.group.add(canGroup);
    collisionSystem.addBox(-1.2, -0.6, 0.3, 0.9);

    // 6. Doorway back to Bedroom (Back wall: x = 0, z = -3.9)
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.15), baseboardMat);
    doorFrame.position.set(0, 1.2, -3.9);
    const doorSign = this.createSign('BEDROOM', 0xFFC9B0);
    doorSign.position.set(0, 2.5, -3.85);
    this.group.add(doorFrame, doorSign);
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

  private createPottedPlant(id: string, potColor: number, type: 'cactus' | 'bonsai' | 'sunflower' | 'monstera' | 'fern'): THREE.Group {
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
    const groups: { id: string; label: string; pos: THREE.Vector3; category: string }[] = [
      { id: 'plant_engines', label: 'Water Engines Garden 🌿', pos: new THREE.Vector3(-3.5, 0.8, 1.8), category: 'Engines' },
      { id: 'plant_languages', label: 'Water Languages Garden 🌸', pos: new THREE.Vector3(-1.8, 0.8, 1.8), category: 'Languages' },
      { id: 'plant_web', label: 'Water Web 3D Garden 🌻', pos: new THREE.Vector3(0, 0.8, 2.95), category: 'Web' },
      { id: 'plant_3d', label: 'Water 3D Art Garden 🌴', pos: new THREE.Vector3(1.8, 0.8, 1.8), category: '3D and Animation' },
      { id: 'plant_tools', label: 'Water Tools Garden 🪴', pos: new THREE.Vector3(3.5, 0.8, 1.8), category: 'Tools' }
    ];

    groups.forEach((g, i) => {
      interactionSystem.register({
        id: g.id,
        label: g.label,
        keyHint: 'E',
        radius: 1.8,
        position: g.pos,
        onInteract: () => {
          sparkleSystem.burst(new THREE.Vector3(g.pos.x, g.pos.y + 0.4, g.pos.z), 18);
          jellyController.trigger(this.plants[i], 0.3, -0.4, 0.3);
          store.set('activeOverlay', 'about'); // Or skills modal
          store.completeQuest('water_plant');
          eventBus.emit('overlay:open', 'skills');
          eventBus.emit('toast:show', `Inspected ${g.category} skills! 💧`);
        }
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
    this.group.clear();
  }
}
