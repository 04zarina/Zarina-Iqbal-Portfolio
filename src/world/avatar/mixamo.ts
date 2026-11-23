import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Mixamo-rigged avatar with real skeletal clips.
 *
 * Built by scripts/build_avatar.py from the Mixamo FBX files (see README), then compressed
 * with meshopt + a 1024 WebP texture. Clips: Idle, Walk, Wave, Sitting, LyingDown, WakeUp,
 * Petting, Throw. If it fails to load, the avatar falls back to the static mesh + GPU rig.
 */
export const RIGGED_AVATAR_URL = '/models/avatar/avatar_rigged.glb';

/** Keywords matched (case-insensitively) against clip names, in order of preference. */
export const CLIP_KEYWORDS: Record<AvatarClip, string[]> = {
  idle: ['idle', 'breathing'],
  walk: ['walk'],
  run: ['run', 'jog', 'walk'],
  wave: ['wave', 'waving'],
  sit: ['sitting idle', 'sit idle', 'sitting', 'sit'],
  sleep: ['lyingdown', 'lying', 'laying', 'sleep'],
  wake: ['wakeup', 'getting up', 'stand up', 'wake'],
  pet: ['petting', 'pet', 'kneel', 'crouch'],
  cheer: ['cheer', 'victory', 'happy', 'clap', 'wave'],
  reach: ['button', 'reach', 'grab', 'throw']
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

  /** Seconds the clip lasts at its current speed (0 if missing). */
  duration(clip: AvatarClip): number {
    const a = this.actions.get(clip);
    return a ? a.getClip().duration / Math.max(0.01, Math.abs(a.timeScale)) : 0;
  }

  get playing(): AvatarClip | null {
    return this.current;
  }

  /**
   * Cross-fade to a clip. `once` plays it a single time and holds the last frame;
   * `atEnd` jumps straight to that last frame (e.g. already lying in bed).
   */
  play(clip: AvatarClip, fade = 0.25, once = false, atEnd = false): void {
    const next = this.actions.get(clip) || this.actions.get('idle');
    if (!next || this.current === clip) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    if (atEnd) next.time = next.getClip().duration;
    // Two keys can share one clip (cheer -> Wave); don't fade out the action we just started
    if (prev && prev !== next) prev.fadeOut(fade);
    if (prev === next || fade <= 0) next.setEffectiveWeight(1).play();
    else next.fadeIn(fade).play();
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
