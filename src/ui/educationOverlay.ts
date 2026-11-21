import { store } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import eduData from '../../content/education.json';
import expData from '../../content/experience.json';

interface EduEntry {
  id: string;
  title: string;
  org: string;
  start: string;
  end: string;
  summary: string;
  highlights: string[];
}

interface ExpEntry {
  id: string;
  title: string;
  org: string;
  start: string;
  end: string;
  summary: string;
  highlights: string[];
}

export class EducationOverlay {
  private overlay: HTMLElement;
  private currentTab: 'education' | 'experience' = 'education';

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'edu-modal';

    document.body.appendChild(this.overlay);
    this.initEvents();
  }

  private initEvents(): void {
    eventBus.on('overlay:open', (name: string) => {
      if (name === 'education') {
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
    eventBus.emit('overlay:close', 'education');
  }

  private setTab(tab: 'education' | 'experience'): void {
    this.currentTab = tab;
    audioManager.playPop();
    this.render();
  }

  private renderTimeline(entries: (EduEntry | ExpEntry)[], accentVar: string): string {
    return entries.map((entry, i) => `
      <div style="
        display: flex;
        gap: 16px;
        padding: 0 0 28px 0;
        position: relative;
      ">
        <!-- Timeline line + dot -->
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          flex-shrink: 0;
          width: 32px;
        ">
          <div style="
            width: 18px; height: 18px;
            border-radius: 50%;
            background: var(${accentVar});
            border: 3px solid var(--cocoa);
            flex-shrink: 0;
            box-shadow: 0 2px 6px rgba(0,0,0,0.12);
          "></div>
          ${i < entries.length - 1 ? `<div style="
            width: 2px;
            flex: 1;
            background: var(--cocoa);
            opacity: 0.3;
            margin-top: 4px;
            min-height: 20px;
          "></div>` : ''}
        </div>

        <!-- Card -->
        <div style="
          flex: 1;
          background: var(--surface-color);
          border: 2px solid var(--cocoa);
          border-radius: 16px;
          padding: 16px 18px;
          box-shadow: 0 2px 0 var(--cocoa);
        ">
          <!-- Date badge -->
          <div style="
            display: inline-block;
            font-family: var(--font-display);
            font-size: 0.75rem;
            font-weight: 700;
            background: var(${accentVar});
            border: 1.5px solid var(--cocoa);
            border-radius: 20px;
            padding: 2px 10px;
            margin-bottom: 8px;
            color: var(--ink);
          ">${entry.start === entry.end ? entry.start : `${entry.start} → ${entry.end}`}</div>

          <div style="
            font-family: var(--font-display);
            font-weight: 700;
            font-size: 1rem;
            color: var(--ink);
            margin-bottom: 2px;
          ">${entry.title}</div>

          <div style="
            font-size: 0.82rem;
            font-weight: 700;
            color: var(--text-muted);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 5px;
          ">🏢 ${entry.org}</div>

          <div style="
            font-size: 0.88rem;
            color: var(--ink);
            line-height: 1.5;
            margin-bottom: 10px;
          ">${entry.summary}</div>

          <!-- Highlights -->
          ${entry.highlights.length ? `<ul style="
            margin: 0;
            padding-left: 18px;
            display: flex;
            flex-direction: column;
            gap: 4px;
          ">
            ${entry.highlights.map(h => `
              <li style="font-size: 0.84rem; color: var(--ink); line-height: 1.4;">
                ${h}
              </li>
            `).join('')}
          </ul>` : ''}
        </div>
      </div>
    `).join('');
  }

  private render(): void {
    const eduEntries = eduData as EduEntry[];
    const expEntries = expData as ExpEntry[];

    const tabHeaders = `
      <div style="display:flex; gap:8px; margin-bottom:18px; border-bottom:2px solid var(--cocoa); padding-bottom:10px; flex-wrap:wrap;">
        <button class="sticker-btn ${this.currentTab === 'education' ? 'accent-butter' : ''}" id="tab-edu" style="padding:6px 16px; font-size:0.9rem;">
          🎓 Education
        </button>
        <button class="sticker-btn ${this.currentTab === 'experience' ? 'accent-mint' : ''}" id="tab-exp" style="padding:6px 16px; font-size:0.9rem;">
          💼 Experience
        </button>
      </div>
    `;

    const contentHtml = this.currentTab === 'education'
      ? this.renderTimeline(eduEntries, '--butter')
      : this.renderTimeline(expEntries, '--mint');

    this.overlay.innerHTML = `
      <div class="modal-card" style="max-width:580px;">
        <button class="modal-close-btn" id="edu-close-btn">✕</button>
        <h2 class="modal-title">📚 Education &amp; Career Timeline</h2>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:14px; font-style:italic;">
          Pinned from the Study Corkboard 📌
        </p>
        ${tabHeaders}
        <div style="max-height:60vh; overflow-y:auto; padding-right:4px;">
          ${contentHtml}
        </div>
      </div>
    `;

    this.overlay.querySelector('#edu-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#tab-edu')?.addEventListener('click', () => this.setTab('education'));
    this.overlay.querySelector('#tab-exp')?.addEventListener('click', () => this.setTab('experience'));
  }
}
