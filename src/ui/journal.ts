import { store, RoomId } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import achievementsData from '../../content/achievements.json';

export class JournalOverlay {
  private overlay: HTMLElement;
  private currentTab: 'quests' | 'map' | 'collectibles' = 'quests';

  private quests = [
    { id: 'start_journey', title: 'Welcome to the Studio', desc: 'Step into the cozy bedroom.' },
    { id: 'pickup_tape', title: 'Find the Reel', desc: 'Pick up Alex\'s Demo Reel cassette tape.' },
    { id: 'watch_reel', title: 'Watch the TV', desc: 'Insert the cassette tape to play the video.' },
    { id: 'play_game', title: 'Arcade Player', desc: 'Insert a coin into any arcade cabinet.' },
    { id: 'water_plant', title: 'Green Thumb', desc: 'Water a skill plant in the greenhouse.' },
    { id: 'explore_rooms', title: 'Studio Explorer', desc: 'Discover all 4 connected rooms.' },
    { id: 'send_letter', title: 'Pen Pal', desc: 'Drop a message into the bedroom mailbox.' }
  ];

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'journal-modal';

    document.body.appendChild(this.overlay);
    this.initEvents();
  }

  private initEvents(): void {
    eventBus.on('overlay:open', (name: string) => {
      if (name === 'journal') {
        this.render();
        this.open();
      }
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  open(): void {
    this.overlay.classList.add('active');
    store.set('inputLocked', true);
  }

  close(): void {
    this.overlay.classList.remove('active');
    store.set('activeOverlay', 'none');
    store.set('inputLocked', false);
    audioManager.playPop();
  }

  private setTab(tab: 'quests' | 'map' | 'collectibles'): void {
    this.currentTab = tab;
    audioManager.playPop();
    this.render();
  }

  private render(): void {
    const state = store.get();

    // Tab buttons
    const tabHeaders = `
      <div style="display:flex; gap:8px; margin-bottom:18px; border-bottom:2px solid var(--cocoa); padding-bottom:10px;">
        <button class="sticker-btn ${this.currentTab === 'quests' ? 'accent-butter' : ''}" id="tab-quests" style="padding:6px 16px; font-size:0.9rem;">
          📜 Quests
        </button>
        <button class="sticker-btn ${this.currentTab === 'map' ? 'accent-mint' : ''}" id="tab-map" style="padding:6px 16px; font-size:0.9rem;">
          🗺️ Room Map
        </button>
        <button class="sticker-btn ${this.currentTab === 'collectibles' ? 'accent-blush' : ''}" id="tab-trophies" style="padding:6px 16px; font-size:0.9rem;">
          🏆 Trophies
        </button>
      </div>
    `;

    let contentHtml = '';

    if (this.currentTab === 'quests') {
      const questItems = this.quests.map((q) => {
        const completed = state.completedQuests.includes(q.id);
        return `
          <div style="display:flex; align-items:center; gap:12px; padding:10px; border-radius:12px; background:var(--surface-color); border:1.5px solid var(--cocoa); margin-bottom:8px;">
            <div style="font-size:1.4rem;">${completed ? '✅' : '⚪'}</div>
            <div style="flex:1;">
              <div style="font-family:var(--font-display); font-weight:700; ${completed ? 'text-decoration:line-through; opacity:0.7;' : ''}">${q.title}</div>
              <div style="font-size:0.85rem; color:var(--text-muted);">${q.desc}</div>
            </div>
          </div>
        `;
      }).join('');
      contentHtml = `<div>${questItems}</div>`;
    } else if (this.currentTab === 'map') {
      const rooms: { id: RoomId; name: string; icon: string }[] = [
        { id: 'bedroom', name: 'Bedroom Hub', icon: '🏠' },
        { id: 'gameRoom', name: 'Arcade Room', icon: '🕹️' },
        { id: 'greenhouse', name: 'Greenhouse Balcony', icon: '🌿' },
        { id: 'study', name: 'Study Nook', icon: '📚' },
        { id: 'devRealm', name: 'Dev Realm Island', icon: '☁️' }
      ];

      const roomCards = rooms.map((r) => {
        const visited = state.visitedRooms.includes(r.id);
        return `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; border-radius:12px; background:var(--surface-color); border:1.5px solid var(--cocoa); margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:1.6rem;">${r.icon}</span>
              <span style="font-family:var(--font-display); font-weight:700;">${r.name}</span>
            </div>
            <span class="chip" style="background:${visited ? 'var(--mint)' : 'var(--cream)'};">
              ${visited ? 'Discovered ✨' : 'Undiscovered ❓'}
            </span>
          </div>
        `;
      }).join('');
      contentHtml = `<div>${roomCards}</div>`;
    } else {
      const trophyCards = achievementsData.map((a) => `
        <div style="display:flex; align-items:center; gap:14px; padding:12px; border-radius:14px; background:var(--surface-color); border:1.5px solid var(--cocoa); margin-bottom:10px;">
          <div style="width:48px; height:48px; border-radius:50%; background:var(--butter); border:2px solid var(--cocoa); display:flex; align-items:center; justify-content:center; font-size:1.5rem;">
            🏆
          </div>
          <div>
            <div style="font-family:var(--font-display); font-weight:700; color:var(--ink);">${a.title}</div>
            <div style="font-size:0.82rem; font-weight:700; color:var(--text-muted);">${a.date}</div>
            <div style="font-size:0.86rem; margin-top:2px;">${a.summary}</div>
          </div>
        </div>
      `).join('');
      contentHtml = `<div>${trophyCards}</div>`;
    }

    this.overlay.innerHTML = `
      <div class="modal-card" style="max-width:540px;">
        <button class="modal-close-btn" id="journal-close-btn">✕</button>
        <h2 class="modal-title">📖 Explorer's Studio Journal</h2>
        ${tabHeaders}
        <div style="max-height:55vh; overflow-y:auto; padding-right:4px;">
          ${contentHtml}
        </div>
      </div>
    `;

    this.overlay.querySelector('#journal-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#tab-quests')?.addEventListener('click', () => this.setTab('quests'));
    this.overlay.querySelector('#tab-map')?.addEventListener('click', () => this.setTab('map'));
    this.overlay.querySelector('#tab-trophies')?.addEventListener('click', () => this.setTab('collectibles'));
  }
}
