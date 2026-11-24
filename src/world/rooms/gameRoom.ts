import * as THREE from 'three';
import { collisionSystem } from '../collision';
import { interactionSystem } from '../interaction';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';
import allProjects from '../../../content/projects.json';
import { DECOR, placeDecor } from '../decor';
import { clickSystem } from '../clickables';
import { makeDoor, makeRug, makeSign, NightLights, Door } from '../props';
import { registerSeat } from '../seats';
import { refs } from '../refs';
import type { RoomId } from '../../core/store';
import { audioManager } from '../../audio/audioManager';

// Big arcade cabinets show the featured projects; mini cabinets along the side walls show the rest.
const projectsData = allProjects.filter((p) => p.featured).slice(0, 5);
const sideProjects = allProjects.filter((p) => !p.featured).slice(0, 9);
type ProjectEntry = (typeof allProjects)[number];

/** Bean bags in the lounge: [x, z, yaw (0 = facing +Z), colour]. They face the featured row. */
const BEAN_BAGS: [number, number, number, number][] = [
  [-2.1, 2.2, Math.PI - 0.4, 0xffb3c7],
  [-0.8, 2.6, Math.PI - 0.12, 0xbde0ff],
  [0.8, 2.6, Math.PI + 0.12, 0xffe9a3],
  [2.1, 2.2, Math.PI + 0.4, 0xbdebd3]
];

/** Featured cabinets: one big row along the back wall, evenly spaced, on a lit stage. */
const FEATURED_SCALE = 1.12;
const FEATURED_SPACING = 2.0;
const FEATURED_Z = -3.05;
const featuredX = (i: number) => (i - (Math.min(5, projectsData.length) - 1) / 2) * FEATURED_SPACING;

/**
 * Mini cabinet slots: [x, z, rotY], evenly spaced 1.15 m apart with clear gaps between them.
 * Left wall faces +X; right wall faces -X and leaves the door (z = 0) free.
 */
