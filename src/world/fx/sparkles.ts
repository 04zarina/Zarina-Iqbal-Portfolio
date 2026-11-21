import * as THREE from 'three';
import { qualityManager } from '../../core/quality';

export class SparkleSystem {
  public group: THREE.Group = new THREE.Group();
  private particles: {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    baseScale: number;
  }[] = [];

  private texture: THREE.Texture;
  private material: THREE.MeshBasicMaterial;
  private geometry: THREE.PlaneGeometry;

  constructor() {
    this.texture = this.createStarTexture();
    this.geometry = new THREE.PlaneGeometry(0.2, 0.2);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  private createStarTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Draw 4-point soft star
    ctx.fillStyle = '#FFE9A3'; // Butter yellow
    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.quadraticCurveTo(32, 32, 60, 32);
    ctx.quadraticCurveTo(32, 32, 32, 60);
    ctx.quadraticCurveTo(32, 32, 4, 32);
    ctx.quadraticCurveTo(32, 32, 32, 4);
    ctx.fill();

    // Soft highlight in center
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(32, 32, 4, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  burst(origin: THREE.Vector3, count: number = 18): void {
    const maxAllowed = qualityManager.config.sparkleCount;
    const actualCount = Math.min(count, Math.max(4, Math.floor(maxAllowed / 4)));

    for (let i = 0; i < actualCount; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.material.clone());
      mesh.position.copy(origin);
      mesh.position.x += (Math.random() - 0.5) * 0.4;
      mesh.position.y += (Math.random() - 0.5) * 0.4;
      mesh.position.z += (Math.random() - 0.5) * 0.4;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.5;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed * 0.5,
        1.2 + Math.random() * 1.5,
        Math.sin(angle) * speed * 0.5
      );

      this.group.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        life: 0,
        maxLife: 0.8 + Math.random() * 0.6,
        baseScale: 0.8 + Math.random() * 0.5
      });
    }
  }

  update(delta: number, camera: THREE.Camera): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += delta;

      if (p.life >= p.maxLife) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      // Physics
      p.velocity.y -= 2.5 * delta; // gravity
      p.mesh.position.addScaledVector(p.velocity, delta);

      // Face camera (billboard)
      p.mesh.quaternion.copy(camera.quaternion);

      // Scale pulse & fade
      const progress = p.life / p.maxLife;
      const scale = Math.sin(progress * Math.PI) * p.baseScale;
      p.mesh.scale.set(scale, scale, scale);
    }
  }
}

export const sparkleSystem = new SparkleSystem();
