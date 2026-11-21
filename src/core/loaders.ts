import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ASSET_MANIFEST, AssetEntry } from '../assets/manifest';

export class AssetLoader {
  private gltfLoader: GLTFLoader;
  private textureLoader: THREE.TextureLoader;
  private cache: Map<string, any> = new Map();
  public isGreybox = new URLSearchParams(window.location.search).get('greybox') === '1';

  constructor() {
    this.gltfLoader = new GLTFLoader();
    // Decor models are meshopt-compressed (EXT_meshopt_compression)
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    this.textureLoader = new THREE.TextureLoader();
  }

  async loadGLTF(assetKey: string): Promise<THREE.Group | null> {
    if (this.isGreybox) {
      return null;
    }

    const manifestEntry = ASSET_MANIFEST[assetKey];
    if (!manifestEntry) {
      return null;
    }

    // Cache the in-flight promise so parallel callers (and preload) share one download
    if (!this.cache.has(assetKey)) {
      this.cache.set(
        assetKey,
        this.gltfLoader.loadAsync(manifestEntry.url).then(
          (gltf) => gltf.scene,
          (err) => {
            console.warn(`[AssetLoader] Could not load GLTF for "${assetKey}" from ${manifestEntry.url}. Using procedural fallback.`, err);
            return null;
          }
        )
      );
    }
    const scene: THREE.Group | null = await this.cache.get(assetKey);
    return scene ? scene.clone() : null;
  }

  /** Starts downloading several manifest assets at once without waiting for them. */
  preload(assetKeys: string[]): void {
    assetKeys.forEach((key) => void this.loadGLTF(key));
  }

  /** Loads a GLB by URL (no manifest entry needed). Cached per URL; returns a clone. */
  async loadUrl(url: string): Promise<THREE.Group | null> {
    if (this.isGreybox) return null;
    const key = `url:${url}`;
    if (!this.cache.has(key)) {
      this.cache.set(
        key,
        this.gltfLoader.loadAsync(url).then(
          (gltf) => gltf.scene,
          (err) => {
            console.warn(`[AssetLoader] Could not load ${url}.`, err);
            return null;
          }
        )
      );
    }
    const scene: THREE.Group | null = await this.cache.get(key);
    return scene ? scene.clone() : null;
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
