import * as THREE from 'three';

export interface CollisionBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class CollisionSystem {
  public obstacles: CollisionBox[] = [];
  public roomBounds: CollisionBox = { minX: -4.6, maxX: 4.6, minZ: -3.6, maxZ: 3.6 };

  clear(): void {
    this.obstacles = [];
  }

  setBounds(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.roomBounds = { minX, maxX, minZ, maxZ };
  }

  addBox(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.obstacles.push({ minX, maxX, minZ, maxZ });
  }

  addObstacleFromMesh(mesh: THREE.Mesh): void {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box) return;

    const min = box.min.clone().applyMatrix4(mesh.matrixWorld);
    const max = box.max.clone().applyMatrix4(mesh.matrixWorld);

    this.obstacles.push({
      minX: Math.min(min.x, max.x),
      maxX: Math.max(min.x, max.x),
      minZ: Math.min(min.z, max.z),
      maxZ: Math.max(min.z, max.z)
    });
  }

  resolve(position: THREE.Vector3, radius: number = 0.38): THREE.Vector3 {
    const pos = position.clone();

    // 2-pass resolution to ensure obstacle pushes never breach room bounds
    for (let pass = 0; pass < 2; pass++) {
      // 1. Resolve against obstacles (Circle vs AABB)
      for (const ob of this.obstacles) {
        const closestX = THREE.MathUtils.clamp(pos.x, ob.minX, ob.maxX);
        const closestZ = THREE.MathUtils.clamp(pos.z, ob.minZ, ob.maxZ);

        const dx = pos.x - closestX;
        const dz = pos.z - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const overlap = radius - dist;
            pos.x += (dx / dist) * overlap;
            pos.z += (dz / dist) * overlap;
          } else {
            // Stuck inside box: push out along shortest axis
            const left = Math.abs(pos.x - ob.minX);
            const right = Math.abs(ob.maxX - pos.x);
            const front = Math.abs(pos.z - ob.minZ);
            const back = Math.abs(ob.maxZ - pos.z);
            const minD = Math.min(left, right, front, back);

            if (minD === left) pos.x = ob.minX - radius;
            else if (minD === right) pos.x = ob.maxX + radius;
            else if (minD === front) pos.z = ob.minZ - radius;
            else pos.z = ob.maxZ + radius;
          }
        }
      }

      // 2. Clamp strictly to room bounds
      pos.x = THREE.MathUtils.clamp(pos.x, this.roomBounds.minX + radius, this.roomBounds.maxX - radius);
      pos.z = THREE.MathUtils.clamp(pos.z, this.roomBounds.minZ + radius, this.roomBounds.maxZ - radius);
    }

    return pos;
  }
}

export const collisionSystem = new CollisionSystem();
