import * as THREE from 'three';
import { collisionSystem } from '../collision';
import { interactionSystem } from '../interaction';
import { eventBus } from '../../core/events';
import { store } from '../../core/store';
import { sparkleSystem } from '../fx/sparkles';
import { assetLoader } from '../../core/loaders';
import { DECOR, placeDecor } from '../decor';
import { makePortal, makeSign, makeRug, makeFireflies, NightLights, Portal, Fireflies } from '../props';
import { BugBash } from '../games/bugBash';
import { registerSeat } from '../seats';
import { clickSystem } from '../clickables';
import { audioManager } from '../../audio/audioManager';
import type { RoomId } from '../../core/store';

export class DevRealmRoom {
  public group: THREE.Group = new THREE.Group();
  public spawnPoint = new THREE.Vector3(0, 0, 1.8);
  private clouds: THREE.Group[] = [];
  private floatingStars: THREE.Mesh[] = [];
  private portal: Portal | null = null;
  private fireflies: Fireflies | null = null;
  private night = new NightLights();
  private game: BugBash;
  private gameButton: THREE.Mesh | null = null;
  public entries: Partial<Record<RoomId, { pos: THREE.Vector3; yaw: number }>> = {
    bedroom: { pos: new THREE.Vector3(0, 0, 2.4), yaw: Math.PI }
  };
  public exits: Partial<Record<RoomId, THREE.Vector3>> = { bedroom: new THREE.Vector3(0, 0, 2.75) };

  constructor() {
    this.game = new BugBash(this.group);
    this.buildRealm();
    this.loadGLBModels();
    this.setupInteractions();
  }

