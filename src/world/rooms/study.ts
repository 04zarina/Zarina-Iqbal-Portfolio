import * as THREE from 'three';
import { collisionSystem } from '../collision';
import { interactionSystem } from '../interaction';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';
import { assetLoader } from '../../core/loaders';
import { Avatar } from '../avatar/avatar';
import { sparkleSystem } from '../fx/sparkles';
import { DECOR, placeDecor, recenter } from '../decor';
import { clickSystem } from '../clickables';
import { jellyController } from '../fx/jelly';
import projectsData from '../../../content/projects.json';
import type { Project } from '../../content/types';
import { makeDoor, makeRug, NightLights, Door } from '../props';
import { registerSeat } from '../seats';
import { refs } from '../refs';
import type { RoomId } from '../../core/store';
import { certificates, certificateViewerArg } from '../../content/certificates';

/** Big "More Projects" board on the left wall (z centre). */
const BOARD_Z = 0.3;

function makeNoteLabel(text: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5A3A32';
  let size = 36;
  ctx.font = `bold ${size}px sans-serif`;
  while (ctx.measureText(text).width > 490 && size > 18) ctx.font = `bold ${--size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.09), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
}

export class StudyRoom {
  public group: THREE.Group = new THREE.Group();
  public spawnPoint = new THREE.Vector3(0, 0, -2.8);
  private avatar: Avatar | null = null;
  private resumeTag: THREE.Mesh | null = null;
  private doors: Door[] = [];
  private night = new NightLights();
  public entries: Partial<Record<RoomId, { pos: THREE.Vector3; yaw: number }>> = {
    bedroom: { pos: new THREE.Vector3(0, 0, -2.9), yaw: 0 }
  };
  public exits: Partial<Record<RoomId, THREE.Vector3>> = { bedroom: new THREE.Vector3(0, 0, -3.25) };

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

    // Rugs: a checked one under the desk, a round one in the reading corner, a runner from the door
    const rug = makeRug({ shape: 'rect', w: 3.6, d: 2.6, colors: ['#BDEBD3', '#FFF6EC', '#76B885'], pattern: 'checker' });
    rug.position.set(0, 0.012, 1.3);
    const cornerRug = makeRug({ shape: 'round', w: 2.4, colors: ['#FFE9A3', '#FFF6EC', '#E8B53E'], pattern: 'rings' });
    cornerRug.position.set(3.4, 0.013, 0);
    const runner = makeRug({ shape: 'rect', w: 1.1, d: 2.4, colors: ['#FFC9B0', '#FFF6EC', '#E58F6F'], pattern: 'stripes' });
    runner.position.set(0, 0.013, -2.4);
    this.group.add(rug, cornerRug, runner);

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

    // Pinned sticky notes on corkboard with readable labels.
    // The board faces -Z, so +X here reads as the left side for the viewer.
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

    // Bottom row: sticky notes that open each section
    const note1 = makeNote('🎓 Education', 'BS CS, Gaming & Animation · NED · CGPA 3.657', 0xFFF6EC, 1.5, -0.5, 0.05);
    const note2 = makeNote('💼 Experience', 'Game Dev Intern, Aerox ERP · IT Intern, KDA', 0xFFE9A3, 0.52, -0.42, -0.04);
    const note3 = makeNote('🎤 Community', "Hosted GameCon'25 & '26 · GameVerse · SENTEC", 0xFFB3C7, -0.5, -0.5, 0.08);
    const note4 = makeNote('📜 Certificates', 'CEGA Unreal · Pre & Post-Production · Google AI', 0xBDEBD3, -1.5, -0.42, -0.06);
    [note1, note2, note3, note4].forEach((n) => n.scale.setScalar(0.85));
    corkGroup.add(note1, note2, note3, note4);

    // Each sticky note is clickable and opens its own section
    const openTab = (tab: string) => () => eventBus.emit('open:education', tab);
    clickSystem.register(note1, '🎓 Education: click to read', openTab('education'));
    clickSystem.register(note2, '💼 Experience: click to read', openTab('experience'));
    clickSystem.register(note3, '🎤 Community & GameCon photos', () => eventBus.emit('open:community', 0));
    clickSystem.register(note4, '📜 Certificates: click to read', openTab('certificates'));
    [note1, note2, note3, note4].forEach((n) => jellyController.register(n));

    // Top row: the actual certificate scans, pinned like polaroids. Click one to see it full size.
    const loader = new THREE.TextureLoader();
    const pinned = certificates.filter((c) => c.thumb);
    pinned.forEach((c, i) => {
      const photo = new THREE.Group();
      const x = 1.45 - i * (2.9 / Math.max(1, pinned.length - 1));
      photo.position.set(x, 0.42, -0.07);
      photo.rotation.set(0, Math.PI, [0.04, -0.05, 0.03, -0.03][i % 4]);
      const border = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.66), new THREE.MeshBasicMaterial({ color: 0xfffdf8 }));
      const tex = loader.load(c.thumb!);
      tex.colorSpace = THREE.SRGBColorSpace;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshBasicMaterial({ map: tex }));
      pic.position.set(0, 0.04, 0.002);
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), new THREE.MeshLambertMaterial({ color: [0xe74c3c, 0x3a7bd5, 0x2ead6b, 0xf2c14e][i % 4] }));
      pin.position.set(0, 0.3, 0.02);
      const label = makeNoteLabel(c.title);
      label.position.set(0, -0.27, 0.003);
      photo.add(border, pic, pin, label);
      corkGroup.add(photo);
      clickSystem.register(photo, `📜 ${c.title}: click to view`, () => eventBus.emit('open:image', certificateViewerArg(c.id)));
      jellyController.register(photo);
    });
    this.group.add(corkGroup);

    // 4. Bookshelves now stand against the front wall, either side of the door
    collisionSystem.addBox(-3.35, -1.85, -3.8, -3.25);
    collisionSystem.addBox(1.85, 3.35, -3.8, -3.25);
    // Big project board on the left wall sticks out a little
    collisionSystem.addBox(-4.8, -4.55, BOARD_Z - 1.6, BOARD_Z + 1.6);

    // 5. Reading corner on Right Wall: couch, coffee table, floor lamp
    collisionSystem.addBox(3.9, 4.8, -1.1, 1.1);
    collisionSystem.addBox(2.7, 3.5, -0.45, 0.45);
    collisionSystem.addBox(4.0, 4.8, 1.3, 2.0);
    // Plants in the back corners
    collisionSystem.addBox(-4.8, -3.8, 2.9, 3.8);
    collisionSystem.addBox(3.8, 4.8, 2.9, 3.8);

    // 6. Doorway back to Bedroom (Front wall: x = 0, z = -3.9)
    const homeDoor = makeDoor('home', 'BEDROOM', 'Back to the hub');
    homeDoor.group.position.set(0, 0, -3.8);
    this.doors.push(homeDoor);
    this.group.add(homeDoor.group);
    void baseboardMat;

    // Warm lamps for night mode
    const deskLamp = new THREE.PointLight(0xffd59a, 0.2, 5);
    deskLamp.position.set(0.6, 1.6, 1.8);
    const cornerLamp = new THREE.PointLight(0xffc98a, 0.15, 6);
    cornerLamp.position.set(4.3, 1.8, 1.65);
    this.group.add(this.night.addLight(deskLamp, 0.2, 1.6), this.night.addLight(cornerLamp, 0.15, 1.8));
    const shade = this.night.halo(0xffd59a, 0.9);
    shade.position.set(4.4, 1.75, 1.65);
    this.group.add(shade);

    // 6b. Board of smaller projects on the left wall, between the bookshelves and the plant
    this.buildProjectBoard();

    // 7. Table collision box (sealed toward back wall)
    collisionSystem.addBox(-1.6, 1.6, 1.3, 2.5);
  }

  private async loadGLBModels(): Promise<void> {
    const decorReady = placeDecor(this.group, [
      // Bookshelves against the left wall, facing into the room
      { url: DECOR.bookshelf, position: [-2.6, 0, -3.76], scale: 1.3 },
      { url: DECOR.bookshelf, position: [2.6, 0, -3.76], scale: 1.3 },
      // Reading corner
      { url: DECOR.couchPink, position: [4.45, 0, 0], rotY: -Math.PI / 2, scale: 1.2 },
      { url: DECOR.coffeeTable, position: [3.1, 0.353, 0] },
      { url: DECOR.bookStack, position: [3.05, 0.42, 0.05], rotY: 0.5 },
      { url: DECOR.floorLamp, position: [4.4, 0, 1.65] },
      // Greenery and wall art
      { url: DECOR.plantTall, position: [-4.3, 0, 3.35], scale: 1.4 },
      { url: DECOR.plantPalm, position: [4.25, 0, 3.3], scale: 0.62 },
      { url: DECOR.pictureSun, position: [4.8, 1.9, -1.9], rotY: -Math.PI / 2, scale: 0.9 },
      // Study chair (avatar sits here facing the desk)
      { url: DECOR.chairPC, position: [0, 0, 0.95] }
    ]);

    // 1. Study Desk (Work_Table_06.glb): top at y = 0.76
    const deskGltf = await assetLoader.loadGLTF('desk');
    if (deskGltf) {
      deskGltf.position.set(0, 0, 1.8);
      deskGltf.rotation.y = 0;
      this.group.add(deskGltf);
    } else {
      this.buildFallbackDesk();
      this.buildFallbackChair();
    }

    // 2. Desktop computer facing the chair
    const computer = await assetLoader.loadUrl(DECOR.computer);
    if (computer) {
      const pc = recenter(computer);
      pc.position.set(-0.2, 0.76, 1.95);
      pc.rotation.y = Math.PI;
      pc.scale.setScalar(0.85);
      this.group.add(pc);
    }

    // 3. Resume on the desk, with a floating tag so visitors can spot it
    const paper = await assetLoader.loadUrl(DECOR.paper);
    const resumeGroup = new THREE.Group();
    resumeGroup.position.set(0.42, 0.765, 1.6);
    resumeGroup.rotation.y = Math.PI + 0.25;
    if (paper) {
      paper.scale.setScalar(1.3);
      resumeGroup.add(paper);
    } else {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.01, 0.32), new THREE.MeshLambertMaterial({ color: 0xFFF6EC }));
      resumeGroup.add(sheet);
    }
    this.group.add(resumeGroup);
    clickSystem.register(resumeGroup, '📄 Read & download my resume', () => this.openResume());

    this.resumeTag = this.createResumeTag();
    this.resumeTag.position.set(0.42, 1.12, 1.6);
    this.group.add(this.resumeTag);
    clickSystem.register(this.resumeTag, '📄 Read & download my resume', () => this.openResume());

    await decorReady;
  }

  /** Small billboard label that floats above the resume. */
  private createResumeTag(): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFE9A3';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 72, 22);
    ctx.fill();
    ctx.strokeStyle = '#5A3A32';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#5A3A32';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📄 RESUME', 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.16),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
  }

  private openResume(): void {
    sparkleSystem.burst(new THREE.Vector3(0.42, 1.0, 1.6), 14);
    store.completeQuest('get_resume');
    store.set('activeOverlay', 'resume');
    eventBus.emit('overlay:open', 'resume');
  }

  /**
   * A cork display board of the smaller projects (everything that isn't an arcade cabinet).
   * One canvas texture for the whole board, plus an invisible click target per card.
   */
  private buildProjectBoard(): void {
    const side = (projectsData as Project[]).filter((p) => !p.featured).slice(0, 9);
    const W = 1600;
    const H = 1020;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;

    const cols = 3;
    const pad = 34;
    const top = 160;
    const cw = (W - pad * (cols + 1)) / cols;
    const ch = (H - top - pad * 4) / 3;
    const images: (HTMLImageElement | null)[] = side.map(() => null);

    const draw = () => {
      ctx.fillStyle = '#C99A6B';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      for (let i = 0; i < 400; i++) ctx.fillRect((i * 97) % W, (i * 53) % H, 4, 4);
      ctx.fillStyle = '#FFF6EC';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 520, 26, 1040, 108, 30);
      ctx.fill();
      ctx.fillStyle = '#5A3A32';
      ctx.font = 'bold 66px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🗂️ More Projects · click a card', W / 2, 82);
      side.forEach((p, i) => {
        const x = pad + (i % cols) * (cw + pad);
        const y = top + pad + Math.floor(i / cols) * (ch + pad);
        ctx.save();
        ctx.translate(x + cw / 2, y + ch / 2);
        ctx.rotate(((i * 37) % 7 - 3) * 0.006);
        ctx.translate(-cw / 2, -ch / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(6, 8, cw, ch);
        ctx.fillStyle = '#FFFDF8';
        ctx.fillRect(0, 0, cw, ch);
        const ih = ch - 84;
        const img = images[i];
        if (img) {
          const r = Math.max((cw - 20) / img.width, ih / img.height);
          const sw = (cw - 20) / r;
          const sh = ih / r;
          ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 10, 10, cw - 20, ih);
        } else {
          ctx.fillStyle = p.accentColor || '#FFE9A3';
          ctx.fillRect(10, 10, cw - 20, ih);
        }
        ctx.fillStyle = '#5A3A32';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        let title = p.title;
        while (ctx.measureText(title).width > cw - 24 && title.length > 4) title = title.slice(0, -2);
        if (title !== p.title) title = title.trimEnd() + '…';
        ctx.fillText(title, cw / 2, ih + 38);
        ctx.font = '24px sans-serif';
        ctx.fillStyle = '#8A5A4A';
        ctx.fillText(`${p.year} · ${p.tools[0] ?? ''}`.slice(0, 34), cw / 2, ih + 70);
        // pin
        ctx.fillStyle = ['#E74C3C', '#3A7BD5', '#2EAD6B'][i % 3];
        ctx.beginPath();
        ctx.arc(cw / 2, 4, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      tex.needsUpdate = true;
    };
    draw();
    side.forEach((p, i) => {
      const src = p.images?.[0]?.src;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        images[i] = img;
        draw();
      };
      img.src = src;
    });

    const boardW = 3.1;
    const boardH = (boardW * H) / W;
    const board = new THREE.Group();
    board.position.set(-4.76, 1.65, BOARD_Z);
    board.rotation.y = Math.PI / 2; // face into the room (+X)
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(boardW + 0.1, boardH + 0.1, 0.05),
      new THREE.MeshLambertMaterial({ color: 0x8a5a4a })
    );
    const face = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.z = 0.03;
    board.add(frame, face);

    // One invisible click target per card
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    side.forEach((p, i) => {
      const x = pad + (i % cols) * (cw + pad) + cw / 2;
      const y = top + pad + Math.floor(i / cols) * (ch + pad) + ch / 2;
      const hit = new THREE.Mesh(new THREE.PlaneGeometry((cw / W) * boardW, (ch / H) * boardH), hitMat);
      hit.position.set((x / W - 0.5) * boardW, (0.5 - y / H) * boardH, 0.04);
      board.add(hit);
      clickSystem.register(hit, `🎮 ${p.title}`, () => {
        store.set('activeOverlay', 'project');
        eventBus.emit('project:select', p.id);
      });
    });
    this.group.add(board);
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

    // 3. Resume on the desk: preview + download. Priority makes it win over the chair
    //    and corkboard, which overlap the same spot at the desk.
    interactionSystem.register({
      id: 'resume',
      label: 'Read & Download Resume 📄',
      keyHint: 'E',
      radius: 1.6,
      priority: 0.45,
      position: new THREE.Vector3(0.75, 0.9, 1.15),
      onInteract: () => this.openResume()
    });

    // 3b. Side-project board on the left wall
    interactionSystem.register({
      id: 'project_board',
      label: 'Browse my other projects 🗂️',
      keyHint: 'E',
      radius: 2.0,
      priority: 0.3,
      position: new THREE.Vector3(-4.0, 0.5, BOARD_Z),
      onInteract: () => eventBus.emit('open:library', 'All')
    });

    registerSeat({ id: 'seat_couch_l', label: 'Sit on the couch 🛋️', position: new THREE.Vector3(4.15, 0, -0.45), yaw: -Math.PI / 2, height: 0.42 });
    registerSeat({ id: 'seat_couch_r', label: 'Sit on the couch 🛋️', position: new THREE.Vector3(4.15, 0, 0.5), yaw: -Math.PI / 2, height: 0.42 });

    // 4. Doorway back to Bedroom
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

  update(delta: number): void {
    const av = refs.avatar?.position ?? null;
    this.doors.forEach((d) => d.update(delta, av));
    this.night.update();
    if (this.resumeTag) {
      const t = performance.now() * 0.002;
      this.resumeTag.position.y = 1.12 + Math.sin(t) * 0.03;
      // Billboard toward the camera side of the room (-Z) with a gentle sway
      this.resumeTag.rotation.y = Math.PI + Math.sin(t * 0.5) * 0.15;
    }
  }

  dispose(): void {
    interactionSystem.clear();
    this.resumeTag = null;
    this.doors = [];
    this.group.clear();
  }
}
