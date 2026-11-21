import { store } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import projectsData from '../../content/projects.json';

export class ProjectCardOverlay {
  private element: HTMLElement;
  private currentProjectIndex = 0;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'project-card-container';
    document.body.appendChild(this.element);

    eventBus.on('project:select', (projectId: string) => {
      const idx = projectsData.findIndex((p) => p.id === projectId);
      if (idx !== -1) {
        this.currentProjectIndex = idx;
        this.render();
        this.open();
      }
    });

    eventBus.on('overlay:close', (name: string) => {
      if (name === 'project') this.close();
    });
  }

  open(): void {
    this.element.classList.add('active');
    store.set('inputLocked', true);
  }

  close(): void {
    this.element.classList.remove('active');
    store.set('activeOverlay', 'none');
    store.set('inputLocked', false);
    audioManager.playPop();
    eventBus.emit('camera:unfocus');
  }

  private nextProject(): void {
    this.currentProjectIndex = (this.currentProjectIndex + 1) % projectsData.length;
    this.render();
    audioManager.playPop();
  }

  private prevProject(): void {
    this.currentProjectIndex = (this.currentProjectIndex - 1 + projectsData.length) % projectsData.length;
    this.render();
    audioManager.playPop();
  }

  private render(): void {
    const project = projectsData[this.currentProjectIndex];

    const rolesHtml = project.roles.map((r) => `<span class="chip" style="background:var(--mint);">${r}</span>`).join('');
    const toolsHtml = project.tools.map((t) => `<span class="chip">${t}</span>`).join('');
    const contribsHtml = project.contributions.map((c) => `<li>${c}</li>`).join('');

    this.element.innerHTML = `
      <div class="project-video-wrap">
        <canvas id="project-trailer-canvas" width="440" height="220"></canvas>
        <button class="modal-close-btn" id="project-close-btn">✕</button>
      </div>

      <div class="project-content-scroll">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <h2 class="modal-title" style="margin-bottom:4px;">${project.title}</h2>
          <span class="chip" style="background:var(--butter); font-weight:800;">${project.year}</span>
        </div>
        <p style="font-weight:700; color:var(--text-muted); margin-bottom:10px;">${project.tagline}</p>

        <div class="project-chip-row">${rolesHtml}</div>

        <p style="font-size:0.92rem; line-height:1.5; margin-bottom:12px;">${project.description}</p>

        <h4 style="font-family:var(--font-display); margin-bottom:6px; color:var(--ink);">Key Contributions:</h4>
        <ul style="padding-left:18px; font-size:0.88rem; line-height:1.45; margin-bottom:14px; color:var(--ink);">
          ${contribsHtml}
        </ul>

        <h4 style="font-family:var(--font-display); margin-bottom:6px; color:var(--ink);">Technologies Used:</h4>
        <div class="project-chip-row">${toolsHtml}</div>

        <div style="display:flex; gap:10px; margin-top:16px;">
          ${project.links?.play ? `<a href="${project.links.play}" target="_blank" rel="noreferrer" class="sticker-btn accent-butter" style="flex:1;">Play Demo 🎮</a>` : ''}
          ${project.links?.repo ? `<a href="${project.links.repo}" target="_blank" rel="noreferrer" class="sticker-btn accent-sky" style="flex:1;">GitHub Code 💻</a>` : ''}
        </div>
      </div>

      <div class="project-nav-row">
        <button class="sticker-btn" id="project-prev-btn">◀ Previous</button>
        <span style="font-weight:700; font-size:0.9rem;">${this.currentProjectIndex + 1} of ${projectsData.length}</span>
        <button class="sticker-btn" id="project-next-btn">Next ▶</button>
      </div>
    `;

    this.element.querySelector('#project-close-btn')?.addEventListener('click', () => this.close());
    this.element.querySelector('#project-prev-btn')?.addEventListener('click', () => this.prevProject());
    this.element.querySelector('#project-next-btn')?.addEventListener('click', () => this.nextProject());

    // Draw cute animated retro trailer preview canvas
    this.drawTrailerCanvas(project);
  }

  private drawTrailerCanvas(project: typeof projectsData[0]): void {
    const canvas = this.element.querySelector('#project-trailer-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // Draw stylized trailer poster
    ctx.fillStyle = '#2A1C38';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#FFC9B0';
    ctx.font = 'bold 28px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(project.title, canvas.width / 2, canvas.height / 2 - 10);

    ctx.fillStyle = '#FFE9A3';
    ctx.font = '16px Nunito, sans-serif';
    ctx.fillText('Trailer & Gameplay Reel', canvas.width / 2, canvas.height / 2 + 24);

    // Play button icon
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2 + 65, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2A1C38';
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 5, canvas.height / 2 + 57);
    ctx.lineTo(canvas.width / 2 + 8, canvas.height / 2 + 65);
    ctx.lineTo(canvas.width / 2 - 5, canvas.height / 2 + 73);
    ctx.fill();
  }
}
