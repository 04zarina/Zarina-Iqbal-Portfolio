import { eventBus } from './events';

export type RoomId = 'bedroom' | 'gameRoom' | 'greenhouse' | 'study' | 'devRealm';
export type ThemeMode = 'day' | 'dusk';
export type QualityTier = 'high' | 'medium' | 'low';
export type OverlayType = 'none' | 'project' | 'tv' | 'chat' | 'contact' | 'about' | 'journal' | 'education' | 'menu' | 'resume';

export interface AppState {
  currentRoom: RoomId;
  theme: ThemeMode;
  holdingTape: boolean;
  tvPlaying: boolean;
  visitedRooms: string[];
  foundCollectibles: string[];
  quality: QualityTier;
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  activeOverlay: OverlayType;
  activeProjectId: string | null;
  inputLocked: boolean;
  isWakingUp: boolean;
  isSleeping: boolean;
  completedQuests: string[];
}

const DEFAULT_STATE: AppState = {
  currentRoom: 'bedroom',
  theme: (localStorage.getItem('theme_preference') as ThemeMode) || 'dusk',
  holdingTape: false,
  tvPlaying: false,
  visitedRooms: ['bedroom'],
  foundCollectibles: [],
  quality: (localStorage.getItem('quality_tier') as QualityTier) || 'high',
  muted: localStorage.getItem('audio_muted') === 'true',
  musicVolume: 0.7,
  sfxVolume: 0.8,
  activeOverlay: 'none',
  activeProjectId: null,
  inputLocked: true, // Initially locked for waking up sequence
  isWakingUp: true,
  isSleeping: true,
  completedQuests: ['start_journey']
};

class Store {
  private state: AppState = { ...DEFAULT_STATE };

  get(): Readonly<AppState> {
    return this.state;
  }

  set<K extends keyof AppState>(key: K, value: AppState[K]): void {
    this.state[key] = value;
    eventBus.emit(`state:${String(key)}`, value);
    eventBus.emit('state:change', { key, value, state: this.state });

    if (key === 'theme') {
      localStorage.setItem('theme_preference', value as string);
      document.documentElement.setAttribute('data-theme', value as string);
    } else if (key === 'quality') {
      localStorage.setItem('quality_tier', value as string);
    } else if (key === 'muted') {
      localStorage.setItem('audio_muted', String(value));
    }
  }

  markRoomVisited(roomId: RoomId): void {
    if (!this.state.visitedRooms.includes(roomId)) {
      this.state.visitedRooms.push(roomId);
      eventBus.emit('state:visitedRooms', this.state.visitedRooms);
      this.checkQuests();
    }
  }

  collectItem(id: string): void {
    if (!this.state.foundCollectibles.includes(id)) {
      this.state.foundCollectibles.push(id);
      eventBus.emit('state:foundCollectibles', this.state.foundCollectibles);
      eventBus.emit('collectible:found', id);
      this.checkQuests();
    }
  }

  completeQuest(questId: string): void {
    if (!this.state.completedQuests.includes(questId)) {
      this.state.completedQuests.push(questId);
      eventBus.emit('quest:completed', questId);
    }
  }

  private checkQuests(): void {
    if (this.state.visitedRooms.length >= 4) {
      this.completeQuest('explore_rooms');
    }
  }
}

export const store = new Store();
