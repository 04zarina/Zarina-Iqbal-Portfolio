import projectsData from '../../content/projects.json';
import type { Project } from '../content/types';
import skillsData from '../../content/skills.json';
import eduData from '../../content/education.json';
import expData from '../../content/experience.json';
import achievementsData from '../../content/achievements.json';

// Theme Toggle
const themeBtn = document.getElementById('classic-theme-btn');
let currentTheme = localStorage.getItem('theme_preference') || 'day';
document.documentElement.setAttribute('data-theme', currentTheme);
updateThemeBtnText();

themeBtn?.addEventListener('click', () => {
  currentTheme = currentTheme === 'day' ? 'dusk' : 'day';
  localStorage.setItem('theme_preference', currentTheme);
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeBtnText();
});

function updateThemeBtnText() {
  if (themeBtn) {
    themeBtn.innerText = currentTheme === 'dusk' ? '☀️ Day Mode' : '🌙 Dusk Mode';
  }
}

// 1. Render Projects with Search
const projectContainer = document.getElementById('classic-project-list')!;
const searchInput = document.getElementById('project-search') as HTMLInputElement;

function renderProjects(filterText: string = '') {
  projectContainer.innerHTML = '';
  const filtered = projectsData.filter((p) => {
    const f = filterText.toLowerCase();
    return p.title.toLowerCase().includes(f) || p.tags.some((t) => t.toLowerCase().includes(f)) || p.tools.some((t) => t.toLowerCase().includes(f));
  });

  (filtered as Project[]).forEach((p) => {
    const links = p.links ?? {};
    const card = document.createElement('div');
    card.className = 'project-item';
    const cover = p.images?.[0];
    const team = p.teamSize === 1 ? 'Solo' : `Team of ${p.teamSize}`;
    card.innerHTML = `
      <div>
        ${cover ? `<img src="${cover.src}" alt="${cover.alt}" loading="lazy" style="width:100%; aspect-ratio:16/9; object-fit:cover; border-radius:12px; border:2px solid var(--cocoa); margin-bottom:10px; background:#2A1C38;" />` : ''}
        ${p.badge ? `<span class="chip" style="background:var(--blush); font-size:0.75rem; margin-bottom:6px;">🏆 ${p.badge}</span>` : ''}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <h3 style="font-family:var(--font-display); font-size:1.2rem;">${p.title}</h3>
          <span class="chip" style="background:var(--butter);">${p.year}</span>
        </div>
        <p style="font-size:0.88rem; font-weight:700; color:var(--text-muted); margin-bottom:6px;">${p.tagline}</p>
        <p style="font-size:0.8rem; margin-bottom:8px;"><strong>${team}</strong> · ${p.roles.join(', ')}</p>
        <p style="font-size:0.86rem; line-height:1.45; margin-bottom:12px;">${p.description}</p>
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px;">
          ${p.tools.map((t) => `<span class="chip" style="font-size:0.75rem;">${t}</span>`).join('')}
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        ${links.play ? `<a href="${links.play}" target="_blank" rel="noreferrer" class="sticker-btn accent-mint" style="padding:4px 12px; font-size:0.8rem;">Play now</a>` : ''}
        ${links.trailer ? `<a href="${links.trailer}" target="_blank" rel="noreferrer" class="sticker-btn accent-peach" style="padding:4px 12px; font-size:0.8rem;">Trailer</a>` : ''}
        ${links.video ? `<a href="${links.video}" target="_blank" rel="noreferrer" class="sticker-btn accent-lavender" style="padding:4px 12px; font-size:0.8rem;">Video</a>` : ''}
        ${links.repo ? `<a href="${links.repo}" target="_blank" rel="noreferrer" class="sticker-btn accent-sky" style="padding:4px 12px; font-size:0.8rem;">Code</a>` : ''}
      </div>
    `;
    projectContainer.appendChild(card);
  });
}

searchInput?.addEventListener('input', (e) => {
  renderProjects((e.target as HTMLInputElement).value);
});
renderProjects();

// 2. Render Skills
const skillsContainer = document.getElementById('classic-skills-list')!;
skillsData.forEach((s) => {
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.style.cssText = 'padding:8px 14px; font-size:0.88rem; background:var(--cream);';
  chip.innerHTML = `<strong>${s.name}</strong> <span style="opacity:0.7;">(${s.category})</span>`;
  chip.title = s.blurb;
  skillsContainer.appendChild(chip);
});

// 3. Render Education & Experience
const timelineContainer = document.getElementById('classic-timeline-list')!;
timelineContainer.innerHTML = `
  <h3 style="font-family:var(--font-display); margin-bottom:8px;">Experience</h3>
  ${expData.map((e) => `
    <div style="margin-bottom:14px; padding-left:12px; border-left:3px solid var(--cocoa);">
      <div style="font-weight:700;">${e.title} — ${e.org}</div>
      <div style="font-size:0.82rem; color:var(--text-muted);">${e.start === e.end ? e.start : `${e.start} - ${e.end}`}</div>
      <div style="font-size:0.88rem; margin-top:4px;">${e.summary}</div>
    </div>
  `).join('')}

  <h3 style="font-family:var(--font-display); margin:18px 0 8px 0;">Education</h3>
  ${eduData.map((ed) => `
    <div style="margin-bottom:14px; padding-left:12px; border-left:3px solid var(--cocoa);">
      <div style="font-weight:700;">${ed.title} — ${ed.org}</div>
      <div style="font-size:0.82rem; color:var(--text-muted);">${ed.start === ed.end ? ed.start : `${ed.start} - ${ed.end}`}</div>
      <div style="font-size:0.88rem; margin-top:4px;">${ed.summary}</div>
    </div>
  `).join('')}
`;

// 4. Certificates
const certList = document.getElementById('classic-cert-list');
if (certList) {
  certList.innerHTML = achievementsData
    .filter((a) => a.id.startsWith('cert-'))
    .map((a) => `<li><strong>${a.title}</strong> — ${a.summary}</li>`)
    .join('');
}

// 5. Form Submit
document.getElementById('classic-contact-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  alert('Thank you! Your letter has been posted to Zarina.');
  (e.target as HTMLFormElement).reset();
});
