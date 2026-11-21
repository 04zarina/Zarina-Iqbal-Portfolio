export interface AssetEntry {
  id: string;
  url: string;
  type: 'gltf' | 'texture' | 'video' | 'audio';
  optional?: boolean;
}

export const ASSET_MANIFEST: Record<string, AssetEntry> = {
  companion: {
    id: 'companion',
    url: '/models/companion/scene.gltf',
    type: 'gltf',
    optional: true
  },
  avatar: {
    id: 'avatar',
    url: '/models/avatar/avatar_new.glb',
    type: 'gltf',
    optional: true
  },
  bed: {
    id: 'bed',
    url: '/models/furniture/Bed_02.glb',
    type: 'gltf',
    optional: true
  },
  desk: {
    id: 'desk',
    url: '/models/furniture/Work_Table_06.glb',
    type: 'gltf',
    optional: true
  },
  chair: {
    id: 'chair',
    url: '/models/furniture/Chair_17.glb',
    type: 'gltf',
    optional: true
  },
  tv: {
    id: 'tv',
    url: '/models/props/tv.glb',
    type: 'gltf',
    optional: true
  },
  tape: {
    id: 'tape',
    url: '/models/props/tape.glb',
    type: 'gltf',
    optional: true
  },
  mailbox: {
    id: 'mailbox',
    url: '/models/props/mailbox.glb',
    type: 'gltf',
    optional: true
  },
  mirror: {
    id: 'mirror',
    url: '/models/props/mirror.glb',
    type: 'gltf',
    optional: true
  },
  lamp_table: {
    id: 'lamp_table',
    url: '/models/props/lamp_table.glb',
    type: 'gltf',
    optional: true
  },
  wardrobe: {
    id: 'wardrobe',
    url: '/models/furniture/Closet_01.glb',
    type: 'gltf',
    optional: true
  },
  nightstand: {
    id: 'nightstand',
    url: '/models/furniture/Nightstand_02.glb',
    type: 'gltf',
    optional: true
  },
  plant: {
    id: 'plant',
    url: '/models/furniture/Plants_05.glb',
    type: 'gltf',
    optional: true
  }
};
