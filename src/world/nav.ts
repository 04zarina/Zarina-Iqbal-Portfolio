import * as THREE from 'three';
import { collisionSystem } from './collision';

/**
 * Tiny grid path-finder over the collision boxes, so the avatar can walk on her own
 * (room travel, click-to-walk) without clipping through furniture.
 * The grid is rebuilt lazily whenever the room's obstacles change.
 */
const CELL = 0.2;
const RADIUS = 0.42;

class NavGrid {
  private cols = 0;
  private rows = 0;
  private minX = 0;
  private minZ = 0;
  private blocked: Uint8Array = new Uint8Array(0);
  private signature = '';

  private rebuildIfNeeded(): void {
    const b = collisionSystem.roomBounds;
    const sig = `${b.minX},${b.maxX},${b.minZ},${b.maxZ}|${collisionSystem.obstacles.length}|${collisionSystem.obstacles.map((o) => o.minX + o.maxZ).join(',')}`;
    if (sig === this.signature) return;
    this.signature = sig;
    this.minX = b.minX;
    this.minZ = b.minZ;
    this.cols = Math.max(1, Math.ceil((b.maxX - b.minX) / CELL));
    this.rows = Math.max(1, Math.ceil((b.maxZ - b.minZ) / CELL));
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.minX + (c + 0.5) * CELL;
        const z = this.minZ + (r + 0.5) * CELL;
        let bad = x < b.minX + RADIUS || x > b.maxX - RADIUS || z < b.minZ + RADIUS || z > b.maxZ - RADIUS;
        if (!bad) {
          for (const o of collisionSystem.obstacles) {
            const dx = Math.max(o.minX - x, 0, x - o.maxX);
            const dz = Math.max(o.minZ - z, 0, z - o.maxZ);
            if (dx * dx + dz * dz < RADIUS * RADIUS) {
              bad = true;
              break;
            }
          }
        }
        this.blocked[r * this.cols + c] = bad ? 1 : 0;
      }
    }
  }

  private cellOf(p: THREE.Vector3): [number, number] {
    return [
      THREE.MathUtils.clamp(Math.floor((p.x - this.minX) / CELL), 0, this.cols - 1),
      THREE.MathUtils.clamp(Math.floor((p.z - this.minZ) / CELL), 0, this.rows - 1)
    ];
  }

  private center(c: number, r: number): THREE.Vector3 {
    return new THREE.Vector3(this.minX + (c + 0.5) * CELL, 0, this.minZ + (r + 0.5) * CELL);
  }

  /** Nearest walkable cell to a point (spiral search). */
  private nearestFree(c: number, r: number): [number, number] | null {
    if (!this.blocked[r * this.cols + c]) return [c, r];
    for (let rad = 1; rad < 20; rad++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const cc = c + dc;
          const rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= this.cols || rr >= this.rows || this.blocked[rr * this.cols + cc]) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) {
            bestD = d;
            best = [cc, rr];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Returns true if the target point is reachable floor (not inside furniture). */
  isWalkable(p: THREE.Vector3): boolean {
    this.rebuildIfNeeded();
    const [c, r] = this.cellOf(p);
    return !this.blocked[r * this.cols + c];
  }

  private lineClear(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const steps = Math.ceil(a.distanceTo(b) / (CELL * 0.5));
    const p = new THREE.Vector3();
    for (let i = 0; i <= steps; i++) {
      p.lerpVectors(a, b, i / Math.max(1, steps));
      const [c, r] = this.cellOf(p);
      if (this.blocked[r * this.cols + c]) return false;
    }
    return true;
  }

  /** A* from `from` to `to`; returns smoothed waypoints (excluding the start), or null. */
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    this.rebuildIfNeeded();
    const s0 = this.cellOf(from);
    const s = this.nearestFree(s0[0], s0[1]);
    const g0 = this.cellOf(to);
    const g = this.nearestFree(g0[0], g0[1]);
    if (!s || !g) return null;
    const N = this.cols * this.rows;
    const start = s[1] * this.cols + s[0];
    const goal = g[1] * this.cols + g[0];
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [start];
    const f = new Float32Array(N).fill(Infinity);
    gScore[start] = 0;
    const h = (i: number) => Math.hypot((i % this.cols) - g[0], Math.floor(i / this.cols) - g[1]);
    f[start] = h(start);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let iter = 0;
    while (open.length && iter++ < 20000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = Math.floor(cur / this.cols);
      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const ni = nr * this.cols + nc;
        if (this.blocked[ni] || closed[ni]) continue;
        // no corner cutting
        if (dc && dr && (this.blocked[cr * this.cols + nc] || this.blocked[nr * this.cols + cc])) continue;
        const ng = gScore[cur] + cost;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          f[ni] = ng + h(ni);
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const cells: THREE.Vector3[] = [];
    for (let i = goal; i !== -1; i = came[i]) cells.push(this.center(i % this.cols, Math.floor(i / this.cols)));
    cells.reverse();
    // Exact goal if it's free
    if (this.isWalkable(to)) cells[cells.length - 1] = to.clone().setY(0);
    // String-pulling: keep only the waypoints needed for line of sight
    const out: THREE.Vector3[] = [];
    let anchor = from.clone().setY(0);
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineClear(anchor, cells[j])) j--;
      out.push(cells[j]);
      anchor = cells[j];
      i = j + 1;
    }
    return out;
  }
}

export const navGrid = new NavGrid();
