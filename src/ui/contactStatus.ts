import { profile } from '../content/profile';
import type { ContactResult } from '../core/sendContact';

/** Shared success / error / sending states for both contact forms (3D mailbox and classic view). */

export function clearFieldErrors(form: HTMLFormElement): void {
  form.querySelectorAll('.contact-field-error').forEach((el) => el.remove());
  form.querySelectorAll('.has-error').forEach((el) => {
    el.classList.remove('has-error');
    el.removeAttribute('aria-invalid');
  });
}

/** Marks each invalid field and puts the server's message right under it. Returns the first bad field. */
export function showFieldErrors(form: HTMLFormElement, fields: Record<string, string> | undefined): HTMLElement | null {
  clearFieldErrors(form);
  let first: HTMLElement | null = null;
  for (const [name, msg] of Object.entries(fields || {})) {
    const input = form.querySelector(`[name="${name}"]`) as HTMLElement | null;
    if (!input || input.getAttribute('type') === 'hidden') continue;
    input.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
    const note = document.createElement('span');
    note.className = 'contact-field-error';
    note.textContent = msg;
    input.insertAdjacentElement('afterend', note);
    first ??= input;
  }
  return first;
}

export function setSending(status: HTMLElement): void {
  status.className = 'contact-status is-visible is-sending';
  status.textContent = 'Sending your letter...';
}

export function setSuccess(status: HTMLElement, text: string): void {
  status.className = 'contact-status is-visible is-success';
  status.textContent = text;
}

export function hideStatus(status: HTMLElement): void {
  status.className = 'contact-status';
  status.textContent = '';
}

/** Error box with a clear next step: fix the fields, or send the same letter from the visitor's own email. */
export function setError(status: HTMLElement, result: Extract<ContactResult, { ok: false }>): void {
  status.className = 'contact-status is-visible is-error';
  status.textContent = '';
  const msg = document.createElement('div');
  msg.textContent = result.fields ? result.error : `${result.error} Your letter wasn't sent.`;
  status.appendChild(msg);
  if (!result.mailto) return;

  const actions = document.createElement('div');
  actions.className = 'contact-status-actions';
  const mail = document.createElement('a');
  mail.href = result.mailto;
  mail.textContent = 'Send it from my email app ✉️';
  actions.appendChild(mail);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = `Copy ${profile.email}`;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(profile.email);
      copy.textContent = 'Copied!';
    } catch {
      copy.textContent = profile.email;
    }
  });
  actions.appendChild(copy);
  status.appendChild(actions);
}