  private buildRealm(): void {
    // Island radius ~ 5.5m
    collisionSystem.setBounds(-5.2, 5.2, -5.2, 5.2);

    const grassMat = new THREE.MeshLambertMaterial({ color: 0xBDEBD3 }); // Mint pastel grass
    const earthMat = new THREE.MeshLambertMaterial({ color: 0xD8B294 }); // Cake-like earth layer
    const darkEarthMat = new THREE.MeshLambertMaterial({ color: 0x8A5A4A });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0xBA9378 });
    const starMat = new THREE.MeshBasicMaterial({ color: 0xFFE9A3 });

    // 1. Floating Island (Layered cake diorama)
    // Top Grass Disc
    const islandGeo = new THREE.CylinderGeometry(5.8, 5.4, 0.4, 32);
    const islandTop = new THREE.Mesh(islandGeo, grassMat);
    islandTop.position.y = -0.2;
    this.group.add(islandTop);

    // Earth Layer 1
    const earth1 = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 4.4, 0.8, 32), earthMat);
    earth1.position.y = -0.8;
    // Earth Layer 2 (Tapering bottom)
    const earth2 = new THREE.Mesh(new THREE.ConeGeometry(4.4, 3.2, 32), darkEarthMat);
    earth2.rotation.x = Math.PI;
    earth2.position.y = -2.8;
    this.group.add(earth1, earth2);

    // 2. Wavy Layered Trees
    const tree1 = this.createLayeredTree(0x76B885);
    tree1.position.set(-3.2, 0, -2.4);
    const tree2 = this.createLayeredTree(0x82C29B);
    tree2.position.set(-2.2, 0, -3.4);
    const tree3 = this.createLayeredTree(0x76B885);
    tree3.position.set(3.4, 0, -2.0);
    this.group.add(tree1, tree2, tree3);
    collisionSystem.addBox(-3.8, -1.6, -3.9, -1.8);
    collisionSystem.addBox(2.8, 4.0, -2.6, -1.4);

    // 3. Soft Background Mountains
    const mountain1 = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.2, 6), new THREE.MeshLambertMaterial({ color: 0x8EA7E9 }));
    mountain1.position.set(0, 1.2, -4.5);
    const cap1 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.3, 6), new THREE.MeshLambertMaterial({ color: 0xFFF6EC }));
    cap1.position.set(0, 2.2, -4.5);
    this.group.add(mountain1, cap1);
    collisionSystem.addBox(-1.8, 1.8, -5.5, -3.5);

    // 4. Wooden Footbridge
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 3.0), woodMat);
    bridge.position.set(0, 0.06, 0);
    this.group.add(bridge);

    // 5. Return Wardrobe Portal
    const portalGroup = new THREE.Group();
    portalGroup.position.set(0, 0, 3.6);

    // Same wardrobe as the bedroom, doors facing the island (-Z), with a swirling portal in its doorway
    this.portal = makePortal(1.0, 1.85, 0xffb3e1, 0xb18cff);
    this.portal.group.position.set(0, 1.25, -0.42);
    this.portal.group.rotation.y = Math.PI;
    portalGroup.add(this.portal.group);
    const homeSign = makeSign('BEDROOM', { emoji: '🏠', subtitle: 'Step through to go home', width: 1.2, bg: '#FFE4EC' });
    homeSign.position.set(0, 3.0, -0.3);
    homeSign.rotation.y = Math.PI;
    portalGroup.add(homeSign);
    // Glowing stepping stones leading to the portal
    for (let i = 0; i < 3; i++) {
      const stone = this.night.bulb(0xd9c8ff, 0.18);
      stone.scale.set(1, 0.15, 0.8);
      stone.position.set(Math.sin(i * 1.7) * 0.25, 0.02, 1.9 + i * 0.42);
      this.group.add(stone);
    }
    this.group.add(portalGroup);
    placeDecor(portalGroup, [{ url: DECOR.wardrobe, position: [0, 0, 0.35], rotY: Math.PI, scale: 1.6 }]);
    collisionSystem.addBox(-1.0, 1.0, 3.2, 4.0);

    // 6. Sky Mailbox collision (Right outside the house in Dev Realm!)
    collisionSystem.addBox(1.3, 2.3, 1.4, 2.4);

    // 7. Floating Clouds and Stars around the island
    this.createFloatingSkyElements();

    // 8. Fireflies everywhere, and lamp posts that light up at night
    this.fireflies = makeFireflies(70, new THREE.Box3(new THREE.Vector3(-5, 0.3, -4.5), new THREE.Vector3(5, 3.2, 4.5)), 0xfff3a0, 0.45);
    this.group.add(this.fireflies.points);
    [[-1.3, 2.6], [1.3, 0.6], [-3.6, 0.4], [3.4, 2.8]].forEach(([x, z]) => this.addLampPost(x, z));

    // 9. Picnic blanket and a log bench to sit on
    const blanket = makeRug({ shape: 'rect', w: 1.8, d: 1.4, colors: ['#FFB3C7', '#FFF6EC', '#E58FA8'], pattern: 'checker' });
    blanket.position.set(2.9, 0.015, -0.2);
    blanket.rotation.z = 0.4;
    this.group.add(blanket);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.5, 12), new THREE.MeshLambertMaterial({ color: 0x8a5a4a }));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = -0.6;
    log.position.set(-3.0, 0.2, -1.3);
    this.group.add(log);
    collisionSystem.addBox(-3.6, -2.4, -1.7, -0.9);

    // 10. Bug Bash mini game: a big arcade button on a pedestal
    this.buildGameStation();
  }

  private addLampPost(x: number, z: number): void {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 8), new THREE.MeshLambertMaterial({ color: 0x5a3a32 }));
    post.position.set(x, 0.8, z);
    const bulb = this.night.bulb(0xffd27a, 0.12);
    bulb.position.set(x, 1.68, z);
    const halo = this.night.halo(0xffd27a, 1.0);
    halo.position.set(x, 1.68, z);
    const light = new THREE.PointLight(0xffd27a, 0, 4);
    light.position.set(x, 1.7, z);
    this.group.add(post, bulb, halo, this.night.addLight(light, 0, 1.4));
    collisionSystem.addBox(x - 0.12, x + 0.12, z - 0.12, z + 0.12);
  }

  private buildGameStation(): void {
    const g = new THREE.Group();
    g.position.set(-2.2, 0, 1.5);
    g.rotation.y = 0.6;
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.8, 16), new THREE.MeshLambertMaterial({ color: 0x3a2a4e }));
    pedestal.position.y = 0.4;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 24), new THREE.MeshLambertMaterial({ color: 0xffe9a3 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.81;
    this.gameButton = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.24, 0.12, 24),
      new THREE.MeshLambertMaterial({ color: 0xff5577, emissive: 0xff2255, emissiveIntensity: 0.4 })
    );
    this.gameButton.position.y = 0.86;
    const sign = makeSign('BUG BASH', { emoji: '🐞', subtitle: 'Mini game · 30 s', width: 1.2, bg: '#281D35', fg: '#FFE9A3' });
    sign.position.set(0, 1.6, 0);
    g.add(pedestal, rim, this.gameButton, sign);
    this.group.add(g);
    collisionSystem.addBox(-2.6, -1.8, 1.1, 1.9);
    clickSystem.register(g, '🐞 Play Bug Bash', () => this.startGame());
  }

  private startGame(): void {
    if (this.game.running) return;
    audioManager.playCoin();
    this.game.showIntro();
  }

  private async loadGLBModels(): Promise<void> {
    const mailboxGltf = await assetLoader.loadGLTF('mailbox');
    if (mailboxGltf) {
      mailboxGltf.position.set(1.8, 0, 1.9);
      // The model's door faces +Z; turn it toward the arrival point and camera (-Z side)
      mailboxGltf.rotation.y = -2.6;
      mailboxGltf.scale.set(1.1, 1.1, 1.1);
      this.group.add(mailboxGltf);
    } else {
      // Fallback mailbox
      const mailboxGroup = new THREE.Group();
      mailboxGroup.position.set(1.8, 0, 1.9);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9), new THREE.MeshLambertMaterial({ color: 0xBA9378 }));
      post.position.y = 0.45;
      const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.6), new THREE.MeshLambertMaterial({ color: 0xFFB3C7 }));
      boxMesh.position.y = 0.95;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.08), new THREE.MeshLambertMaterial({ color: 0xFFE9A3 }));
      flag.position.set(0.24, 1.05, 0.15);
      mailboxGroup.add(post, boxMesh, flag);
      this.group.add(mailboxGroup);
    }
  }

  private createLayeredTree(foliageColor: number): THREE.Group {
    const tree = new THREE.Group();
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8A5A4A });
    const leafMat = new THREE.MeshLambertMaterial({ color: foliageColor });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.0, 12), trunkMat);
    trunk.position.y = 0.5;
    tree.add(trunk);

    // 3 tiered pancake/cone foliage
    for (let i = 0; i < 3; i++) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(1.2 - i * 0.25, 0.7, 12), leafMat);
      tier.position.y = 1.0 + i * 0.45;
      tree.add(tier);
    }
    return tree;
  }

  private createFloatingSkyElements(): void {
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xFFFDF8, transparent: true, opacity: 0.85 });
    const starMat = new THREE.MeshBasicMaterial({ color: 0xFFE9A3 });

    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Group();
      const angle = (i / 6) * Math.PI * 2;
      const dist = 7.5 + Math.random() * 2;
      cloud.position.set(Math.cos(angle) * dist, -0.5 + Math.random() * 1.5, Math.sin(angle) * dist);

      // Cloud lumps
      for (let j = 0; j < 4; j++) {
        const lump = new THREE.Mesh(new THREE.SphereGeometry(0.8 + Math.random() * 0.4, 12, 12), cloudMat);
        lump.position.set((j - 1.5) * 0.7, 0, (Math.random() - 0.5) * 0.4);
        cloud.add(lump);
      }
      this.group.add(cloud);
      this.clouds.push(cloud);
    }

    // Floating stars
    for (let i = 0; i < 10; i++) {
      const star = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), starMat);
      star.position.set(
        (Math.random() - 0.5) * 10,
        1.0 + Math.random() * 3.0,
        (Math.random() - 0.5) * 10
      );
      this.group.add(star);
      this.floatingStars.push(star);
    }
  }

  private setupInteractions(): void {
    // 1. Mailbox in Dev Realm!
    interactionSystem.register({
      id: 'mailbox',
      label: 'Write a Letter (Contact) 📬',
      keyHint: 'E',
      radius: 2.0,
      position: new THREE.Vector3(1.8, 0.8, 1.9),
      onInteract: () => {
        store.set('activeOverlay', 'contact');
        eventBus.emit('overlay:open', 'contact');
      }
    });

    interactionSystem.register({
      id: 'bug_bash',
      label: 'Play Bug Bash 🐞 (mini game)',
      keyHint: 'E',
      radius: 1.6,
      position: new THREE.Vector3(-2.2, 0.6, 1.5),
      onInteract: () => this.startGame()
    });

    registerSeat({ id: 'seat_log', label: 'Sit on the log 🪵', position: new THREE.Vector3(-2.85, 0, -0.75), yaw: 0.0, height: 0.4, radius: 1.0 });

    // 2. Return Portal to Bedroom
    interactionSystem.register({
      id: 'wardrobe_return',
      label: 'Return to Bedroom 🚪',
      keyHint: 'E',
      radius: 2.0,
      position: new THREE.Vector3(0, 1.0, 2.8),
      onInteract: () => {
        sparkleSystem.burst(new THREE.Vector3(0, 1.5, 2.8), 24);
        audioManager.playPortal();
        eventBus.emit('room:switch', 'bedroom');
      }
    });
  }

  update(delta: number): void {
    const t = performance.now() * 0.001;
    this.portal?.update(delta);
    this.fireflies?.update(delta);
    this.night.update();
    this.game.update(delta);
    if (this.gameButton) this.gameButton.position.y = 0.86 + (this.game.running ? -0.04 : Math.sin(t * 4) * 0.015);

    // Orbit clouds gently
    this.clouds.forEach((cloud, i) => {
      cloud.position.y += Math.sin(t * 0.8 + i) * 0.002;
    });

    // Bobbing stars
    this.floatingStars.forEach((star, i) => {
      star.position.y += Math.sin(t * 2.0 + i) * 0.004;
    });
  }

  dispose(): void {
    this.game.dispose();
    interactionSystem.clear();
    this.portal = null;
    this.clouds = [];
    this.floatingStars = [];
    this.group.clear();
  }
}
