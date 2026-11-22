import { eventBus } from '../core/events';
import { store } from '../core/store';
import projectsData from '../../content/projects.json';
import type { Project } from '../content/types';
import { Modal, esc } from './modal';

const projects = projectsData as Project[];

/** Filter chips: label plus a test against a project. */
const FILTERS: { label: string; test: (p: Project) => boolean }[] = [
  { label: 'All', test: () => true },
  { label: 'Unreal', test: (p) => has(p, 'unreal') },
  { label: 'Unity', test: (p) => has(p, 'unity') },
  { label: 'VR / AR', test: (p) => has(p, 'vr') || has(p, 'ar ') || (p.tags || []).includes('AR') },
  { label: 'Web 3D', test: (p) => has(p, 'three.js') || (p.tags || []).includes('Web') },
  { label: 'Animation', test: (p) => has(p, 'after effects') || has(p, 'animatic') || has(p, 'blender') },
  { label: 'Play now', test: (p) => Boolean(p.links?.play) },
  { label: 'Team', test: (p) => p.teamSize > 1 },
  { label: 'Solo', test: (p) => p.teamSize === 1 }
];

function has(p: Project, needle: string): boolean {
  const hay = `${p.type} ${p.tools.join(' ')} ${(p.tags || []).join(' ')}`.toLowerCase();
  return hay.includes(needle);
}

function searchText(p: Project): string {
  return `${p.title} ${p.tagline} ${p.type} ${p.tools.join(' ')} ${(p.tags || []).join(' ')} ${p.roles.join(' ')} ${p.year}`.toLowerCase();
}

/** Every project in one place, with search and filter chips (opened from 🗂️ or the Study shelf). */
export class ProjectLibraryOverlay extends Modal {
  private filter = 0;
  private query = '';

  constructor() {
    super('library', 'All projects', 860);
  }

  protected render(arg?: unknown): void {
    if (typeof arg === 'string') {
      const i = FILTERS.findIndex((f) => f.label === arg);
      if (i >= 0) this.filter = i;
    }
    this.card.innerHTML = `
      <h2 class="modal-title">🗂️ All Projects</h2>
      <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:10px;">
        ${projects.length} projects: games, VR, web 3D, computer vision and animation. Click one for details.
      </p>
      <label class="sr-only" for="library-search">Search projects</label>
      <input id="library-search" type="search" placeholder="Search by name, tool or role (e.g. Blueprints, VR, level design)"
        value="${esc(this.query)}" autocomplete="off"
        style="width:100%; padding:10px 14px; border-radius:var(--radius-pill); border:2px solid var(--cocoa); margin-bottom:10px; font:inherit;" />
      <div class="library-filters" role="group" aria-label="Filter projects" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
        ${FILTERS.map(
          (f, i) =>
            `<button type="button" class="starter-chip${i === this.filter ? ' active' : ''}" data-filter="${i}" aria-pressed="${i === this.filter}">${f.label}</button>`
        ).join('')}
      </div>
      <div class="library-grid" aria-live="polite"></div>`;

    const input = this.card.querySelector('#library-search') as HTMLInputElement;
    input.addEventListener('input', () => {
      this.query = input.value;
      this.renderGrid();
    });
    // Typing in the search box must not move the avatar (controller ignores INPUT targets)
    this.card.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) =>
      b.addEventListener('click', () => {
        this.filter = Number(b.dataset.filter);
        this.card.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((x) => {
          const on = x === b;
          x.classList.toggle('active', on);
          x.setAttribute('aria-pressed', String(on));
        });
        this.renderGrid();
      })
    );
    this.renderGrid();
  }

  private renderGrid(): void {
    const grid = this.card.querySelector('.library-grid')!;
    const q = this.query.trim().toLowerCase();
    const list = projects.filter((p) => FILTERS[this.filter].test(p) && (!q || q.split(/\s+/).every((w) => searchText(p).includes(w))));
    grid.innerHTML = list.length
      ? list
          .map(
            (p) => `
        <button type="button" class="library-card" data-id="${p.id}" style="--accent:${p.accentColor || '#FFE9A3'}">
          ${p.images?.[0] ? `<img src="${p.images[0].src}" alt="" loading="lazy" />` : `<div class="library-card-ph">🎮</div>`}
          <span class="library-card-body">
            <strong>${esc(p.title)}</strong>
            <small>${p.year} · ${esc(p.type)}</small>
            ${p.badge ? `<em class="library-badge">${esc(p.badge)}</em>` : ''}
          </span>
        </button>`
          )
          .join('')
      : `<p style="padding:20px; text-align:center;">No projects match. Try another word or filter.</p>`;
    grid.querySelectorAll<HTMLButtonElement>('.library-card').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.id!;
        this.close();
        store.set('activeOverlay', 'project');
        eventBus.emit('project:select', id);
      })
    );
  }
}
