import { store } from '../core/store';
import { eventBus } from '../core/events';
import { audioManager } from '../audio/audioManager';
import projectsData from '../../content/projects.json';
import { profile } from '../content/profile';

type Lang = 'en' | 'ur';

/** UI text in English and Urdu (Zuzu's chat can switch language). */
const T: Record<Lang, { title: string; hello: string; placeholder: string; send: string; thinking: string; starters: string[]; sources: string; mic: string; speak: string }> = {
  en: {
    title: 'Zuzu AI (Companion)',
    hello: "Purr! I'm Zuzu, Zarina's companion. Ask me anything about Zarina's games, skills, studies or experience! 🐾",
    placeholder: 'Ask Zuzu a question...',
    send: 'Send',
    thinking: 'Zuzu is thinking... 🐾',
    starters: ['What games has Zarina made?', "What are Zarina's main skills?", "Tell me about Zarina's background!", 'Can I download the resume?'],
    sources: 'Sources:',
    mic: 'Ask by voice',
    speak: 'Read answers aloud'
  },
  ur: {
    title: 'زوزو اے آئی (ساتھی)',
    hello: 'میاؤں! میں زوزو ہوں، زرینہ کی ساتھی۔ زرینہ کے گیمز، اسکلز، تعلیم یا تجربے کے بارے میں کچھ بھی پوچھیں! 🐾',
    placeholder: 'زوزو سے سوال پوچھیں...',
    send: 'بھیجیں',
    thinking: 'زوزو سوچ رہی ہے... 🐾',
    starters: ['زرینہ نے کون سے گیمز بنائے ہیں؟', 'زرینہ کی اہم اسکلز کیا ہیں؟', 'زرینہ کے پس منظر کے بارے میں بتائیں', 'کیا میں ریزیومے ڈاؤن لوڈ کر سکتا ہوں؟'],
    sources: 'حوالے:',
    mic: 'آواز سے پوچھیں',
    speak: 'جواب سنائیں'
  }
};

function readLang(): Lang {
  try {
    return localStorage.getItem('zuzu_lang') === 'ur' ? 'ur' : 'en';
  } catch {
    return 'en';
  }
}

