import * as THREE from 'three';
import { themeManager } from './theme';

/* -------------------------------------------------------------------------- */
/* Canvas helpers                                                              */
/* -------------------------------------------------------------------------- */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Rounded sign with an emoji, a title and an optional subtitle. Width in metres. */
export function makeSign(title: string, opts: { emoji?: string; subtitle?: string; bg?: string; fg?: string; width?: number } = {}): THREE.Mesh {
  const W = 640;
  const H = opts.subtitle ? 220 : 170;
  const tex = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = 'rgba(90,58,50,0.35)';
    ctx.beginPath();
    ctx.roundRect(10, 14, W - 16, H - 18, 46);
    ctx.fill();
    ctx.fillStyle = opts.bg || '#FFF6EC';
    ctx.beginPath();
    ctx.roundRect(6, 6, W - 16, H - 18, 46);
    ctx.fill();
    ctx.strokeStyle = '#5A3A32';
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.fillStyle = opts.fg || '#5A3A32';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 74;
    ctx.font = `bold ${size}px Fredoka, "Baloo 2", sans-serif`;
    const text = `${opts.emoji ? opts.emoji + ' ' : ''}${title}`;
    while (ctx.measureText(text).width > W - 80 && size > 30) {
      size -= 2;
      ctx.font = `bold ${size}px Fredoka, "Baloo 2", sans-serif`;
    }
    ctx.fillText(text, W / 2 - 4, opts.subtitle ? 78 : H / 2 - 4);
    if (opts.subtitle) {
      ctx.font = `600 38px Nunito, sans-serif`;
      ctx.globalAlpha = 0.85;
      ctx.fillText(opts.subtitle, W / 2 - 4, 158);
    }
  });
  const width = opts.width ?? 1.1;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, (width * H) / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
}

/* -------------------------------------------------------------------------- */
/* Doors                                                                       */
/* -------------------------------------------------------------------------- */

export type DoorStyle = 'arcade' | 'garden' | 'study' | 'home' | 'realm';

const DOOR_LOOK: Record<DoorStyle, { panel: number; trim: number; glow: number; emblem: string }> = {
  arcade: { panel: 0x6b4fa0, trim: 0xffe9a3, glow: 0xff7ac8, emblem: '🕹️' },
  garden: { panel: 0x7fbf8e, trim: 0xfff6ec, glow: 0xc8ffd9, emblem: '🌿' },
  study: { panel: 0xa97a5a, trim: 0xffe9a3, glow: 0xffe2a8, emblem: '📚' },
  home: { panel: 0xf2a7b8, trim: 0xfff6ec, glow: 0xffd7b5, emblem: '🏠' },
  realm: { panel: 0x5b5fb8, trim: 0xd9c8ff, glow: 0xb9a8ff, emblem: '☁️' }
};

export interface Door {
  group: THREE.Group;
  /** World position of the doorway centre on the floor (for proximity). */
  anchor: THREE.Vector3;
  update(delta: number, avatarPos: THREE.Vector3 | null): void;
  /** Swing the door open (used when the avatar walks through). */
  open(): void;
}

/**
 * A themed, labelled door. Built facing +Z (the room side); rotate the group to put it on a wall.
 * The panel swings open when the avatar comes close, showing a warm glow from the room beyond.
 */
