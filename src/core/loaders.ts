import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_MANIFEST, AssetEntry } from '../assets/manifest';

export class AssetLoader {
  private gltfLoader: GLTFLoader;
  private textureLoader: THREE.TextureLoader;
  private cache: Map<string, any> = new Map();
  public isGreybox = new URLSearchParams(window.location.search).get('greybox') === '1';

  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
  }

  async loadGLTF(assetKey: string): Promise<THREE.Group | null> {
    if (this.isGreybox) {
      return null;
    }

    if (this.cache.has(assetKey)) {
      return this.cache.get(assetKey).clone();
    }

    const manifestEntry = ASSET_MANIFEST[assetKey];
    if (!manifestEntry) {
      return null;
    }

    try {
      const gltf = await this.gltfLoader.loadAsync(manifestEntry.url);
      this.cache.set(assetKey, gltf.scene);
      return gltf.scene.clone();
    } catch (err) {
      console.warn(`[AssetLoader] Could not load GLTF for "${assetKey}" from ${manifestEntry.url}. Using procedural fallback.`, err);
      return null;
    }
  }

  loadTexture(url: string): THREE.Texture {
    if (this.cache.has(url)) {
      return this.cache.get(url);
    }
    const tex = this.textureLoader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set(url, tex);
    return tex;
  }
}

export const assetLoader = new AssetLoader();
