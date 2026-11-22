import { store } from '../core/store';
import { eventBus } from '../core/events';
import { sendContact } from '../core/sendContact';
import { audioManager } from '../audio/audioManager';

export class ContactFormOverlay {
  private overlay: HTMLElement;
  private formTimestamp = Date.now();

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'contact-modal';

    this.overlay.innerHTML = `
      <div class="modal-card" style="max-width:520px; background:var(--cream); border:3px solid var(--cocoa);">
        <button class="modal-close-btn" id="contact-close-btn">✕</button>
        <h2 class="modal-title">📬 Send a Letter to Zarina</h2>
        <p style="font-size:0.92rem; color:var(--text-muted); margin-bottom:16px;">
          Drop a note into the studio mailbox! Whether you have a project idea, game jam invite, or just want to say hi.
        </p>

        <form id="contact-form" style="display:flex; flex-direction:column; gap:12px;">
          <!-- Honeypot -->
          <input type="text" name="website" style="display:none;" tabindex="-1" autocomplete="off" />
          <input type="hidden" name="ts" id="form-ts" value="${Date.now()}" />

          <div>
            <label style="font-family:var(--font-display); font-weight:700; font-size:0.85rem; display:block; margin-bottom:4px;">Your Name</label>
            <input type="text" name="name" required minlength="2" maxlength="80" placeholder="e.g. Robin" 
              style="width:100%; padding:10px 14px; border-radius:var(--radius-pill); border:2px solid var(--cocoa); font-family:var(--font-body); background:var(--surface-color);" />
          </div>

          <div>
            <label style="font-family:var(--font-display); font-weight:700; font-size:0.85rem; display:block; margin-bottom:4px;">Your Email Address</label>
            <input type="email" name="email" required maxlength="254" placeholder="robin@example.com"
              style="width:100%; padding:10px 14px; border-radius:var(--radius-pill); border:2px solid var(--cocoa); font-family:var(--font-body); background:var(--surface-color);" />
          </div>

          <div>
            <label style="font-family:var(--font-display); font-weight:700; font-size:0.85rem; display:block; margin-bottom:4px;">Subject</label>
            <input type="text" name="subject" required minlength="3" maxlength="120" placeholder="e.g. Game Dev Opportunity"
              style="width:100%; padding:10px 14px; border-radius:var(--radius-pill); border:2px solid var(--cocoa); font-family:var(--font-body); background:var(--surface-color);" />
          </div>

          <div>
            <label style="font-family:var(--font-display); font-weight:700; font-size:0.85rem; display:block; margin-bottom:4px;">Message</label>
            <textarea name="message" required minlength="10" maxlength="2000" rows="4" placeholder="Write your letter here..."
              style="width:100%; padding:10px 14px; border-radius:14px; border:2px solid var(--cocoa); font-family:var(--font-body); background:var(--surface-color); resize:vertical;"></textarea>
          </div>

          <div id="contact-status-msg" role="status" aria-live="polite" style="font-size:0.88rem; font-weight:700; display:none;"></div>

          <button type="submit" class="sticker-btn accent-butter" id="contact-submit-btn" style="margin-top:6px; padding:12px;">
            Post Letter in Mailbox ✉️
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.initEvents();
  }

  private initEvents(): void {
    this.overlay.querySelector('#contact-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    const form = this.overlay.querySelector('#contact-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit(form);
    });

    eventBus.on('overlay:open', (name: string) => {
      if (name === 'contact') this.open();
    });
  }

  open(): void {
    this.formTimestamp = Date.now();
    (this.overlay.querySelector('#form-ts') as HTMLInputElement).value = String(this.formTimestamp);
    this.overlay.classList.add('active');
    store.set('inputLocked', true);
  }

  close(): void {
    this.overlay.classList.remove('active');
    store.set('activeOverlay', 'none');
    store.set('inputLocked', false);
    audioManager.playPop();
  }

  private triggerFlyingMailAnimation(): void {
    audioManager.playWhoosh();
    const mailImg = document.createElement('img');
    mailImg.src = '/mail.png';
    mailImg.alt = 'Flying Mail';
    mailImg.className = 'flying-mail-anim';
    mailImg.style.left = '50%';
    mailImg.style.top = '50%';
    document.body.appendChild(mailImg);

    setTimeout(() => {
      mailImg.remove();
    }, 2000);
  }

  private async handleSubmit(form: HTMLFormElement): Promise<void> {
    const submitBtn = this.overlay.querySelector('#contact-submit-btn') as HTMLButtonElement;
    const statusMsg = this.overlay.querySelector('#contact-status-msg') as HTMLElement;

    submitBtn.disabled = true;
    submitBtn.innerText = 'Delivering Letter... 🕊️';
    statusMsg.style.display = 'none';

    const formData = new FormData(form);
    const result = await sendContact({
      name: String(formData.get('name') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      subject: String(formData.get('subject') || '').trim(),
      message: String(formData.get('message') || '').trim(),
      website: String(formData.get('website') || ''),
      ts: Number(formData.get('ts'))
    });

    try {
      if (result.ok) {
        this.triggerFlyingMailAnimation();
        audioManager.playMailSent();
        store.completeQuest('send_letter');
        eventBus.emit('toast:show', 'Letter delivered to Zarina\'s inbox! 💌');
        form.reset();
        this.close();
      } else {
        statusMsg.style.display = 'block';
        statusMsg.innerHTML = result.mailto
          ? `${result.error} <a href="${result.mailto}" style="font-weight:700;">Send it from your email app instead ✉️</a>`
          : result.error;
        audioManager.playError();
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Post Letter in Mailbox ✉️';
    }
  }
}
