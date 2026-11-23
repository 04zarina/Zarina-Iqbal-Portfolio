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
  | { ok: false; error: string; code?: string; fields?: Record<string, string>; mailto?: string };

/** Builds a mailto link with the visitor's letter prefilled, used whenever the server can't deliver. */
export function contactMailto(payload: Pick<ContactPayload, 'subject' | 'message' | 'name'>): string {
  return `mailto:${profile.email}?subject=${encodeURIComponent(payload.subject || 'Hello Zarina')}&body=${encodeURIComponent(
    `${payload.message}\n\n${payload.name}`
  )}`;
}

/**
 * Posts the letter to /api/contact. Field problems come back with `fields` so the form can point at them.
 * Any delivery problem (offline, not configured, provider error) comes back with a mailto fallback,
 * so a visitor can always reach Zarina instead of being told it worked.
 */
export async function sendContact(payload: ContactPayload): Promise<ContactResult> {
  const mailto = contactMailto(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string; fields?: Record<string, string> };
    if (res.ok && data.ok !== false) return { ok: true };
    if (res.status === 400 && (data.code === 'invalid' || data.code === 'too_fast')) {
      return { ok: false, error: data.error || 'Please check the fields and try again.', code: data.code, fields: data.fields };
    }
    if (res.status === 429) {
      return { ok: false, error: data.error || 'Too many letters for now. Please try again later.', code: 'rate_limited', mailto };
    }
    return { ok: false, error: data.error || 'The mailbox is offline right now.', code: data.code || 'offline', mailto };
  } catch {
    return { ok: false, error: 'The mailbox couldn\'t be reached. Check your connection and try again.', code: 'offline', mailto };
  } finally {
    clearTimeout(timer);
  }
}