type SpeechRec = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export class ChatPanel {
  private element: HTMLElement;
  private messageList: HTMLElement;
  private inputField: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private lang: Lang = readLang();
  private speakAnswers = false;
  private recognition: SpeechRec | null = null;
  private listening = false;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'chat-window';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', 'Chat with Zuzu');

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const canSpeak = typeof Audio !== 'undefined';

    this.element.innerHTML = `
      <div class="chat-header">
        <div style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span>🐾</span>
          <span id="chat-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <div class="chat-lang" role="group" aria-label="Chat language">
            <button type="button" data-lang="en" lang="en">EN</button>
            <button type="button" data-lang="ur" lang="ur">اردو</button>
          </div>
          ${canSpeak ? '<button type="button" class="chat-icon-btn" id="chat-speak-btn" aria-pressed="false">🔈</button>' : ''}
          <button class="modal-close-btn" id="chat-close-btn" aria-label="Close chat" style="position:static; width:30px; height:30px; font-size:0.9rem;">✕</button>
        </div>
      </div>

      <div class="chat-messages" id="chat-messages" aria-live="polite">
        <div class="chat-bubble bot" id="chat-hello"></div>
        <div class="chat-starters" id="chat-starters"></div>
      </div>

      <div class="chat-input-row">
        ${SR ? '<button type="button" class="chat-icon-btn" id="chat-mic-btn">🎤</button>' : ''}
        <input type="text" id="chat-input" maxlength="200" />
        <button class="sticker-btn accent-butter" id="chat-send-btn" style="padding:6px 16px; font-size:0.9rem;"></button>
      </div>
    `;

    document.body.appendChild(this.element);
    this.messageList = this.element.querySelector('#chat-messages')!;
    this.inputField = this.element.querySelector('#chat-input')!;
    this.sendBtn = this.element.querySelector('#chat-send-btn')!;

    if (SR) {
      this.recognition = new SR() as SpeechRec;
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;
      this.recognition.onresult = (e: any) => {
        const said = e.results?.[0]?.[0]?.transcript as string | undefined;
        if (said) {
          this.inputField.value = said;
          this.sendMessage();
        }
      };
      this.recognition.onend = () => this.setListening(false);
      this.recognition.onerror = () => this.setListening(false);
    }

    this.applyLang();
    this.initEvents();
  }

  /** Switch every label, the greeting and the starter questions to the chosen language. */
  private applyLang(): void {
    const t = T[this.lang];
    const rtl = this.lang === 'ur';
    this.element.querySelector('#chat-title')!.textContent = t.title;
    const hello = this.element.querySelector('#chat-hello') as HTMLElement;
    hello.textContent = t.hello;
    hello.dir = rtl ? 'rtl' : 'ltr';
    this.inputField.placeholder = t.placeholder;
    this.inputField.dir = rtl ? 'rtl' : 'ltr';
    this.inputField.lang = this.lang;
    this.sendBtn.textContent = t.send;
    const mic = this.element.querySelector('#chat-mic-btn') as HTMLButtonElement | null;
    if (mic) mic.title = mic.ariaLabel = t.mic;
    const speak = this.element.querySelector('#chat-speak-btn') as HTMLButtonElement | null;
    if (speak) speak.title = speak.ariaLabel = t.speak;
    this.element.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => {
      const on = b.dataset.lang === this.lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    this.renderStarters();
  }

  private setLang(lang: Lang): void {
    if (lang === this.lang) return;
    this.lang = lang;
    try {
      localStorage.setItem('zuzu_lang', lang);
    } catch {
      /* private mode */
    }
    audioManager.playPop();
    this.applyLang();
    eventBus.emit('zuzu:say', lang === 'ur' ? 'اب میں اردو میں بات کروں گی! 🐾' : "Okay, back to English! 🐾");
  }

  private setListening(on: boolean): void {
    this.listening = on;
    const mic = this.element.querySelector('#chat-mic-btn');
    mic?.classList.toggle('listening', on);
  }

  private toggleMic(): void {
    if (!this.recognition) return;
    if (this.listening) {
      this.recognition.stop();
      return;
    }
    this.recognition.lang = this.lang === 'ur' ? 'ur-PK' : 'en-US';
    try {
      this.recognition.start();
      this.setListening(true);
    } catch {
      this.setListening(false);
    }
  }

  /**
   * Read Zuzu's answer aloud. Uses the /api/tts voice (real Urdu, cute style) and
   * falls back to the browser voice, raised in pitch, when that is unavailable.
   */
  private audio: HTMLAudioElement | null = null;
  private speakSeq = 0;
  private stopSpeaking(): void {
    this.speakSeq++;
    this.audio?.pause();
    this.audio = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  private voicesReady(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve([]);
      const have = speechSynthesis.getVoices();
      if (have.length) return resolve(have);
      const done = () => resolve(speechSynthesis.getVoices());
      speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1200);
    });
  }

  private async speak(text: string): Promise<void> {
    if (!this.speakAnswers) return;
    this.stopSpeaking();
    const seq = this.speakSeq;
    const clean = text.replace(/\[\d+\]/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    if (!clean) return;
    const voices = await this.voicesReady();
    if (seq !== this.speakSeq) return;
    const urduVoice = voices.find((v) => /^ur/i.test(v.lang) || /urdu|uzma|asad/i.test(v.name));

    // Urdu: a real Urdu voice from the device (Edge/Windows/Android/Apple have them) sounds best
    const speakInBrowser = (voice?: SpeechSynthesisVoice) => {
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = this.lang === 'ur' ? 'ur-PK' : 'en-US';
      if (voice) u.voice = voice;
      u.rate = 1.0;
      u.pitch = 1.35;
      speechSynthesis.speak(u);
    };
    if (this.lang === 'ur' && urduVoice) return speakInBrowser(urduVoice);

    // Otherwise the cute server voice (speaks Urdu properly too)
    try {
      const r = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, lang: this.lang })
      });
      if (r.ok) {
        const { audio, mime } = await r.json();
        if (seq !== this.speakSeq || !this.speakAnswers) return;
        const a = new Audio(`data:${mime || 'audio/wav'};base64,${audio}`);
        a.playbackRate = 1.08;
        (a as any).preservesPitch = false;
        this.audio = a;
        await a.play();
        return;
      }
    } catch {
      /* fall through */
    }
    if (seq !== this.speakSeq) return;
    if (this.lang === 'ur') {
      eventBus.emit('toast:show', 'No Urdu voice found on this device, so Zuzu will stay quiet. Try Microsoft Edge, which has Urdu voices. 🔇');
      return;
    }
    const en = voices.find((v) => /^en/i.test(v.lang) && /female|samantha|zira|aria|jenny|google us english/i.test(v.name)) || voices.find((v) => /^en/i.test(v.lang));
    speakInBrowser(en);
  }

  private renderStarters(): void {
    const startersContainer = this.element.querySelector('#chat-starters')!;
    startersContainer.innerHTML = '';
    T[this.lang].starters.forEach((q) => {
      const chip = document.createElement('button');
      chip.className = 'starter-chip';
      chip.innerText = q;
      chip.dir = this.lang === 'ur' ? 'rtl' : 'ltr';
      chip.onclick = () => {
        this.inputField.value = q;
        this.sendMessage();
      };
      startersContainer.appendChild(chip);
    });
  }

  private initEvents(): void {
    this.element.querySelector('#chat-close-btn')?.addEventListener('click', () => this.close());
    this.element.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => b.addEventListener('click', () => this.setLang(b.dataset.lang as Lang)));
    this.element.querySelector('#chat-mic-btn')?.addEventListener('click', () => this.toggleMic());
    const speakBtn = this.element.querySelector('#chat-speak-btn') as HTMLButtonElement | null;
    speakBtn?.addEventListener('click', () => {
      this.speakAnswers = !this.speakAnswers;
      speakBtn.textContent = this.speakAnswers ? '🔊' : '🔈';
      speakBtn.setAttribute('aria-pressed', String(this.speakAnswers));
      if (!this.speakAnswers) this.stopSpeaking();
    });
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
    this.stopSpeaking();
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
    thinkingBubble.innerText = T[this.lang].thinking;
    this.messageList.appendChild(thinkingBubble);
    this.scrollToBottom();
    eventBus.emit('zuzu:typing');

    try {
      // 1. Try serverless backend endpoint POST /api/chat
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, lang: this.lang })
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
    const localAnswer = this.lang === 'ur' || /[\u0600-\u06FF]/.test(text) ? this.getLocalUrduAnswer(text) : this.getLocalGroundedAnswer(text);
    this.appendMessage('bot', localAnswer.text, localAnswer.sources);
  }

  /** Offline answers in Urdu, used when the chat server can't be reached. */
  private getLocalUrduAnswer(query: string): { text: string; sources: { title: string; targetId: string }[] } {
    const has = (...w: string[]) => w.some((x) => query.includes(x));
    if (has('ریزیوم', 'ریزومے', 'سی وی', 'resume', 'cv', 'ڈاؤن لوڈ')) {
      return {
        text: `جی ہاں! زرینہ کا ریزیومے اسٹڈی نُک کی میز پر رکھا ہے (اس پر E دبائیں)، یا سیدھا ${profile.resume} سے ڈاؤن لوڈ کر لیں۔ یہ پاز مینو میں بھی ہے۔ 📄`,
        sources: [{ title: 'Study Nook Resume', targetId: 'DOOR_study' }]
      };
    }
    if (has('کمیونٹی', 'قیادت', 'سرگرمی', 'سرگرمیاں', 'تقریب', 'ایونٹ', 'گیم کون')) {
      return {
        text: 'کیمپس کی زندگی میں زرینہ بہت فعال ہیں: GameVerse سوسائٹی کی ایونٹس اور لاجسٹکس ٹیم کا حصہ، دونوں ایڈیشنز میں اس کے مرکزی ایونٹ GameCon کی میزبان، ایک سال SENTEC کی رکن، اور MPERC ایونٹ کی آرگنائزنگ ٹیم میں شامل۔ بیڈروم کی کمیونٹی وال بھی دیکھیں! 🎉',
        sources: [{ title: 'Community wall (Bedroom)', targetId: 'DOOR_bedroom' }]
      };
    }
    if (has('گیم', 'کھیل', 'پروجیکٹ', 'پراجیکٹ', 'منصوب', 'آرکیڈ')) {
      const featured = projectsData.filter((p) => p.featured).map((p) => p.title).join('، ');
      return {
        text: `زرینہ کی نمایاں گیمز آرکیڈ کیبنٹس پر ہیں: ${featured}۔ کل ${projectsData.length} پروجیکٹس ہیں، باقی دیکھنے کے لیے کسی بھی کارڈ پر Next دبائیں۔ 🕹️`,
        sources: [{ title: 'Arcade Room Cabinets', targetId: 'DOOR_gameRoom' }]
      };
    }
    if (has('مہارت', 'ہنر', 'اسکل', 'ٹول', 'سافٹ ویئر', 'یونٹی', 'انریل')) {
      return {
        text: 'زرینہ Unreal Engine 5 (Blueprints)، Unity (C#، VR/XR) اور Three.js / React Three Fiber میں کام کرتی ہیں، ساتھ TypeScript، Python، C++، Blender اور After Effects بھی۔ ہر مہارت کا ثبوت گرین ہاؤس میں دیکھیں! 🌿',
        sources: [{ title: 'Greenhouse Skill Garden', targetId: 'DOOR_greenhouse' }]
      };
    }
    if (has('رابطہ', 'ای میل', 'ایمیل', 'لنکڈ', 'ملاز', 'نوکری کے لیے')) {
      return {
        text: `آپ زرینہ کو ${profile.email} پر ای میل کر سکتے ہیں، LinkedIn پر رابطہ کر سکتے ہیں، یا Dev Realm کے میل باکس میں خط ڈال سکتے ہیں۔ 📬`,
        sources: [{ title: 'Dev Realm Mailbox', targetId: 'DOOR_devRealm' }]
      };
    }
    if (has('تعلیم', 'یونیورسٹی', 'ڈگری', 'تجربہ', 'انٹرن', 'پس منظر', 'بارے', 'کون', 'پڑھ')) {
      return {
        text: 'زرینہ NED یونیورسٹی میں کمپیوٹر سائنس (گیمنگ اینڈ اینیمیشن) کے آخری سال میں ہیں اور اس وقت Aerox ERP میں گیم ڈویلپر انٹرن ہیں، جہاں ویب اور تھری ڈی انٹرایکشنز پر کام کر رہی ہیں۔ پوری ٹائم لائن اسٹڈی کی کارک بورڈ پر ہے! 📚',
        sources: [{ title: 'Study Nook Corkboard', targetId: 'DOOR_study' }]
      };
    }
    return {
      text: `میاؤ! یہ بات میرے نوٹس میں نہیں ہے۔ آپ ${profile.email} پر ای میل کر سکتے ہیں یا Dev Realm کے میل باکس میں خط ڈال سکتے ہیں! 📬`,
      sources: [{ title: 'Dev Realm Mailbox', targetId: 'DOOR_devRealm' }]
    };
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

    // Community / extracurriculars
    if (q.includes('communit') || q.includes('extra') || q.includes('activit') || q.includes('lead') || q.includes('event') || q.includes('gamecon') || q.includes('society') || q.includes('volunteer')) {
      return {
        text: "Beyond code, Zarina is active in campus life: part of the GameVerse society's events and logistics team, host of its flagship event GameCon at both editions, a member of SENTEC for a year, and part of the organizing team for the MPERC event. See the Community wall in the bedroom!",
        sources: [{ title: 'Community wall (Bedroom)', targetId: 'DOOR_bedroom' }]
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
    if (/[\u0600-\u06FF]/.test(text)) bubble.dir = 'rtl';
    if (role === 'bot') {
      eventBus.emit('zuzu:say', text);
      this.speak(text);
    }

    if (sources && sources.length > 0) {
      const srcWrap = document.createElement('div');
      srcWrap.style.cssText = 'margin-top:8px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;';
      const label = document.createElement('span');
      label.style.cssText = 'font-size:0.7rem; font-weight:700; opacity:0.7;';
      label.innerText = T[this.lang].sources;
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
