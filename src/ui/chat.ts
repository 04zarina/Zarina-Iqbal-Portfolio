import { store } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import projectsData from '../../content/projects.json';
import skillsData from '../../content/skills.json';

export class ChatPanel {
  private element: HTMLElement;
  private messageList: HTMLElement;
  private inputField: HTMLInputElement;
  private sendBtn: HTMLButtonElement;

  private starters = [
    'What games has Alex made?',
    'What are Alex\'s main skills?',
    'Tell me about Alex\'s background!',
    'How can I get in touch?'
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
          Purr! I'm Mochi, Alex's companion. Ask me anything about Alex's games, skills, academic background, or journey! 🐾
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

    // Check games / projects
    if (q.includes('game') || q.includes('project') || q.includes('cabinet') || q.includes('made')) {
      const titles = projectsData.map((p) => p.title).join(', ');
      return {
        text: `Alex has created 5 awesome games showcased on the arcade cabinets: ${titles}! You can walk into the Arcade Room and press E on any cabinet to play their demos!`,
        sources: [{ title: 'Arcade Room Cabinets', targetId: 'DOOR_game' }]
      };
    }

    // Check skills
    if (q.includes('skill') || q.includes('tool') || q.includes('language') || q.includes('unity') || q.includes('three') || q.includes('blender')) {
      return {
        text: `Alex specializes in Unity (C#), Three.js & WebGL, Godot 4, C++, and Blender 3D modeling and rigging. You can inspect all skill trees in the Greenhouse Balcony!`,
        sources: [{ title: 'Greenhouse Skill Garden', targetId: 'DOOR_greenhouse' }]
      };
    }

    // Check contact
    if (q.includes('contact') || q.includes('email') || q.includes('hire') || q.includes('touch') || q.includes('reach')) {
      return {
        text: `You can send Alex a letter directly through the cozy heart-shaped Mailbox in the bedroom! You can also reach out via email at alex.morgan.portfolio@example.com.`,
        sources: [{ title: 'Bedroom Mailbox', targetId: 'mailbox' }]
      };
    }

    // Check background / education
    if (q.includes('education') || q.includes('school') || q.includes('degree') || q.includes('experience') || q.includes('work') || q.includes('intern')) {
      return {
        text: `Alex is graduating with a B.S. in Computer Science (Game Engineering & Graphics) with a 3.89 GPA, and previously interned as a Gameplay Engineer at Moonlit Valley Studios. You can explore the timeline on the Corkboard in the Study Nook!`,
        sources: [{ title: 'Study Nook Corkboard', targetId: 'DOOR_study' }]
      };
    }

    // Anti-hallucination safe response
    return {
      text: `Mew! I don't have that specific information about Alex in my notes. Please write a letter to Alex directly using the mailbox in the bedroom! 📬`,
      sources: [{ title: 'Mailbox', targetId: 'mailbox' }]
    };
  }

  private appendMessage(role: 'user' | 'bot', text: string, sources?: { title: string; targetId?: string }[]): void {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.innerText = text;

    if (sources && sources.length > 0) {
      const srcWrap = document.createElement('div');
      srcWrap.style.cssText = 'margin-top:8px; display:flex; flex-wrap:wrap; gap:4px;';
      sources.forEach((s) => {
        const chip = document.createElement('span');
        chip.className = 'starter-chip';
        chip.style.cssText = 'background:var(--mint); font-size:0.75rem;';
        chip.innerText = `📌 ${s.title}`;
        chip.onclick = () => {
          this.close();
          if (s.targetId?.startsWith('DOOR_')) {
            eventBus.emit('room:switch', s.targetId.replace('DOOR_', ''));
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