export function makeDoor(style: DoorStyle, title: string, subtitle?: string): Door {
  const look = DOOR_LOOK[style];
  const group = new THREE.Group();
  const W = 1.1;
  const H = 2.15;
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x8a5a4a });
  const trimMat = new THREE.MeshLambertMaterial({ color: look.trim });

  // Frame (two jambs + lintel), a little proud of the wall
  const jambGeo = new THREE.BoxGeometry(0.14, H + 0.12, 0.2);
  const jL = new THREE.Mesh(jambGeo, frameMat);
  jL.position.set(-W / 2 - 0.07, (H + 0.12) / 2, 0.06);
  const jR = jL.clone();
  jR.position.x = W / 2 + 0.07;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(W + 0.42, 0.2, 0.24), frameMat);
  lintel.position.set(0, H + 0.14, 0.06);
  const step = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.04, 0.4), trimMat);
  step.position.set(0, 0.02, 0.2);
  group.add(jL, jR, lintel, step);

  // A painted peek into the room beyond, seen when the door swings open. It sits just in
  // front of the wall surface (walls are solid), so it is never hidden by the wall.
  const peek = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: peekTexture(style) }));
  peek.position.set(0, H / 2, 0.004);
  peek.userData.noFade = true;
  group.add(peek);

  // Door panel on a hinge at the left jamb
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, 0, 0.045);
  const panelTex = canvasTexture(256, 500, (ctx) => {
    const col = '#' + new THREE.Color(look.panel).getHexString();
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, 256, 500);
    // Recessed panels
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(36, 200, 184, 120, 14);
    ctx.roundRect(36, 345, 184, 120, 14);
    ctx.stroke();
    // Arched window
    ctx.fillStyle = '#FFF6D6';
    ctx.beginPath();
    ctx.moveTo(48, 170);
    ctx.lineTo(48, 100);
    ctx.arc(128, 100, 80, Math.PI, 0);
    ctx.lineTo(208, 170);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#' + new THREE.Color(look.trim).getHexString();
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128, 22);
    ctx.lineTo(128, 170);
    ctx.moveTo(48, 110);
    ctx.lineTo(208, 110);
    ctx.lineWidth = 6;
    ctx.stroke();
    // Emblem
    ctx.font = '84px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(look.emblem, 128, 262);
    if (style === 'arcade') {
      ctx.strokeStyle = '#FF7AC8';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, 236, 480);
    }
  });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.07), [
    new THREE.MeshLambertMaterial({ color: look.panel }),
    new THREE.MeshLambertMaterial({ color: look.panel }),
    new THREE.MeshLambertMaterial({ color: look.panel }),
    new THREE.MeshLambertMaterial({ color: look.panel }),
    new THREE.MeshLambertMaterial({ map: panelTex }),
    new THREE.MeshLambertMaterial({ color: look.panel })
  ]);
  panel.position.set(W / 2, H / 2, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.7, roughness: 0.3 }));
  knob.position.set(W - 0.14, 1.0, 0.07);
  hinge.add(panel, knob);
  group.add(hinge);

  // Title sign mounted flush on the lintel (no gap above the door)
  const signW = 1.3;
  const sign = makeSign(title, style === 'arcade' ? { subtitle, width: signW, bg: '#281D35', fg: '#FFE9A3' } : { subtitle, width: signW, bg: '#FFF6EC' });
  const signH = (signW * (subtitle ? 220 : 170)) / 640;
  const signY = H + 0.24 + signH / 2 - 0.05;
  sign.position.set(0, signY, 0.19);
  group.add(sign);
  // Wooden backing plate so the sign reads as one piece with the frame
  const plate = new THREE.Mesh(new THREE.BoxGeometry(signW + 0.06, signH - 0.02, 0.04), frameMat);
  plate.position.set(0, signY - 0.005, 0.15);
  group.add(plate);

  // Style decorations
  if (style === 'garden') {
    const leaf = new THREE.MeshLambertMaterial({ color: 0x76b885 });
    const flower = new THREE.MeshLambertMaterial({ color: 0xffb3c7 });
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const x = t < 0.33 ? -W / 2 - 0.12 : t > 0.66 ? W / 2 + 0.12 : -W / 2 + ((t - 0.33) / 0.33) * W;
      const y = t < 0.33 ? (t / 0.33) * H : t > 0.66 ? ((1 - t) / 0.34) * H : H + 0.22;
      const m = new THREE.Mesh(new THREE.SphereGeometry(i % 4 === 0 ? 0.06 : 0.09, 8, 6), i % 4 === 0 ? flower : leaf);
      m.scale.set(1, 0.7, 0.6);
      m.position.set(x, y, 0.17);
      group.add(m);
    }
  } else if (style === 'arcade') {
    // Neon tube frame hugging the sign, plus marquee bulbs along the lintel
    const neonMat = new THREE.MeshBasicMaterial({ color: 0xff7ac8 });
    const tw = signW - 0.06;
    const th = signH - 0.1;
    const tubes: [number, number, number, number][] = [
      [0, signY + th / 2, tw, 0.025],
      [0, signY - th / 2, tw, 0.025],
      [-tw / 2, signY, 0.025, th],
      [tw / 2, signY, 0.025, th]
    ];
    tubes.forEach(([x, y, w, h]) => {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.025), neonMat);
      tube.position.set(x, y, 0.2);
      tube.name = 'neon';
      group.add(tube);
    });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a3 });
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), bulbMat);
      b.position.set(-W / 2 - 0.05 + (i / 6) * (W + 0.1), H + 0.14, 0.19);
      group.add(b);
    }
  } else if (style === 'study') {
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), lampMat);
    lamp.position.set(W / 2 + 0.25, H - 0.2, 0.22);
    lamp.name = 'lamp';
    group.add(lamp);
  }

  let openAmt = 0;
  let forceOpen = 0;
  const anchor = new THREE.Vector3();
  return {
    group,
    anchor,
    open: () => (forceOpen = 1.6),
    update(delta: number, avatarPos: THREE.Vector3 | null) {
      group.getWorldPosition(anchor);
      const near = avatarPos ? Math.hypot(avatarPos.x - anchor.x, avatarPos.z - anchor.z) < 1.7 : false;
      forceOpen = Math.max(0, forceOpen - delta);
      const target = near || forceOpen > 0 ? 1 : 0;
      openAmt += (target - openAmt) * (1 - Math.exp(-delta * 6));
      hinge.rotation.y = -openAmt * 1.25;
      const neon = group.getObjectByName('neon') as THREE.Mesh | undefined; // tubes share one material
      if (neon) (neon.material as THREE.MeshBasicMaterial).color.setHSL(0.88 + Math.sin(performance.now() * 0.002) * 0.04, 1, 0.6 + themeManager.themeProgress * 0.1);
    }
  };
}

