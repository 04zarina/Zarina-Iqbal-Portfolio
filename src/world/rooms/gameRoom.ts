import * as THREE from 'three';
import { collisionSystem } from '../collision';
import { interactionSystem } from '../interaction';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';
import allProjects from '../../../content/projects.json';
import { DECOR, placeDecor } from '../decor';

// Arcade cabinets show the featured projects; the project card can browse all of them.
const projectsData = allProjects.filter((p) => p.featured).slice(0, 5);

export class GameRoom {
  public group: THREE.Group = new THREE.Group();
  public spawnPoint = new THREE.Vector3(4.0, 0, 0);
  /** Face into the room (toward the content at -Z) on entry. */
  public spawnRotationY = Math.PI;
  private animatedScreens: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; seed: number; poster: HTMLImageElement | null }[] = [];

  constructor() {
    this.buildRoom();
    this.setupInteractions();
  }

  private buildRoom(): void {
    // Room dimensions: 12 x 8 (safe interior bounds)
    collisionSystem.setBounds(-5.7, 5.7, -3.7, 3.7);

    const floorMat = this.createCheckerFloor();
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xFFB3C7 }); // Blush pink arcade walls
    const baseboardMat = new THREE.MeshLambertMaterial({ color: 0x8A5A4A });

    // 1. Floor
    const floorGeo = new THREE.PlaneGeometry(12, 8);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // 2. Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 0.2), wallMat);
    backWall.position.set(0, 2, -4);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 8), wallMat);
    leftWall.position.set(-6, 2, 0);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 8), wallMat);
    rightWall.position.set(6, 2, 0);
    this.group.add(backWall, leftWall, rightWall);

    // 3. Arcade Cabinets (Row of 5 along back wall)
    const cabinetSpacing = 2.1;
    const startX = -4.2;

    projectsData.forEach((project, index) => {
      const posX = startX + index * cabinetSpacing;
      const posZ = -3.1;
      const cab = this.createArcadeCabinet(project, posX, posZ, index);
      this.group.add(cab);
      collisionSystem.addBox(posX - 0.7, posX + 0.7, posZ - 0.6, posZ + 0.6);
    });

    // 4. Doorway back to Bedroom (Right Wall: x = 5.9, z = 0)
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 1.4), baseboardMat);
    doorFrame.position.set(5.9, 1.2, 0);
    const doorSign = this.createSign('BEDROOM', 0xFFC9B0);
    doorSign.position.set(5.85, 2.5, 0);
    doorSign.rotation.y = -Math.PI / 2;
    this.group.add(doorFrame, doorSign);

    // Cozy arcade lounge: couch facing the cabinets, two armchairs, coffee table with a gamepad
    placeDecor(this.group, [
      { url: DECOR.couchBlue, position: [0, 0, 2.75], rotY: Math.PI, scale: 1.1 },
      { url: DECOR.armchairBlue, position: [-2.7, 0, 2.3], rotY: 2.84 },
      { url: DECOR.armchairRed, position: [2.7, 0, 2.3], rotY: -2.84 },
      { url: DECOR.coffeeTable, position: [0, 0.353, 1.55] },
      { url: DECOR.gamepad, position: [0.05, 0.42, 1.55], rotY: 0.3, scale: 1.4 },
      { url: DECOR.plantPalm, position: [-5.3, 0, 3.3], scale: 0.62 },
      { url: DECOR.plantPalm, position: [5.3, 0, 3.3], scale: 0.62 },
      { url: DECOR.pictureFlowers, position: [-5.9, 1.9, 0], rotY: Math.PI / 2 },
      { url: DECOR.picturePyramid, position: [-5.9, 1.9, 1.4], rotY: Math.PI / 2 }
    ]);
    collisionSystem.addBox(-1.3, 1.3, 2.25, 3.2);
    collisionSystem.addBox(-0.45, 0.45, 1.15, 1.95);
    collisionSystem.addBox(-3.2, -2.2, 1.8, 2.8);
    collisionSystem.addBox(2.2, 3.2, 1.8, 2.8);
    collisionSystem.addBox(-5.8, -4.8, 2.9, 3.8);
    collisionSystem.addBox(4.8, 5.8, 2.9, 3.8);
  }

  private createCheckerFloor(): THREE.MeshLambertMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#FFF6EC';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#FFC9B0';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillRect(64, 64, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 4);
    return new THREE.MeshLambertMaterial({ map: tex });
  }

  private createArcadeCabinet(project: typeof projectsData[0], x: number, z: number, index: number): THREE.Group {
    const cab = new THREE.Group();
    cab.position.set(x, 0, z);

    // Accent color mapping
    const colorMap: Record<string, number> = {
      mint: 0xBDEBD3,
      peach: 0xFFC9B0,
      butter: 0xFFE9A3,
      sky: 0xBDE0FF,
      blush: 0xFFB3C7,
      lavender: 0xD9C8FF
    };
    const accentColor = colorMap[project.accentColor] || 0xFFC9B0;
    const bodyMat = new THREE.MeshLambertMaterial({ color: accentColor });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0xFFF6EC });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x3A2A4E });
    const joystickMat = new THREE.MeshLambertMaterial({ color: 0xFF5577 });
    const btnMat = new THREE.MeshLambertMaterial({ color: 0xFFE9A3 });

    // Lower base
    const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.9), bodyMat);
    baseMesh.position.y = 0.5;
    // Side trim panels
    const trimL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.95), trimMat);
    trimL.position.set(-0.55, 1.05, 0);
    const trimR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.95), trimMat);
    trimR.position.set(0.55, 1.05, 0);

    // Upper angled body
    const upperMesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 0.75), bodyMat);
    upperMesh.position.set(0, 1.5, -0.08);

    // Control panel (slanted)
    const ctrlPanel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.45), darkMat);
    ctrlPanel.position.set(0, 0.98, 0.32);
    ctrlPanel.rotation.x = 0.25;

    // Joystick
    const joyStick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.15), darkMat);
    joyStick.position.set(-0.25, 1.08, 0.32);
    const joyBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), joystickMat);
    joyBall.position.set(-0.25, 1.18, 0.32);

    // Buttons
    const btn1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04), btnMat);
    btn1.position.set(0.15, 1.04, 0.35);
    const btn2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04), btnMat);
    btn2.position.set(0.28, 1.04, 0.32);

    // Marquee Top Sign
    const marqueeMesh = this.createMarquee(project.title, accentColor);
    marqueeMesh.position.set(0, 2.05, 0.3);

    // Animated CRT Screen
    const screenMesh = this.createAnimatedScreen(project, index);
    // Sit just in front of the upper body's face (front at z ≈ 0.295) so the screen is visible
    screenMesh.position.set(0, 1.55, 0.31);

    cab.add(baseMesh, trimL, trimR, upperMesh, ctrlPanel, joyStick, joyBall, btn1, btn2, marqueeMesh, screenMesh);
    return cab;
  }

  private createMarquee(title: string, accentColor: number): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 72;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#281D35';
    ctx.fillRect(0, 0, 256, 72);
    ctx.strokeStyle = '#FFE9A3';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 250, 66);

    ctx.fillStyle = '#FFFFFF';
    let fontSize = 24;
    ctx.font = `bold ${fontSize}px Fredoka, sans-serif`;
    while (ctx.measureText(title).width > 232 && fontSize > 12) {
      fontSize -= 1;
      ctx.font = `bold ${fontSize}px Fredoka, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 128, 36);

    const tex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(0.92, 0.24);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    return new THREE.Mesh(geo, mat);
  }

  private createAnimatedScreen(project: typeof projectsData[0], index: number): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    // Show the project's real screenshot on the cabinet screen once it loads
    let poster: HTMLImageElement | null = null;
    if (project.video?.poster) {
      poster = new Image();
      poster.src = project.video.poster;
    }
    this.animatedScreens.push({ canvas, ctx, texture, seed: index * 40, poster });

    const geo = new THREE.PlaneGeometry(0.85, 0.65);
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    return new THREE.Mesh(geo, mat);
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
    const cabinetSpacing = 2.1;
    const startX = -4.2;

    projectsData.forEach((project, index) => {
      const posX = startX + index * cabinetSpacing;
      const posZ = -3.1;

      interactionSystem.register({
        id: `cabinet_${index + 1}`,
        label: `Play ${project.title} 🪙`,
        keyHint: 'E',
        radius: 1.8,
        position: new THREE.Vector3(posX, 1.2, posZ + 0.8),
        focusPose: {
          position: new THREE.Vector3(posX, 1.5, posZ + 1.6),
          lookAt: new THREE.Vector3(posX, 1.45, posZ)
        },
        onInteract: () => {
          store.set('activeProjectId', project.id);
          store.set('activeOverlay', 'project');
          store.completeQuest('play_game');
          eventBus.emit('overlay:open', 'project');
          eventBus.emit('project:select', project.id);
        }
      });
    });

    // Doorway back to Bedroom
    interactionSystem.register({
      id: 'DOOR_bedroom',
      label: 'Back to Bedroom 🚪',
      keyHint: 'E',
      radius: 1.8,
      position: new THREE.Vector3(5.3, 0.5, 0),
      onInteract: () => eventBus.emit('room:switch', 'bedroom')
    });
  }

  private screenTimer = 0;

  update(delta: number): void {
    // Redraw cabinet screens at ~20 fps; they don't need the full frame rate
    this.screenTimer += delta;
    if (this.screenTimer < 0.05) return;
    this.screenTimer = 0;
    const t = performance.now() * 0.003;
    // Animate retro arcade screens with cute moving shapes / pixel grids
    this.animatedScreens.forEach((item, idx) => {
      const { ctx, canvas, texture, seed, poster } = item;
      const W = canvas.width;
      const H = canvas.height;
      ctx.fillStyle = '#1D1328';
      ctx.fillRect(0, 0, W, H);

      if (poster && poster.complete && poster.naturalWidth > 0) {
        // Cover-fit screenshot with a slow Ken Burns drift
        const zoom = 1.08 + Math.sin(t * 0.3 + seed) * 0.04;
        const scale = Math.max(W / poster.naturalWidth, H / poster.naturalHeight) * zoom;
        const dw = poster.naturalWidth * scale;
        const dh = poster.naturalHeight * scale;
        ctx.drawImage(poster, (W - dw) / 2, (H - dh) / 2, dw, dh);
        // CRT scanlines
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
        ctx.fillStyle = 'rgba(29,19,40,0.72)';
        ctx.fillRect(0, H - 30, W, 30);
      } else {
        // Fallback: moving retro horizon grid
        ctx.strokeStyle = idx % 2 === 0 ? '#BDEBD3' : '#FFB3C7';
        ctx.lineWidth = 2;
        const offset = (t * 20 + seed) % 20;
        for (let y = H / 2; y < H; y += 16) {
          ctx.beginPath();
          ctx.moveTo(0, y + (offset * (y - H * 0.4)) / 100);
          ctx.lineTo(W, y + (offset * (y - H * 0.4)) / 100);
          ctx.stroke();
        }
      }

      // Coin insert text
      ctx.fillStyle = Math.sin(t * 5) > 0 ? '#FFFFFF' : '#FFB3C7';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PRESS E TO PLAY', W / 2, H - 10);

      texture.needsUpdate = true;
    });
  }

  dispose(): void {
    interactionSystem.clear();
    this.animatedScreens = [];
    this.group.clear();
  }
}
