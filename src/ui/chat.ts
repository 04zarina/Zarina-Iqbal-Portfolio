import { store } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import projectsData from '../../content/projects.json';
import { profile } from '../content/profile';

export class ChatPanel {
  private element: HTMLElement;
  private messageList: HTMLElement;
  private inputField: HTMLInputElement;
  private sendBtn: HTMLButtonElement;

  private starters = [
    'What games has Zarina made?',
    'What are Zarina\'s main skills?',
    'Tell me about Zarina\'s background!',
    'Can I download the resume?'
  ];

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'chat-window';

    this.element.innerHTML = `
      <div class="chat-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>🐾</span>
          <span>Mochi AI (Companion)</span>
        </div>
        <button class="modal-close-btn" id="chat-close-btn" style="position:static; width:30px; height:30px; font-size:0.9rem;">✕</button>
      </div>

      <div class="chat-messages" id="chat-messages">
        <div class="chat-bubble bot">
          Purr! I'm Mochi, Zarina's companion. Ask me anything about Zarina's games, skills, studies or experience! 🐾
        </div>
        <div class="chat-starters" id="chat-starters"></div>
      </div>

      <div class="chat-input-row">
        <input type="text" id="chat-input" placeholder="Ask Mochi a question..." maxlength="200" />
        <button class="sticker-btn accent-butter" id="chat-send-btn" style="padding:6px 16px; font-size:0.9rem;">Send</button>
      </div>
    `;

    document.body.appendChild(this.element);
    this.messageList = this.element.querySelector('#chat-messages')!;
    this.inputField = this.element.querySelector('#chat-input')!;
    this.sendBtn = this.element.querySelector('#chat-send-btn')!;