/**
 * A one-point-perspective painting of the room behind a door (walls, floor and a few
 * signature props), so an open door shows the next room instead of a flat colour.
 * Cached per style; one 256x512 canvas each.
 */
const peekCache = new Map<DoorStyle, THREE.CanvasTexture>();
function peekTexture(style: DoorStyle): THREE.CanvasTexture {
  const cached = peekCache.get(style);
  if (cached) return cached;
  const P: Record<DoorStyle, { wall: string; side: string; floor: string; floor2: string; ceil: string }> = {
    arcade: { wall: '#3B2A56', side: '#2E2142', floor: '#FFC9B0', floor2: '#FFF6EC', ceil: '#241933' },
    garden: { wall: '#CFE9FF', side: '#B8DDF7', floor: '#D8C3A5', floor2: '#C9B08E', ceil: '#E8F6FF' },
    study: { wall: '#FFE2C4', side: '#F2CBA5', floor: '#C99A6B', floor2: '#B98A5B', ceil: '#F7D9B8' },
    home: { wall: '#FFC9B0', side: '#F2B39B', floor: '#EED6BA', floor2: '#E2C6A6', ceil: '#F7BFA6' },
    realm: { wall: '#B9A8FF', side: '#A48FF0', floor: '#BDEBD3', floor2: '#A8DDC0', ceil: '#D9C8FF' }
  };
  const c = P[style];
  const tex = canvasTexture(256, 512, (ctx) => {
    const L = 52, R = 204, T = 150, B = 372; // back wall rectangle
    const quad = (pts: number[][], fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach((p) => ctx.lineTo(p[0], p[1]));
      ctx.closePath();
      ctx.fill();
    };
    quad([[0, 0], [256, 0], [R, T], [L, T]], c.ceil);
    quad([[0, 0], [L, T], [L, B], [0, 512]], c.side);
    quad([[256, 0], [R, T], [R, B], [256, 512]], c.side);
    quad([[L, T], [R, T], [R, B], [L, B]], c.wall);
    // Floor with receding stripes / tiles
    quad([[0, 512], [256, 512], [R, B], [L, B]], c.floor);
    ctx.strokeStyle = c.floor2;
    ctx.lineWidth = 3;
    for (let i = 1; i < 8; i++) {
      const t = Math.pow(i / 8, 1.6);
      const y = B + (512 - B) * t;
      const xl = L - L * t;
      const xr = R + (256 - R) * t;
      ctx.beginPath();
      ctx.moveTo(xl, y);
      ctx.lineTo(xr, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(L + ((R - L) * i) / 6, B);
      ctx.lineTo((256 * i) / 6, 512);
      ctx.stroke();
    }
    const glow = (x: number, y: number, r: number, col: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (style === 'arcade') {
      ctx.fillStyle = '#FF7AC8';
      ctx.fillRect(L, T + 10, R - L, 5);
      [70, 110, 150].forEach((x, i) => {
        ctx.fillStyle = ['#FFE9A3', '#BDE0FF', '#BDEBD3'][i];
        ctx.fillRect(x, 262, 34, 110);
        ctx.fillStyle = '#1D1328';
        ctx.fillRect(x + 5, 272, 24, 28);
        glow(x + 17, 286, 30, 'rgba(255,122,200,0.55)');
      });
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFB3E1';
      ctx.fillText('★ PLAY ★', 128, 215);
    } else if (style === 'garden') {
      ctx.strokeStyle = '#FFFDF8';
      ctx.lineWidth = 5;
      for (let x = L; x <= R; x += 38) {
        ctx.beginPath();
        ctx.moveTo(x, T);
        ctx.lineTo(x, B);
        ctx.stroke();
      }
      [[70, 340], [128, 330], [186, 340]].forEach(([x, y]) => {
        ctx.fillStyle = '#A97A5A';
        ctx.fillRect(x - 26, y, 52, 26);
        ctx.fillStyle = '#76B885';
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.ellipse(x - 15 + k * 10, y - 12, 9, 18, (k - 1.5) * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#FFB3C7';
        ctx.beginPath();
        ctx.arc(x, y - 24, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      glow(128, 160, 90, 'rgba(255,255,220,0.6)');
    } else if (style === 'study') {
      [[58, 200], [150, 200]].forEach(([x, y]) => {
        ctx.fillStyle = '#8A5A4A';
        ctx.fillRect(x, y, 48, 172);
        for (let shelf = 0; shelf < 4; shelf++) {
          for (let b = 0; b < 5; b++) {
            ctx.fillStyle = ['#FFB3C7', '#BDE0FF', '#FFE9A3', '#BDEBD3', '#D9C8FF'][(b + shelf) % 5];
            ctx.fillRect(x + 4 + b * 8.5, y + 8 + shelf * 42, 7, 32);
          }
        }
      });
      glow(128, 250, 50, 'rgba(255,226,168,0.8)');
      ctx.fillStyle = '#FFE2A8';
      ctx.beginPath();
      ctx.arc(128, 250, 10, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === 'home') {
      ctx.fillStyle = '#BDE0FF';
      ctx.fillRect(90, 190, 76, 60);
      ctx.strokeStyle = '#8A5A4A';
      ctx.lineWidth = 5;
      ctx.strokeRect(90, 190, 76, 60);
      ctx.beginPath();
      ctx.moveTo(128, 190);
      ctx.lineTo(128, 250);
      ctx.stroke();
      ctx.fillStyle = '#8A5A4A';
      ctx.fillRect(62, 318, 90, 54);
      ctx.fillStyle = '#5FA39A';
      ctx.fillRect(66, 306, 82, 24);
      ctx.fillStyle = '#FFF6EC';
      ctx.fillRect(70, 298, 26, 12);
      ['#FFD27A', '#FFA8C8', '#A8E6FF', '#C8FFB0'].forEach((col, i) => {
        for (let k = i; k < 12; k += 4) glow(L + 8 + k * 12.5, T + 14 + Math.sin(k * 0.6) * 4, 9, col);
      });
    } else {
      glow(128, 260, 80, 'rgba(255,255,255,0.7)');
    }
    // Soft vignette so it reads as "further away"
    const v = ctx.createRadialGradient(128, 280, 60, 128, 280, 300);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(40,24,30,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 256, 512);
  });
  peekCache.set(style, tex);
  return tex;
}

/* -------------------------------------------------------------------------- */
/* Rugs                                                                        */
/* -------------------------------------------------------------------------- */

export function makeRug(opts: { shape: 'round' | 'rect'; w: number; d?: number; colors: string[]; pattern: 'rings' | 'stripes' | 'checker' | 'diamond' }): THREE.Mesh {
  const S = 512;
  const tex = canvasTexture(S, opts.shape === 'rect' ? Math.round((S * (opts.d ?? opts.w)) / opts.w) : S, (ctx) => {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const [a, b, c] = [opts.colors[0], opts.colors[1] || '#FFF6EC', opts.colors[2] || opts.colors[0]];
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    if (opts.pattern === 'rings') {
      for (let r = w / 2; r > 10; r -= 38) {
        ctx.strokeStyle = (r / 38) % 2 < 1 ? b : c;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, r - 20, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (opts.pattern === 'stripes') {
      for (let y = 30; y < h - 20; y += 46) {
        ctx.fillStyle = (y / 46) % 2 < 1 ? b : c;
        ctx.fillRect(24, y, w - 48, 20);
      }
    } else if (opts.pattern === 'checker') {
      const n = 8;
      for (let i = 0; i < n; i++) for (let j = 0; j < Math.round((n * h) / w); j++) {
        if ((i + j) % 2) {
          ctx.fillStyle = b;
          ctx.fillRect((i * w) / n, (j * w) / n, w / n, w / n);
        }
      }
    } else {
      ctx.fillStyle = b;
      for (let x = 0; x < w; x += 64) for (let y = 0; y < h; y += 64) {
        ctx.beginPath();
        ctx.moveTo(x + 32, y + 8);
        ctx.lineTo(x + 56, y + 32);
        ctx.lineTo(x + 32, y + 56);
        ctx.lineTo(x + 8, y + 32);
        ctx.fill();
      }
    }
    // Border
    ctx.strokeStyle = c;
    ctx.lineWidth = 18;
    if (opts.shape === 'round') {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 12, 0, Math.PI * 2);
      ctx.stroke();
    } else ctx.strokeRect(12, 12, w - 24, h - 24);
  });
  const geo = opts.shape === 'round' ? new THREE.CircleGeometry(opts.w / 2, 48) : new THREE.PlaneGeometry(opts.w, opts.d ?? opts.w);
  const rug = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.012;
  rug.renderOrder = -1;
  return rug;
}

/* -------------------------------------------------------------------------- */
/* Swirl portal                                                                */
/* -------------------------------------------------------------------------- */

export interface Portal {
  group: THREE.Group;
  update(delta: number): void;
}

/** A swirling magic portal surface (rounded-rect), with rising sparkles. Faces +Z. */
export function makePortal(width: number, height: number, colorA = 0xb18cff, colorB = 0xffb3e1): Portal {
  const group = new THREE.Group();
  const uniforms = {
    uTime: { value: 0 },
    uA: { value: new THREE.Color(colorA) },
    uB: { value: new THREE.Color(colorB) },
    uAspect: { value: width / height }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uAspect;
      varying vec2 vUv;
      float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
      void main(){
        vec2 p = vUv - 0.5; p.x *= uAspect;
        float r = length(p);
        float a = atan(p.y, p.x);
        float swirl = sin(a * 3.0 + r * 18.0 - uTime * 3.0) * 0.5 + 0.5;
        float swirl2 = sin(a * 5.0 - r * 26.0 + uTime * 2.0) * 0.5 + 0.5;
        vec3 col = mix(uA, uB, swirl);
        col = mix(col, vec3(1.0), smoothstep(0.75, 1.0, swirl2) * 0.35);
        col += vec3(1.0, 0.95, 1.0) * smoothstep(0.22, 0.0, r) * 0.8;
        float d = sdRound(vUv - 0.5, vec2(0.5, 0.5), 0.18);
        float edge = smoothstep(0.0, -0.06, d);
        float rim = smoothstep(-0.07, -0.02, d) * edge;
        col += rim * vec3(1.0, 0.9, 1.0) * 0.6;
        gl_FragColor = vec4(col, edge * 0.92);
      }`
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  group.add(surface);

  // Rising sparkles in front of the portal
  const N = 40;
  const pos = new Float32Array(N * 3);
  const seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * width;
    pos[i * 3 + 1] = Math.random() * height - height / 2;
    pos[i * 3 + 2] = 0.05 + Math.random() * 0.25;
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparkles = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  group.add(sparkles);

  const light = new THREE.PointLight(colorA, 1.2, 4);
  light.position.set(0, 0, 0.6);
  group.add(light);

  return {
    group,
    update(delta: number) {
      uniforms.uTime.value += delta;
      const arr = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i * 3 + 1] += delta * (0.25 + seeds[i] * 0.4);
        arr[i * 3] += Math.sin(uniforms.uTime.value * 2 + seeds[i] * 10) * delta * 0.05;
        if (arr[i * 3 + 1] > height / 2) arr[i * 3 + 1] = -height / 2;
      }
      geo.attributes.position.needsUpdate = true;
      light.intensity = 1.0 + Math.sin(uniforms.uTime.value * 2.5) * 0.3;
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Fireflies                                                                   */
/* -------------------------------------------------------------------------- */

export interface Fireflies {
  points: THREE.Points;
  update(delta: number): void;
}

/** Soft blinking fireflies wandering inside a box. Brighter at night. */
export function makeFireflies(count: number, box: THREE.Box3, color = 0xfff3a0, dayVisibility = 0.35): Fireflies {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const size = box.getSize(new THREE.Vector3());
  for (let i = 0; i < count; i++) {
    pos[i * 3] = box.min.x + Math.random() * size.x;
    pos[i * 3 + 1] = box.min.y + Math.random() * size.y;
    pos[i * 3 + 2] = box.min.z + Math.random() * size.z;
    seed[i] = Math.random() * 100;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uNight: { value: 1 }, uPx: { value: Math.min(window.devicePixelRatio, 2) } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uPx; attribute float aSeed; varying float vBlink;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.6 + aSeed) * 0.35;
        p.y += sin(uTime * 0.9 + aSeed * 1.7) * 0.25;
        p.z += cos(uTime * 0.5 + aSeed * 0.8) * 0.35;
        vBlink = pow(0.5 + 0.5 * sin(uTime * 2.2 + aSeed * 3.1), 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (26.0 * uPx) / -mv.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uNight; varying float vBlink;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a * (0.25 + vBlink * 0.75) * uNight;
        gl_FragColor = vec4(uColor * (1.0 + smoothstep(0.15, 0.0, d)), a);
      }`
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    update(delta: number) {
      uniforms.uTime.value += delta;
      uniforms.uNight.value = THREE.MathUtils.lerp(dayVisibility, 1, themeManager.themeProgress);
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Night lights                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Lights and glowing bulbs that wake up in Dusk mode. Each room adds its own
 * (fairy lights, lanterns, neon) and calls update() every frame.
 */
export class NightLights {
  private lights: { light: THREE.Light; day: number; night: number }[] = [];
  private glows: { mat: THREE.MeshBasicMaterial; day: THREE.Color; night: THREE.Color }[] = [];

  addLight(light: THREE.Light, day: number, night: number): THREE.Light {
    this.lights.push({ light, day, night });
    return light;
  }

  /** A small glowing bulb mesh whose colour brightens at night. */
  bulb(color: number, radius = 0.05): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({ color });
    const night = new THREE.Color(color);
    const day = night.clone().lerp(new THREE.Color(0xffffff), 0.1).multiplyScalar(0.75);
    this.glows.push({ mat, day, night });
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), mat);
  }

  /** Soft additive halo sprite around a bulb (only visible at night). */
  halo(color: number, size = 0.5): THREE.Sprite {
    const tex = canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    });
    const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    s.userData.halo = true;
    this.halos.push(s);
    return s;
  }
  private halos: THREE.Sprite[] = [];

  update(): void {
    const p = themeManager.themeProgress;
    this.lights.forEach((l) => (l.light.intensity = THREE.MathUtils.lerp(l.day, l.night, p)));
    this.glows.forEach((g) => g.mat.color.copy(g.day).lerp(g.night, p));
    const t = performance.now() * 0.003;
    this.halos.forEach((h, i) => {
      if (!h.userData.manual) (h.material as THREE.SpriteMaterial).opacity = p * (0.55 + Math.sin(t + i * 0.7) * 0.15);
    });
  }
}
