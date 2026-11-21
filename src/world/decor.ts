import * as THREE from 'three';
import { assetLoader } from '../core/loaders';

/** Compressed furniture-pack models (meshopt + 256px WebP palette texture, ~10–50 KB each). */
export const DECOR = {
  armchairBlue: '/models/decor/Armchair_02.glb',
  armchairRed: '/models/decor/Armchair_18.glb',
  bookRow: '/models/decor/Book_03.glb',
  bookStack: '/models/decor/Book_08.glb',
  chairPC: '/models/decor/Chair_PC_04.glb',
  clock: '/models/decor/Clock_03.glb',
  bookshelf: '/models/decor/Closet_01.glb',
  wardrobe: '/models/decor/Closet_02.glb',
  coffeeTable: '/models/decor/Coffee_Table_03.glb',
  computer: '/models/decor/Computer_01.glb',
  couchBlue: '/models/decor/Couch_08.glb',
  couchPink: '/models/decor/Couch_11.glb',
  gamepad: '/models/decor/GameConsole_01.glb',
  longTable: '/models/decor/Kitchen_Table_09.glb',
  floorLamp: '/models/decor/Light_05.glb',
  paper: '/models/decor/Paper_02.glb',
  pictureFlowers: '/models/decor/Picture_08.glb',
  pictureSun: '/models/decor/Picture_17.glb',
  picturePyramid: '/models/decor/Picture_21.glb',
  plantTall: '/models/decor/Plants_15.glb',
  plantPalm: '/models/decor/Plants_19.glb',
  toyCar: '/models/decor/Toy_02.glb',
  toyTop: '/models/decor/Toy_03.glb'
} as const;

export interface DecorPlacement {
  url: string;
  position: [number, number, number];
  /** Rotation around Y in radians. Pack models face +Z by default. */
  rotY?: number;
  scale?: number;
}

/** Loads decor models in parallel and adds them to the parent. Missing models are skipped. */
export async function placeDecor(parent: THREE.Object3D, items: DecorPlacement[]): Promise<THREE.Object3D[]> {
  const loaded = await Promise.all(items.map((item) => assetLoader.loadUrl(item.url)));
  const added: THREE.Object3D[] = [];
  loaded.forEach((obj, i) => {
    if (!obj) return;
    const item = items[i];
    obj.position.set(...item.position);
    obj.rotation.y = item.rotY ?? 0;
    if (item.scale) obj.scale.setScalar(item.scale);
    parent.add(obj);
    added.push(obj);
  });
  return added;
}

/**
 * Wraps a model so its bounding box is centered on X/Z with its base at y = 0
 * (or centered vertically when `centerY` is set). Useful for assets authored
 * with an off-center origin, like the Kenney lamp or the TV.
 */
export function recenter(model: THREE.Object3D, centerY = false): THREE.Group {
  const wrapper = new THREE.Group();
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= centerY ? center.y : box.min.y;
  wrapper.add(model);
  return wrapper;
}
