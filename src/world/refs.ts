import type * as THREE from 'three';
import type { Avatar } from './avatar/avatar';

/** Shared handles that rooms need but don't own (set once in main.ts). */
export const refs: { avatar: Avatar | null; camera: THREE.PerspectiveCamera | null } = { avatar: null, camera: null };
