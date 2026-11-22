import { profile } from '../content/profile';

export interface ContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
  website?: string;
  ts: number;
}

export type ContactResult =
  | { ok: true }
  | { ok: false; error: string; mailto?: string };

/** Posts the letter to /api/contact. When the server can't send mail, offers a mailto link instead of pretending. */
export async function sendContact(payload: ContactPayload): Promise<ContactResult> {
  const mailto = `mailto:${profile.email}?subject=${encodeURIComponent(payload.subject || 'Hello Zarina')}&body=${encodeURIComponent(
    `${payload.message}\n\n${payload.name}`
  )}`;
  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({} as Record<string, string>));
    if (res.status === 404 || res.status === 503 || res.status >= 500) {
      return { ok: false, error: data.error || 'The mailbox is offline right now.', mailto };
    }
    return { ok: false, error: data.error || 'Please check the fields and try again.' };
  } catch {
    return { ok: false, error: 'The mailbox is offline right now.', mailto };
  }
}
