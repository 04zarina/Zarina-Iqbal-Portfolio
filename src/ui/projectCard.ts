import { store } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import projectsData from '../../content/projects.json';
import { youtubeId } from '../content/profile';
import type { Project } from '../content/types';

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
    const project = projectsData[this.currentProjectIndex] as Project;
    const images = project.images ?? [];
    const videoId = youtubeId(project.video?.src);
    const team = project.teamSize === 1 ? 'Solo' : `Team of ${project.teamSize}`;

    const rolesHtml = project.roles.map((r) => `<span class="chip" style="background:var(--mint);">${r}</span>`).join('');
    const toolsHtml = project.tools.map((t) => `<span class="chip">${t}</span>`).join('');
    const contribsHtml = project.contributions.map((c) => `<li>${c}</li>`).join('');
    const thumbsHtml = images.length > 1
      ? `<div class="project-thumb-row">${images.map((img, i) => `
          <img class="project-thumb ${i === 0 ? 'active' : ''}" data-idx="${i}" src="${img.src}" alt="${img.alt}" loading="lazy" />`).join('')}</div>`
      : '';

    const links = project.links ?? {};
    // The header button plays project.video in the card. If that's the trailer, call it a trailer;
    // and don't repeat a link button for the same video at the bottom of the card.
    const isTrailer = Boolean(videoId && links.trailer && youtubeId(links.trailer) === videoId);
    const playLabel = isTrailer ? '▶ Play trailer' : '▶ Watch video';
    const sameAsHeader = (href?: string) => Boolean(videoId && href && youtubeId(href) === videoId);
    const linkBtn = (href: string | undefined, label: string, accent: string) =>
      href && !sameAsHeader(href) ? `<a href="${href}" target="_blank" rel="noreferrer" class="sticker-btn ${accent}" style="flex:1 1 40%; justify-content:center;">${label}</a>` : '';

    this.element.innerHTML = `
      <div class="project-video-wrap" id="project-media">
        ${images[0] ? `<img id="project-main-img" src="${images[0].src}" alt="${images[0].alt}" />` : ''}
        ${videoId ? `<button class="sticker-btn accent-butter project-play-overlay" id="project-play-btn">${playLabel}</button>` : ''}
        <button class="modal-close-btn" id="project-close-btn">✕</button>
      </div>

      <div class="project-content-scroll">
        ${project.badge ? `<span class="project-badge">🏆 ${project.badge}</span>` : ''}
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <h2 class="modal-title" style="margin-bottom:4px;">${project.title}</h2>
          <span class="chip" style="background:var(--butter); font-weight:800;">${project.year}</span>
        </div>
        <p style="font-weight:700; color:var(--text-muted); margin-bottom:8px;">${project.tagline}</p>

        <div class="project-chip-row">
          <span class="chip" style="background:var(--blush); font-weight:800;">${team}</span>
          ${rolesHtml}
        </div>
        <div class="project-chip-row">${toolsHtml}</div>

        ${thumbsHtml}

        <p style="font-size:0.92rem; line-height:1.5; margin-bottom:12px;">${project.description}</p>

        <h4 style="font-family:var(--font-display); margin-bottom:6px; color:var(--ink);">My Role & Contributions:</h4>
        <ul style="padding-left:18px; font-size:0.88rem; line-height:1.45; margin-bottom:14px; color:var(--ink);">
          ${contribsHtml}
        </ul>

        ${project.collaborators ? `<p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:12px;"><strong>Collaborators:</strong> ${project.collaborators}</p>` : ''}

        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:8px;">
          ${linkBtn(links.play, 'Play now 🎮', 'accent-butter')}
          ${linkBtn(links.trailer, 'Trailer 🎬', 'accent-peach')}
          ${linkBtn(links.video, 'Gameplay video ▶', 'accent-lavender')}
          ${linkBtn(links.repo, 'GitHub Code 💻', 'accent-sky')}
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

    // Gallery thumbnails swap the main image
    const mainImg = this.element.querySelector('#project-main-img') as HTMLImageElement | null;
    this.element.querySelectorAll<HTMLImageElement>('.project-thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const img = images[Number(thumb.dataset.idx)];
        if (!img || !mainImg) return;
        mainImg.src = img.src;
        mainImg.alt = img.alt;
        this.element.querySelectorAll('.project-thumb').forEach((t) => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });

    // Load the YouTube player only when asked (keeps the card light)
    this.element.querySelector('#project-play-btn')?.addEventListener('click', () => {
      const media = this.element.querySelector('#project-media');
      if (!media || !videoId) return;
      media.querySelector('#project-main-img')?.remove();
      media.querySelector('#project-play-btn')?.remove();
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
      iframe.title = `${project.title} ${isTrailer ? 'trailer' : 'video'}`;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      media.prepend(iframe);
    });
  }
}