/** Shared spotlight pieces for the featured cabinets. */
// Each beam leans from a ceiling can over the aisle down onto the front of the stage
const SPOT_TOP = new THREE.Vector3(0, 3.9, FEATURED_Z + 2.0);
const SPOT_FOOT = new THREE.Vector3(0, 0.13, FEATURED_Z + 0.55);
const SPOT_BEAM_H = SPOT_TOP.distanceTo(SPOT_FOOT);
const SPOT_TILT = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), SPOT_TOP.clone().sub(SPOT_FOOT).normalize());
const SPOT_CAN_GEO = new THREE.CylinderGeometry(0.16, 0.22, 0.22, 16);
const SPOT_CAN_MAT = new THREE.MeshLambertMaterial({ color: 0x2b2238 });
const SPOT_BEAM_GEO = new THREE.CylinderGeometry(0.13, 0.62, SPOT_BEAM_H, 28, 1, true);
const SPOT_BEAM_MAT = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  uniforms: { color: { value: new THREE.Color(0xfff0c8) } },
  vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
    void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 color; varying float vY; varying vec3 vN; varying vec3 vV;
    void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
      float a = mix(0.55, 0.1, vY) * edge; gl_FragColor = vec4(color * a, a); }`
});
const SPOT_POOL_GEO = new THREE.CircleGeometry(0.66, 32);
let spotPool: THREE.MeshBasicMaterial | null = null;
function spotPoolMat(): THREE.MeshBasicMaterial {
  if (spotPool) return spotPool;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,244,210,1)');
  grad.addColorStop(0.6, 'rgba(255,232,185,0.55)');
  grad.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  spotPool = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  return spotPool;
}

const MINI_SLOTS: [number, number, number][] = [
  // left wall (faces +X): five cabinets spread evenly along the whole wall
  [-5.4, -1.9, Math.PI / 2],
  [-5.4, -0.65, Math.PI / 2],
  [-5.4, 0.6, Math.PI / 2],
  [-5.4, 1.85, Math.PI / 2],
  [-5.4, 3.1, Math.PI / 2],
  // right wall (faces -X): the door at z = 0 stays free, cabinets fill both sides of it
  [5.4, -1.9, -Math.PI / 2],
  [5.4, -1.05, -Math.PI / 2],
  [5.4, 1.4, -Math.PI / 2],
  [5.4, 2.55, -Math.PI / 2]
];

export class GameRoom {
  public group: THREE.Group = new THREE.Group();
  public spawnPoint = new THREE.Vector3(4.0, 0, 0);
  /** Face into the room (toward the content at -Z) on entry. */
  public spawnRotationY = Math.PI;
  private doors: Door[] = [];
  private night = new NightLights();
  public entries: Partial<Record<RoomId, { pos: THREE.Vector3; yaw: number }>> = {
    bedroom: { pos: new THREE.Vector3(4.9, 0, 0), yaw: -Math.PI / 2 }
  };
  public exits: Partial<Record<RoomId, THREE.Vector3>> = { bedroom: new THREE.Vector3(5.3, 0, 0) };
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

    // 3. Featured arcade cabinets: the stars of the room. Bigger, on a glowing stage, each
    //    with a spotlight cone and a star badge.
    const stage = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.12, 1.5), new THREE.MeshLambertMaterial({ color: 0x3a2a4e }));
    stage.position.set(0, 0.06, FEATURED_Z + 0.05);
    const stageEdge = this.night.bulb(0xffe27a, 0.03);
    stageEdge.scale.set(183, 1, 1);
    stageEdge.position.set(0, 0.125, FEATURED_Z + 0.8);
    this.group.add(stage, stageEdge);
    projectsData.forEach((project, index) => {
      const posX = featuredX(index);
      const cab = this.createArcadeCabinet(project, posX, FEATURED_Z, index);
      cab.position.y = 0.12;
      cab.scale.setScalar(FEATURED_SCALE);
      this.group.add(cab);
      // Spotlight: a ceiling can, a soft beam that gets brighter toward the floor, and a
      // pool of light on the stage in front of the cabinet (all unlit meshes, no real lights).
      const can = new THREE.Mesh(SPOT_CAN_GEO, SPOT_CAN_MAT);
      can.position.set(posX, SPOT_TOP.y, SPOT_TOP.z);
      can.quaternion.copy(SPOT_TILT);
      const beam = new THREE.Mesh(SPOT_BEAM_GEO, SPOT_BEAM_MAT);
      beam.position.set(posX, (SPOT_TOP.y + SPOT_FOOT.y) / 2, (SPOT_TOP.z + SPOT_FOOT.z) / 2);
      beam.quaternion.copy(SPOT_TILT);
      beam.userData.noFade = true;
      const pool = new THREE.Mesh(SPOT_POOL_GEO, spotPoolMat());
      pool.rotation.x = -Math.PI / 2;
      pool.scale.set(1, 1.25, 1);
      pool.position.set(posX, 0.127, SPOT_FOOT.z);
      pool.userData.noFade = true;
      this.group.add(can, beam, pool);
      const star = makeSign('FEATURED', { emoji: '⭐', width: 0.75, bg: '#FFE9A3' });
      star.position.set(posX, 2.86, FEATURED_Z + 0.42);
      this.group.add(star);
      collisionSystem.addBox(posX - 0.75, posX + 0.75, FEATURED_Z - 0.6, FEATURED_Z + 0.75);
    });

    // 4. Door back to the Bedroom (right wall)
    const homeDoor = makeDoor('home', 'BEDROOM', 'Back to the hub');
    homeDoor.group.position.set(5.9, 0, 0);
    homeDoor.group.rotation.y = -Math.PI / 2;
    this.doors.push(homeDoor);
    this.group.add(homeDoor.group);
    void baseboardMat;

    // 4b. Mini cabinets for the smaller projects along both side walls
    sideProjects.forEach((project, i) => {
      const slot = MINI_SLOTS[i];
      if (!slot) return;
      const [x, z, rot] = slot;
      const cab = this.createArcadeCabinet(project, 0, 0, 10 + i);
      cab.position.set(x, 0, z);
      cab.rotation.y = rot;
      cab.scale.setScalar(0.7);
      this.group.add(cab);
      collisionSystem.addBox(x - 0.36, x + 0.36, z - 0.4, z + 0.4);
      clickSystem.register(cab, `🕹️ ${project.title}`, () => this.openProject(project.id));
      const front = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
      interactionSystem.register({
        id: `mini_${project.id}`,
        label: `Play ${project.title} 🪙`,
        radius: 1.25,
        position: new THREE.Vector3(x, 0.9, z).addScaledVector(front, 0.6),
        onInteract: () => this.openProject(project.id)
      });
    });
    const sideSignL = makeSign('MORE GAMES', { emoji: '👾', subtitle: 'Side projects', width: 1.3, bg: '#281D35', fg: '#FFE9A3' });
    sideSignL.position.set(-5.88, 2.75, 0.4);
    sideSignL.rotation.y = Math.PI / 2;
    const backSign = makeSign('FEATURED GAMES', { emoji: '🕹️', width: 2.6, bg: '#281D35', fg: '#FFB3E1' });
    backSign.position.set(0, 3.35, -3.88);
    this.group.add(sideSignL, backSign);

    // Rugs
    const lounge = makeRug({ shape: 'rect', w: 5.2, d: 2.6, colors: ['#3A2A4E', '#FFB3E1', '#BDE0FF'], pattern: 'diamond' });
    lounge.position.set(0, 0.012, 2.3);
    const lane = makeRug({ shape: 'rect', w: 10.2, d: 1.0, colors: ['#281D35', '#FFE9A3', '#FF7AC8'], pattern: 'stripes' });
    lane.position.set(0, 0.013, -2.0);
    this.group.add(lounge, lane);

    // Neon strips that glow at night, plus coloured light from the cabinets
    const neonColors = [0xff7ac8, 0x7ad7ff, 0xffe27a];
    const strip = this.night.bulb(neonColors[0], 0.03);
    strip.scale.set(190, 1, 1);
    strip.position.set(0, 3.6, -3.88);
    const stripL = this.night.bulb(neonColors[1], 0.03);
    stripL.scale.set(1, 1, 125);
    stripL.position.set(-5.88, 3.6, 0);
    this.group.add(strip, stripL);
    projectsData.forEach((_, index) => {
      const glow = new THREE.PointLight(neonColors[index % 3], 0, 3.4);
      glow.position.set(featuredX(index), 1.8, -2.1);
      this.group.add(this.night.addLight(glow, 0.25, 1.4));
    });

    // Chill lounge: bean bags round a low table, facing the featured cabinets
    placeDecor(this.group, [
      { url: DECOR.coffeeTable, position: [0, 0.353, 1.7] },
      { url: DECOR.gamepad, position: [0.05, 0.42, 1.7], rotY: 0.3, scale: 1.4 }
    ]);
    BEAN_BAGS.forEach(([x, z, yaw, color]) => {
      const bag = this.createBeanBag(color);
      bag.position.set(x, 0, z);
      bag.rotation.y = yaw;
      this.group.add(bag);
      collisionSystem.addBox(x - 0.38, x + 0.38, z - 0.38, z + 0.38);
    });
    collisionSystem.addBox(-0.45, 0.45, 1.3, 2.1);
  }

  /** Squashy bean bag: a slumped body with a raised back and a seam ring. Faces +Z. */
  private createBeanBag(color: number): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), mat);
    body.scale.set(1, 0.55, 1);
    body.position.y = 0.24;
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 12), mat);
    back.scale.set(1.05, 0.95, 0.6);
    back.position.set(0, 0.46, -0.24);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 6, 28), new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.8) }));
    seam.rotation.x = Math.PI / 2;
    seam.position.y = 0.27;
    seam.scale.set(1, 1, 1);
    const dent = new THREE.Mesh(new THREE.CircleGeometry(0.22, 18), new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.88) }));
    dent.rotation.x = -Math.PI / 2;
    dent.position.set(0, 0.485, 0.05);
    g.add(body, back, seam, dent);
    return g;
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

  private createArcadeCabinet(project: ProjectEntry, x: number, z: number, index: number): THREE.Group {
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

  private createAnimatedScreen(project: ProjectEntry, index: number): THREE.Mesh {
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
    projectsData.forEach((project, index) => {
      const posX = featuredX(index);
      const posZ = FEATURED_Z;

      interactionSystem.register({
        id: `cabinet_${index + 1}`,
        label: `Play ${project.title} 🪙`,
        radius: 1.8,
        position: new THREE.Vector3(posX, 1.3, posZ + 0.9),
        focusPose: {
          position: new THREE.Vector3(posX, 1.75, posZ + 1.9),
          lookAt: new THREE.Vector3(posX, 1.7, posZ)
        },
        onInteract: () => this.openProject(project.id)
      });
    });

    BEAN_BAGS.forEach(([x, z, yaw], i) =>
      registerSeat({
        id: `seat_bean_${i}`,
        label: 'Flop onto the bean bag 🫘',
        // hips on the dent at the top of the bag, slightly forward of centre
        position: new THREE.Vector3(x + Math.sin(yaw) * 0.08, 0, z + Math.cos(yaw) * 0.08),
        yaw,
        height: 0.47,
        standAt: new THREE.Vector3(x + Math.sin(yaw) * 0.85, 0, z + Math.cos(yaw) * 0.85),
        radius: 1.2
      })
    );

    // Doorway back to Bedroom
    interactionSystem.register({
      id: 'DOOR_bedroom',
      label: 'Back to Bedroom 🚪',
      radius: 1.8,
      position: new THREE.Vector3(5.3, 0.5, 0),
      onInteract: () => eventBus.emit('room:switch', 'bedroom')
    });
  }

  private openProject(id: string): void {
    audioManager.playCoin();
    store.set('activeProjectId', id);
    store.set('activeOverlay', 'project');
    store.completeQuest('play_game');
    eventBus.emit('overlay:open', 'project');
    eventBus.emit('project:select', id);
  }

  private screenTimer = 0;

  update(delta: number): void {
    const av = refs.avatar?.position ?? null;
    this.doors.forEach((d) => d.update(delta, av));
    this.night.update();
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
    this.doors = [];
    this.group.clear();
  }
}
