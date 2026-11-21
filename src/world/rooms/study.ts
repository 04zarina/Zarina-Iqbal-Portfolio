import * as THREE from 'three';
import { collisionSystem } from '../collision';
import { interactionSystem } from '../interaction';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';
import { assetLoader } from '../../core/loaders';
import { Avatar } from '../avatar/avatar';

export class StudyRoom {
  public group: THREE.Group = new THREE.Group();
  public spawnPoint = new THREE.Vector3(0, 0, -2.8);
  private avatar: Avatar | null = null;

  constructor(avatar?: Avatar) {
    this.avatar = avatar || null;
    this.buildRoom();
    this.loadGLBModels();
    this.setupInteractions();
    this.setupEvents();
  }

  private buildRoom(): void {
    // 10 x 8 interior bounds
    collisionSystem.setBounds(-4.7, 4.7, -3.7, 3.7);

    const floorMat = new THREE.MeshLambertMaterial({ color: 0x8A5A4A }); // Warm cocoa parquet
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xD9C8FF }); // Lavender study walls
    const woodMat = new THREE.MeshLambertMaterial({ color: 0xD8B294 });
    const baseboardMat = new THREE.MeshLambertMaterial({ color: 0x5A3A32 });

    // 1. Floor
    const floorGeo = new THREE.PlaneGeometry(10, 8);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // Fluffy mint area rug under desk
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8), new THREE.MeshLambertMaterial({ color: 0xBDEBD3 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.01, 1.4);
    this.group.add(rug);

    // 2. Walls (Back, Left, Right, Front segments)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 0.2), wallMat);
    backWall.position.set(0, 2, 3.9);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 8), wallMat);
    leftWall.position.set(-4.9, 2, 0);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 8), wallMat);
    rightWall.position.set(4.9, 2, 0);

    // Front Wall with doorway back to bedroom
    const frontWallLeft = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4, 0.2), wallMat);
    frontWallLeft.position.set(-2.8, 2, -3.9);
    const frontWallRight = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4, 0.2), wallMat);
    frontWallRight.position.set(2.8, 2, -3.9);

    this.group.add(backWall, leftWall, rightWall, frontWallLeft, frontWallRight);

    // 3. Huge Corkboard (Back Wall: Timeline of Education & Experience)
    const corkGroup = new THREE.Group();
    corkGroup.position.set(0, 2.1, 3.78);

    const corkFrame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.08), woodMat);
    const corkMat = new THREE.MeshLambertMaterial({ color: 0xD2A679 });
    const corkFace = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.0), corkMat);
    corkFace.rotation.y = Math.PI;
    corkFace.position.z = -0.05;
    corkGroup.add(corkFrame, corkFace);

    // Pinned sticky notes on corkboard with readable labels
    const makeNote = (label: string, subtext: string, color: number, x: number, y: number, rot: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 192;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.fillRect(0, 0, 256, 192);
      ctx.strokeStyle = '#8A5A4A';
      ctx.lineWidth = 5;
      ctx.strokeRect(4, 4, 248, 184);
      // Pin circle
      ctx.fillStyle = '#E74C3C';
      ctx.beginPath(); ctx.arc(128, 16, 10, 0, Math.PI * 2); ctx.fill();
      // Label
      ctx.fillStyle = '#5A3A32';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 128, 76);
      // Subtext
      ctx.font = '20px sans-serif';
      ctx.fillStyle = '#7A5A4A';
      const words = subtext.split(' ');
      let line = '';
      let ly = 118;
      for (const word of words) {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > 230 && line.length > 0) {
          ctx.fillText(line.trim(), 128, ly); ly += 24; line = word + ' ';
        } else { line = test; }
      }
      ctx.fillText(line.trim(), 128, ly);

      const tex = new THREE.CanvasTexture(canvas);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.56),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      mesh.rotation.set(0, Math.PI, rot);
      mesh.position.set(x, y, -0.06);
      return mesh;
    };

    const note1 = makeNote('🎓 Education', 'B.S. CS · NED University 2023–2027', 0xFFF6EC, -1.2, 0.3, 0.05);
    const note2 = makeNote('💼 Experience', '3 roles · Gameplay Eng · WebGL Dev', 0xFFE9A3, 0.1, 0.42, -0.04);
    const note3 = makeNote('🛠 Skills', 'Three.js · Unity · C++ · React', 0xFFB3C7, 1.3, 0.3, 0.08);
    corkGroup.add(note1, note2, note3);
    this.group.add(corkGroup);

    // 4. Bookshelves on Left Wall
    const shelfBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.8, 2.4), woodMat);
    shelfBody.position.set(-4.4, 1.4, 0);
    this.group.add(shelfBody);
    collisionSystem.addBox(-4.8, -3.8, -1.3, 1.3);

    // 5. Reading couch on Right Wall
    const couch = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 2.0), new THREE.MeshLambertMaterial({ color: 0xFFE9A3 }));
    couch.position.set(4.2, 0.3, 0);
    this.group.add(couch);
    collisionSystem.addBox(3.5, 4.8, -1.2, 1.2);

    // 6. Doorway back to Bedroom (Front wall: x = 0, z = -3.9)
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.15), baseboardMat);
    doorFrame.position.set(0, 1.2, -3.8);
    const doorSign = this.createSign('BEDROOM', 0xFFC9B0);
    doorSign.position.set(0, 2.5, -3.75);
    this.group.add(doorFrame, doorSign);

    // 7. Table collision box (sealed toward back wall)
    collisionSystem.addBox(-1.6, 1.6, 1.3, 2.5);
  }

  private async loadGLBModels(): Promise<void> {
    // 1. Study Desk (Work_Table_06.glb)
    const deskGltf = await assetLoader.loadGLTF('desk');
    if (deskGltf) {
      deskGltf.position.set(0, 0, 1.8);
      deskGltf.rotation.y = 0;
      this.group.add(deskGltf);
    } else {
      this.buildFallbackDesk();
    }

    // 2. Study Chair on opposite side where avatar can sit (Chair_17.glb)
    const chairGltf = await assetLoader.loadGLTF('chair');
    if (chairGltf) {
      chairGltf.position.set(0, 0, 0.95);
      chairGltf.rotation.y = 0; // Facing desk and Mochi
      this.group.add(chairGltf);
    } else {
      this.buildFallbackChair();
    }

    // Cute laptop on desk
    const laptopBase = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.26), new THREE.MeshLambertMaterial({ color: 0xBDEBD3 }));
    laptopBase.position.set(-0.25, 0.77, 1.8);
    const laptopScreen = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.02), new THREE.MeshBasicMaterial({ color: 0xFFF6EC }));
    laptopScreen.position.set(-0.25, 0.89, 1.92);
    laptopScreen.rotation.x = -0.25;
    this.group.add(laptopBase, laptopScreen);
  }

  private buildFallbackDesk(): void {
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.1), new THREE.MeshLambertMaterial({ color: 0xD8B294 }));
    deskTop.position.set(0, 0.75, 1.8);
    this.group.add(deskTop);
  }

  private buildFallbackChair(): void {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0xD8B294 }));
    seat.position.set(0, 0.42, 0.95);
    this.group.add(seat);
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
    // 1. Study Chair on opposite side of table: avatar sits and edu segment opens!
    interactionSystem.register({
      id: 'study_chair',
      label: 'Sit down & Study 📖',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(0, 0.5, 0.95),
      focusPose: {
        position: new THREE.Vector3(0, 1.45, -0.4),
        lookAt: new THREE.Vector3(0, 1.5, 2.4)
      },
      onInteract: () => {
        if (this.avatar) {
          this.avatar.sitOnChair(new THREE.Vector3(0, 0.42, 0.95), 0);
        }
        store.set('activeOverlay', 'education');
        eventBus.emit('overlay:open', 'education');
        eventBus.emit('toast:show', 'Studying the Education & Career timeline! 📚 Press WASD or Space to stand up.');
      }
    });

    // 2. Corkboard (Career & Education Timeline)
    interactionSystem.register({
      id: 'corkboard',
      label: 'Inspect Career & Education 📌',
      keyHint: 'E',
      radius: 2.2,
      position: new THREE.Vector3(0, 1.2, 1.8),
      focusPose: {
        position: new THREE.Vector3(0, 1.8, 0.6),
        lookAt: new THREE.Vector3(0, 2.0, 3.8)
      },
      onInteract: () => {
        store.set('activeOverlay', 'education');
        eventBus.emit('overlay:open', 'education');
      }
    });

    // 3. Doorway back to Bedroom
    interactionSystem.register({
      id: 'DOOR_bedroom',
      label: 'Back to Bedroom 🚪',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(0, 0.5, -3.3),
      onInteract: () => eventBus.emit('room:switch', 'bedroom')
    });
  }

  private setupEvents(): void {
    eventBus.on('avatar:standup', () => {
      const ov = store.get().activeOverlay;
      if (ov === 'education' || ov === 'journal') {
        store.set('activeOverlay', 'none');
        eventBus.emit('overlay:close', ov);
      }
    });

    eventBus.on('overlay:close', (name: string) => {
      if ((name === 'education' || name === 'journal') && this.avatar?.isSitting) {
        this.avatar.standUp(new THREE.Vector3(0, 0, 0.5));
      }
    });
  }

  setAvatar(avatar: Avatar): void {
    this.avatar = avatar;
  }

  update(delta: number): void {}

  dispose(): void {
    interactionSystem.clear();
    this.group.clear();
  }
}
