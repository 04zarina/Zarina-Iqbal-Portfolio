import * as THREE from 'three';

/**
 * A tiny "vertex shader rig" for the avatar.
 *
 * The avatar GLB is a single static mesh in a T-pose with no skeleton, so it can't
 * play normal skeletal animations. Instead we bend it on the GPU: vertices in the
 * arm and leg regions are rotated around shoulder and hip pivots. That's enough to
 * drop the arms to her sides, swing arms and legs while walking, sit, and wave.
 *
 * Region thresholds are measured on the model (height-normalised, so they survive
 * re-exports and quantisation). Model space: +X forward, +Y up, +Z her right side.
 */
export interface RigPose {
  armDownL: number; // rotation lowering the arm from the T-pose (rad, ~1.3 = at her side)
  armDownR: number;
  armSwingL: number; // forward/back swing (rad)
  armSwingR: number;
  legL: number; // forward/back swing at the hip (rad, + = foot forward)
  legR: number;
}

export class AvatarRig {
  public readonly uniforms = {
    uArmDownL: { value: 1.3 },
    uArmDownR: { value: 1.3 },
    uArmSwingL: { value: 0 },
    uArmSwingR: { value: 0 },
    uLegL: { value: 0 },
    uLegR: { value: 0 },
    uRigCenter: { value: new THREE.Vector3() },
    uRigHeight: { value: 1 }
  };

  /** Patch every material on the avatar so its vertices follow the rig uniforms. */
  apply(root: THREE.Object3D): boolean {
    let mesh: THREE.Mesh | null = null;
    root.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) return false;
    const m = mesh as THREE.Mesh;
    m.geometry.computeBoundingBox();
    const box = m.geometry.boundingBox!;
    const size = box.getSize(new THREE.Vector3());
    // Only rig a model that looks like this T-pose avatar: tall, arms out wide, thin front-to-back.
    if (!(size.y > 0 && size.z > size.y * 0.6 && size.x < size.y * 0.4)) return false;
    box.getCenter(this.uniforms.uRigCenter.value);
    this.uniforms.uRigHeight.value = size.y;
    // Arms move outside the original bounds, so don't let frustum culling hide her.
    m.frustumCulled = false;

    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mat) => {
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${RIG_GLSL}`)
          .replace(
            '#include <beginnormal_vertex>',
            '#include <beginnormal_vertex>\nvec3 rigPos = position;\nrigVertex(rigPos, objectNormal);'
          )
          .replace('#include <begin_vertex>', 'vec3 transformed = rigPos;');
      };
      mat.customProgramCacheKey = () => 'avatar-rig-v1';
      mat.needsUpdate = true;
    });
    return true;
  }

  set(pose: RigPose): void {
    const u = this.uniforms;
    u.uArmDownL.value = pose.armDownL;
    u.uArmDownR.value = pose.armDownR;
    u.uArmSwingL.value = pose.armSwingL;
    u.uArmSwingR.value = pose.armSwingR;
    u.uLegL.value = pose.legL;
    u.uLegR.value = pose.legR;
  }
}

const RIG_GLSL = /* glsl */ `
uniform float uArmDownL; uniform float uArmDownR;
uniform float uArmSwingL; uniform float uArmSwingR;
uniform float uLegL; uniform float uLegR;
uniform vec3 uRigCenter; uniform float uRigHeight;

mat3 rigRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rigRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

void rigVertex(inout vec3 p, inout vec3 n) {
  vec3 q = (p - uRigCenter) / uRigHeight; // height-normalised: y in [-0.5, 0.5]
  float side = q.z >= 0.0 ? 1.0 : -1.0;   // +1 = her right, -1 = her left

  // Arms: everything outside the torso width, between the armpit and the top of the shoulder
  float wArm = smoothstep(0.104, 0.132, abs(q.z)) * smoothstep(0.125, 0.155, q.y) * (1.0 - smoothstep(0.30, 0.325, q.y));
  if (wArm > 0.0) {
    vec3 piv = vec3(0.0, 0.222, 0.118 * side);
    float down = side > 0.0 ? uArmDownR : uArmDownL;
    float swing = side > 0.0 ? uArmSwingR : uArmSwingL;
    mat3 R = rigRotZ(swing) * rigRotX(down * side);
    q = mix(q, R * (q - piv) + piv, wArm);
    n = normalize(mix(n, R * n, wArm));
  }

  // Legs: below the hips, split down the middle
  float wLeg = 1.0 - smoothstep(-0.175, -0.07, q.y);
  if (wLeg > 0.0) {
    float right = smoothstep(-0.012, 0.012, q.z);
    float ang = mix(uLegL, uLegR, right);
    vec3 piv = vec3(0.0, -0.07, 0.0);
    mat3 R = rigRotZ(ang);
    q = mix(q, R * (q - piv) + piv, wLeg);
    n = normalize(mix(n, R * n, wLeg));
  }

  p = q * uRigHeight + uRigCenter;
}
`;