    this.renderStarters();
    this.initEvents();
  }

  private renderStarters(): void {
    const startersContainer = this.element.querySelector('#chat-starters')!;
    startersContainer.innerHTML = '';
    this.starters.forEach((q) => {
      const chip = document.createElement('button');
      chip.className = 'starter-chip';
      chip.innerText = q;
      chip.onclick = () => {
        this.inputField.value = q;
        this.sendMessage();
      };
      startersContainer.appendChild(chip);
    });
  }

  private initEvents(): void {
    this.element.querySelector('#chat-close-btn')?.addEventListener('click', () => this.close());
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });

    eventBus.on('overlay:open', (name: string) => {
      if (name === 'chat') this.open();
    });
  }

  open(): void {
    this.element.classList.add('active');
    store.set('inputLocked', true);
    setTimeout(() => this.inputField.focus(), 150);
  }

  close(): void {
    this.element.classList.remove('active');
    store.set('activeOverlay', 'none');
    store.set('inputLocked', false);
    audioManager.playPop();
  }

  private async sendMessage(): Promise<void> {
    const text = this.inputField.value.trim();
    if (!text) return;

    audioManager.playPop();
    this.appendMessage('user', text);
    this.inputField.value = '';

    // Typing / thinking bubble
    const thinkingBubble = document.createElement('div');
    thinkingBubble.className = 'chat-bubble bot';
    thinkingBubble.innerText = 'Mochi is thinking... 🐾';
    this.messageList.appendChild(thinkingBubble);
    this.scrollToBottom();
    eventBus.emit('mochi:typing');

    try {
      // 1. Try serverless backend endpoint POST /api/chat
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (response.ok) {
        const data = await response.json();
        thinkingBubble.remove();
        this.appendMessage('bot', data.answer, data.sources);
        return;
      }
    } catch {
      // Fallback to grounded local retrieval below
    }

    // 2. Grounded Local Retrieval Fallback (Ensures chatbot functions seamlessly in all environments)
    thinkingBubble.remove();
    const localAnswer = this.getLocalGroundedAnswer(text);
    this.appendMessage('bot', localAnswer.text, localAnswer.sources);
  }

  private getLocalGroundedAnswer(query: string): { text: string; sources: { title: string; targetId: string }[] } {
    const q = query.toLowerCase();

    // Resume
    if (q.includes('resume') || q.includes('cv') || q.includes('download')) {
      return {
        text: `Yes! Zarina's resume is on the desk in the Study Nook (press E on it), or download it straight away from ${profile.resume}. It's also in the pause menu. 📄`,
        sources: [{ title: 'Study Nook Resume', targetId: 'DOOR_study' }]
      };
    }

    // Check games / projects
    if (q.includes('game') || q.includes('project') || q.includes('cabinet') || q.includes('made') || q.includes('play')) {
      const featured = projectsData.filter((p) => p.featured).map((p) => p.title).join(', ');
      return {
        text: `Zarina's featured games are on the arcade cabinets: ${featured}. You can play The Floor Is A Liar and Oakridge Hollow live in the browser! There are ${projectsData.length} projects in total, so use Next on any cabinet card to browse the rest.`,
        sources: [{ title: 'Arcade Room Cabinets', targetId: 'DOOR_gameRoom' }]
      };
    }

    // Check skills
    if (q.includes('skill') || q.includes('tool') || q.includes('language') || q.includes('unity') || q.includes('unreal') || q.includes('three') || q.includes('blender') || q.includes('vr')) {
      return {
        text: `Zarina builds in Unreal Engine 5 (Blueprints), Unity with C# including VR/XR, and Three.js / React Three Fiber, plus TypeScript, Python, C++, Blender and After Effects. Visit the Greenhouse to see which project proves each skill!`,
        sources: [{ title: 'Greenhouse Skill Garden', targetId: 'DOOR_greenhouse' }]
      };
    }

    // Check contact
    if (q.includes('contact') || q.includes('email') || q.includes('hire') || q.includes('touch') || q.includes('reach') || q.includes('linkedin')) {
      return {
        text: `You can email Zarina at ${profile.email}, connect on LinkedIn (${profile.socials.linkedin}), or drop a letter in the mailbox on the Dev Realm island. ${profile.availability}`,
        sources: [{ title: 'Dev Realm Mailbox', targetId: 'DOOR_devRealm' }]
      };
    }

    // Check background / education
    if (q.includes('education') || q.includes('school') || q.includes('degree') || q.includes('university') || q.includes('experience') || q.includes('work') || q.includes('intern') || q.includes('background')) {
      return {
        text: `Zarina is in the final year of a BS in Computer Science (Gaming & Animation) at NED University, CGPA 3.657, and is currently a Game Developer Intern at Aerox ERP working on web and 3D interactions. Before that, a four-week IT internship at KDA. See the timeline on the Study corkboard!`,
        sources: [{ title: 'Study Nook Corkboard', targetId: 'DOOR_study' }]
      };
    }

    // Anti-hallucination safe response
    return {
      text: `Mew! I don't have that specific information about Zarina in my notes. You can email ${profile.email} or drop a letter in the mailbox on the Dev Realm island! 📬`,
      sources: [{ title: 'Dev Realm Mailbox', targetId: 'DOOR_devRealm' }]
    };
  }

  private appendMessage(role: 'user' | 'bot', text: string, sources?: { title: string; targetId?: string; n?: number; excerpt?: string }[]): void {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    // The model sometimes adds light markdown; show plain text
    if (role === 'bot') text = text.replace(/\*\*?([^*]+)\*\*?/g, '$1');
    bubble.innerText = text;
    if (role === 'bot') eventBus.emit('mochi:say', text);

    if (sources && sources.length > 0) {
      const srcWrap = document.createElement('div');
      srcWrap.style.cssText = 'margin-top:8px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;';
      const label = document.createElement('span');
      label.style.cssText = 'font-size:0.7rem; font-weight:700; opacity:0.7;';
      label.innerText = 'Sources:';
      srcWrap.appendChild(label);
      sources.forEach((s) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'starter-chip';
        if (s.excerpt) chip.title = s.excerpt;
        chip.style.cssText = 'background:var(--mint); font-size:0.75rem;';
        chip.innerText = s.n ? `[${s.n}] ${s.title}` : `📌 ${s.title}`;
        chip.onclick = () => {
          this.close();
          if (s.targetId?.startsWith('DOOR_')) {
            eventBus.emit('room:travel', s.targetId.replace('DOOR_', ''));
          } else if (s.targetId) {
            eventBus.emit('toast:show', `Traveling to ${s.title}...`);
          }
        };
        srcWrap.appendChild(chip);
      });
      bubble.appendChild(srcWrap);
    }

    this.messageList.appendChild(bubble);
    this.scrollToBottom();
    if (role === 'bot') audioManager.playPop();
  }

  private scrollToBottom(): void {
    this.messageList.scrollTop = this.messageList.scrollHeight;
  }
}
