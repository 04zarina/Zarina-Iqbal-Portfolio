import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Optional Mixamo-rigged avatar.
 *
 * The current avatar is a static mesh bent by a small GPU rig (rig.ts). If you rig her in
 * Mixamo (see README "Rigging the avatar in Mixamo"), export one GLB with all the clips,
 * put it at public/models/avatar/avatar_rigged.glb and set the URL below. The avatar then
 * plays real skeletal animations instead of the GPU rig. Leave it empty to keep the GPU rig.
 */
export const RIGGED_AVATAR_URL = '';

/** Keywords matched (case-insensitively) against clip names, in order of preference. */
export const CLIP_KEYWORDS: Record<AvatarClip, string[]> = {
  idle: ['idle', 'breathing'],
  walk: ['walk'],
  run: ['run', 'jog'],
  wave: ['wave', 'waving'],
  sit: ['sitting idle', 'sit idle', 'sitting', 'sit'],
  sleep: ['sleep', 'lying', 'laying'],
  wake: ['getting up', 'stand up', 'wake'],
  pet: ['pet', 'kneel', 'crouch', 'pick'],
  cheer: ['cheer', 'victory', 'happy', 'clap'],
  reach: ['button', 'pick', 'reach', 'grab']
};

export type AvatarClip = 'idle' | 'walk' | 'run' | 'wave' | 'sit' | 'sleep' | 'wake' | 'pet' | 'cheer' | 'reach';

export class MixamoAvatar {
  mixer: THREE.AnimationMixer;
  private actions = new Map<AvatarClip, THREE.AnimationAction>();
  private current: AvatarClip | null = null;

  constructor(public root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    (Object.keys(CLIP_KEYWORDS) as AvatarClip[]).forEach((key) => {
      const clip = CLIP_KEYWORDS[key]
        .map((kw) => clips.find((c) => c.name.toLowerCase().includes(kw)))
        .find(Boolean);
      if (clip) this.actions.set(key, this.mixer.clipAction(clip));
    });
  }

  has(clip: AvatarClip): boolean {
    return this.actions.has(clip);
  }

  play(clip: AvatarClip, fade = 0.25, once = false): void {
    const next = this.actions.get(clip) || this.actions.get('idle');
    if (!next || this.current === clip) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(fade).play();
    prev?.fadeOut(fade);
    this.current = clip;
  }

  setSpeed(clip: AvatarClip, timeScale: number): void {
    const a = this.actions.get(clip);
    if (a) a.timeScale = timeScale;
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }

  static async load(url: string): Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] } | null> {
    if (!url) return null;
    try {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(url);
      if (!gltf.animations.length) return null;
      return { scene: gltf.scene, clips: gltf.animations };
    } catch (err) {
      console.warn('[Avatar] Rigged avatar failed to load, using the GPU rig instead.', err);
      return null;
    }
  }
}
