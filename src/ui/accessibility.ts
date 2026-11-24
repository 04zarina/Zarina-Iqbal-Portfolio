import { eventBus } from '../core/events';
import { clickSystem } from '../world/clickables';
import { interactionSystem } from '../world/interaction';

/** Accessibility help: display options, a screen-reader announcer and a keyboard-friendly list of everything usable in the room. */

export interface A11yPrefs {
  reduceMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
}

const KEY = 'a11y_prefs';
const ROOM_NAMES: Record<string, string> = {
  bedroom: 'Bedroom',
  gameRoom: 'Arcade room',
  greenhouse: 'Greenhouse',
  study: 'Study nook',
  devRealm: 'Dev Realm'
};

function load(): A11yPrefs {
  const osReduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base: A11yPrefs = { reduceMotion: osReduce, highContrast: false, largeText: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch {
    /* storage blocked: use defaults */
  }
  return base;
}

class Accessibility {
  prefs: A11yPrefs = load();
  private live!: HTMLElement;
  private panel!: HTMLElement;
  private list!: HTMLElement;
  private opener: HTMLElement | null = null;

  init(): void {
    this.live = document.createElement('div');
    this.live.className = 'sr-only';
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.live);

    this.buildPanel();
    this.apply();

    // Announce what the sighted see in toasts and when changing rooms
    eventBus.on('toast:show', (msg: string) => this.announce(msg));
    eventBus.on('room:entered', (id: string) => this.announce(`${ROOM_NAMES[id] ?? id}. Open the accessibility panel for a list of things you can use here.`));

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.panel.hidden) this.close();
    });

    // The 3D view gets a name and a way into the panel for keyboard users
    const canvas = document.querySelector<HTMLCanvasElement>('#canvas-container canvas');
    if (canvas) {
      canvas.setAttribute('role', 'application');
      canvas.setAttribute('aria-label', "Zarina's interactive game room. Move with WASD or the arrow keys. Press A for the accessibility panel, which lists everything you can use.");
      canvas.tabIndex = 0;
    }
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey && e.target === canvas) {
        e.preventDefault();
        this.open();
      }
    });
  }

  set(key: keyof A11yPrefs, value: boolean): void {
    this.prefs[key] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs));
    } catch {
      /* ignore */
    }
    this.apply();
  }

  private apply(): void {
    const c = document.documentElement.classList;
    c.toggle('a11y-reduce-motion', this.prefs.reduceMotion);
    c.toggle('a11y-contrast', this.prefs.highContrast);
    c.toggle('a11y-large-text', this.prefs.largeText);
    eventBus.emit('a11y:changed', this.prefs);
    this.panel?.querySelectorAll<HTMLInputElement>('input[data-pref]').forEach((i) => (i.checked = this.prefs[i.dataset.pref as keyof A11yPrefs]));
  }

  announce(text: string): void {
    // Clear first so repeated messages are read again
    this.live.textContent = '';
    window.setTimeout(() => (this.live.textContent = text.replace(/\s+/g, ' ')), 60);
  }

  private buildPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'a11y-panel';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'false');
    this.panel.setAttribute('aria-labelledby', 'a11y-title');
    this.panel.innerHTML = `
      <div class="a11y-head">
        <h2 id="a11y-title">♿ Accessibility</h2>
        <button type="button" class="a11y-close" aria-label="Close accessibility panel">✕</button>
      </div>
      <fieldset class="a11y-options">
        <legend>Display</legend>
        <label><input type="checkbox" data-pref="reduceMotion" /> Reduce motion (no bouncing, sparkles or animated backgrounds)</label>
        <label><input type="checkbox" data-pref="highContrast" /> High contrast</label>
        <label><input type="checkbox" data-pref="largeText" /> Larger text</label>
      </fieldset>
      <section>
        <h3>Things to use in this room</h3>
        <p class="a11y-hint">Pick one and Zarina walks over and uses it. No mouse needed.</p>
        <ul class="a11y-list"></ul>
      </section>
      <section>
        <h3>Keyboard</h3>
        <p class="a11y-hint">WASD or arrows to move, Shift to run, Space to hop or stand up, E to use what is next to her, Tab to reach the buttons, Esc to close things. A plain 2D version is at <a href="/classic">/classic</a>.</p>
      </section>`;
    document.body.appendChild(this.panel);
    this.list = this.panel.querySelector('.a11y-list')!;
    this.panel.querySelector('.a11y-close')!.addEventListener('click', () => this.close());
    this.panel.querySelectorAll<HTMLInputElement>('input[data-pref]').forEach((i) =>
      i.addEventListener('change', () => this.set(i.dataset.pref as keyof A11yPrefs, i.checked))
    );
  }

  open(from?: HTMLElement): void {
    this.opener = from ?? (document.activeElement as HTMLElement | null);
    this.refreshList();
    this.panel.hidden = false;
    this.panel.querySelector<HTMLElement>('input, button')?.focus();
  }

  close(): void {
    this.panel.hidden = true;
    this.opener?.focus?.();
  }

  private refreshList(): void {
    const raw: { label: string; run: () => void }[] = [];
    interactionSystem.list().forEach((i) => raw.push({ label: i.label, run: () => interactionSystem.activate(i) }));
    // Skip clickable objects that just repeat an entry ("Play X 🪙" vs "🕹️ X")
    const norm = (l: string) => l.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/^play /, '').trim();
    const names = raw.map((r) => norm(r.label));
    clickSystem.list().forEach((c) => {
      const n = norm(c.label);
      if (!n || names.some((x) => x === n || x.includes(n) || n.includes(x))) return;
      names.push(n);
      raw.push({ label: c.label, run: c.onClick });
    });
    // Same name on several things (bean bags, cabinets): number them so each is distinct
    const total = new Map<string, number>();
    raw.forEach((r) => total.set(r.label, (total.get(r.label) ?? 0) + 1));
    const count = new Map<string, number>();
    const entries = raw.map((r) => {
      if (total.get(r.label)! < 2) return r;
      const n = (count.get(r.label) ?? 0) + 1;
      count.set(r.label, n);
      return { ...r, label: `${r.label} (${n} of ${total.get(r.label)})` };
    });
    this.list.innerHTML = '';
    if (!entries.length) {
      this.list.innerHTML = '<li>Nothing to use right now.</li>';
      return;
    }
    entries.forEach(({ run, label }) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        this.close();
        run();
      });
      li.appendChild(b);
      this.list.appendChild(li);
    });
  }
}

export const accessibility = new Accessibility();
