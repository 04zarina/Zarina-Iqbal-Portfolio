import skillsData from '../../content/skills.json';
import { Modal, esc } from './modal';

interface Skill {
  id: string;
  name: string;
  category: string;
  level: number;
  blurb: string;
  plantGroup: string;
}

const skills = skillsData as Skill[];

export const SKILL_GARDENS: { group: string; label: string; emoji: string; color: string }[] = [
  { group: 'engines', label: 'Engines', emoji: '🎮', color: '#FFB3C7' },
  { group: 'languages', label: 'Languages', emoji: '💻', color: '#BDEBD3' },
  { group: 'web', label: 'Web & Systems', emoji: '🌐', color: '#FFE9A3' },
  { group: '3d', label: '3D & Animation', emoji: '🎨', color: '#BDE0FF' },
  { group: 'tools', label: 'Tools & People', emoji: '🧰', color: '#D9C8FF' }
];

/** Skills only, grouped by garden bed. Opened from the Greenhouse plants. */
export class SkillsOverlay extends Modal {
  private active = 'all';

  constructor() {
    super('skills', 'Skills', 760);
  }

  protected render(arg?: unknown): void {
    let highlight: string | null = null;
    if (typeof arg === 'string') {
      const bySkill = skills.find((s) => s.id === arg);
      if (bySkill) {
        this.active = bySkill.plantGroup;
        highlight = bySkill.id;
      } else if (SKILL_GARDENS.some((g) => g.group === arg)) {
        this.active = arg;
      }
    } else {
      this.active = 'all';
    }

    const tabs = [{ group: 'all', label: 'All', emoji: '🌱', color: '#FFF6EC' }, ...SKILL_GARDENS];
    this.card.innerHTML = `
      <h2 class="modal-title">🌿 Skill Garden</h2>
      <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:10px;">Each plant is a skill. Dots show how confident I am (out of 5).</p>
      <div role="tablist" aria-label="Skill categories" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
        ${tabs
          .map(
            (t) =>
              `<button type="button" role="tab" class="starter-chip${t.group === this.active ? ' active' : ''}" aria-selected="${t.group === this.active}" data-group="${t.group}" style="background:${t.color};">${t.emoji} ${t.label}</button>`
          )
          .join('')}
      </div>
      <div class="skills-list"></div>`;

    this.card.querySelectorAll<HTMLButtonElement>('[data-group]').forEach((b) =>
      b.addEventListener('click', () => {
        this.active = b.dataset.group!;
        this.card.querySelectorAll<HTMLButtonElement>('[data-group]').forEach((x) => {
          x.classList.toggle('active', x === b);
          x.setAttribute('aria-selected', String(x === b));
        });
        this.renderList(null);
      })
    );
    this.renderList(highlight);
  }

  private renderList(highlight: string | null): void {
    const list = this.card.querySelector('.skills-list')!;
    const gardens = SKILL_GARDENS.filter((g) => this.active === 'all' || g.group === this.active);
    list.innerHTML = gardens
      .map((g) => {
        const items = skills.filter((s) => s.plantGroup === g.group);
        return `
        <section style="margin-bottom:14px;">
          <h3 style="font-family:var(--font-display); font-size:1rem; margin-bottom:6px;">${g.emoji} ${g.label}</h3>
          <div class="skills-grid">
            ${items
              .map(
                (s) => `
              <article class="skill-tile${s.id === highlight ? ' highlight' : ''}" id="tile-${s.id}" style="--accent:${g.color};">
                <div style="display:flex; justify-content:space-between; gap:8px; align-items:baseline;">
                  <strong>${esc(s.name)}</strong>
                  <span class="skill-dots" aria-label="${s.level} out of 5">${'●'.repeat(s.level)}${'○'.repeat(5 - s.level)}</span>
                </div>
                <p>${esc(s.blurb)}</p>
              </article>`
              )
              .join('')}
          </div>
        </section>`;
      })
      .join('');
    if (highlight) requestAnimationFrame(() => list.querySelector(`#tile-${highlight}`)?.scrollIntoView({ block: 'center' }));
  }
}
