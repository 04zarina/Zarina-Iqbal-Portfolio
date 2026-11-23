import { z } from 'zod';

type ApiRequest = {
  method?: string;
  body?: any;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (data: any) => void;
};

const ContactSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name (at least 2 letters).').max(80, 'Your name is a bit long (80 characters max).'),
  email: z.string().trim().email('That email address doesn\'t look right.').max(254),
  subject: z.string().trim().min(3, 'Please add a short subject (at least 3 characters).').max(120, 'The subject is too long (120 characters max).'),
  message: z.string().trim().min(1, 'Please write a message.').max(2000, 'Your message is too long (2000 characters max).'),
  website: z.string().optional(), // Honeypot
  ts: z.coerce.number() // Time trap
});

/** Error codes the client understands. Never include secrets or addresses in responses. */
export type ContactErrorCode =
  | 'method'
  | 'rate_limited'
  | 'invalid'
  | 'too_fast'
  | 'not_configured'
  | 'provider_auth'
  | 'provider_sender'
  | 'provider_account'
  | 'provider_error'
  | 'provider_unreachable';

const BREVO = 'https://api.brevo.com/v3';

// Simple in-memory rate limiting: max 5 delivered letters per IP per hour.
// Only real send attempts count, so fixing a typo in the form never locks anyone out.
const ipRateLimit = new Map<string, { count: number; firstAt: number }>();
const HOUR = 3_600_000;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // GET /api/contact is a health check: it says whether email is set up and whether Brevo accepts
  // the key from this server, without sending anything. Open it in a browser after changing settings.
  if (req.method === 'GET') {
    return res.status(200).json(await healthCheck());
  }

  if (req.method !== 'POST') {
    return fail(res, 405, 'method', 'Method not allowed');
  }

  const now = Date.now();
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1').split(',')[0].trim();
  const rate = ipRateLimit.get(clientIp);
  if (rate && now - rate.firstAt < HOUR && rate.count >= 5) {
    return fail(res, 429, 'rate_limited', 'You\'ve sent a few letters already. Please wait a bit before sending another.');
  }

  // Validate body (Vercel parses JSON for us, but accept a raw string too)
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const parsed = ContactSchema.safeParse(body ?? {});
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const fields = Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v?.[0] ?? 'Invalid value']));
    const first = Object.values(fields)[0] || 'Please check the fields and try again.';
    return res.status(400).json({ error: first, code: 'invalid', fields });
  }

  const { name, email, subject, message, website, ts } = parsed.data;

  // Spam: honeypot field. Pretend it worked so bots don't learn anything.
  if (website && website.trim().length > 0) {
    return res.status(200).json({ ok: true, message: 'Letter delivered!' });
  }

  // Spam: time trap (a human takes at least 3 seconds to fill the form)
  if (Number.isFinite(ts) && now - ts < 3000) {
    return fail(res, 400, 'too_fast', 'That was fast! Please take a moment and try again.');
  }

  // Header injection guard (no newlines in single-line fields)
  if (/[\r\n]/.test(name + subject + email)) {
    return fail(res, 400, 'invalid', 'Please remove line breaks from your name, email and subject.');
  }

  const cfg = mailConfig();
  if (!cfg.key) {
    console.error('[contact] BREVO_API_KEY is not set in this environment. Add it in Vercel and redeploy.');
    return fail(res, 503, 'not_configured', 'The mailbox isn\'t connected yet.');
  }

  // Count this attempt against the hourly limit now that it's a real send.
  if (!rate || now - rate.firstAt >= HOUR) ipRateLimit.set(clientIp, { count: 1, firstAt: now });
  else rate.count++;

  try {
    const r = await fetch(`${BREVO}/smtp/email`, {
      method: 'POST',
      headers: { 'api-key': cfg.key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: `${name} via Portfolio`.slice(0, 70), email: cfg.from },
        to: [{ email: cfg.to, name: 'Zarina Iqbal' }],
        replyTo: { email, name },
        subject: `[Portfolio] ${subject}`,
        textContent: `From: ${name} <${email}>\nSubject: ${subject}\n\n${message}\n\n(Sent from the portfolio mailbox. Reply to this email to answer ${name}.)`,
        htmlContent: `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p><p style="color:#888">Sent from the portfolio mailbox. Reply to this email to answer ${escapeHtml(name)}.</p>`
      })
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      const code = classifyBrevoError(r.status, detail);
      // The full provider message goes to Vercel logs only (Project > Logs), never to the visitor.
      console.error(`[contact] Brevo rejected the email (${r.status}, ${code}): ${detail.slice(0, 500)}`);
      return fail(res, 502, code, 'The mailbox couldn\'t deliver your letter just now.');
    }
  } catch (err) {
    console.error('[contact] Could not reach Brevo:', err);
    return fail(res, 502, 'provider_unreachable', 'The mailbox couldn\'t be reached just now.');
  }

  return res.status(200).json({ ok: true, message: 'Letter delivered to Zarina!' });
}

function fail(res: ApiResponse, status: number, code: ContactErrorCode, error: string) {
  return res.status(status).json({ error, code });
}

function mailConfig() {
  const clean = (v: string | undefined) => (v || '').trim();
  const key = clean(process.env.BREVO_API_KEY);
  const to = clean(process.env.CONTACT_TO_EMAIL) || 'zarinaiqbal04@gmail.com';
  // Brevo only sends from a sender address verified in the Brevo account (the sign-up email is verified by default).
  const from = clean(process.env.CONTACT_FROM_EMAIL) || to;
  return { key, to, from };
}

/** Turns a Brevo error into a short code so logs and the health check say what to fix. */
export function classifyBrevoError(status: number, detail: string): ContactErrorCode {
  const d = detail.toLowerCase();
  if (status === 401 || d.includes('unauthorized') || d.includes('ip address') || d.includes('key not found')) return 'provider_auth';
  if (d.includes('sender')) return 'provider_sender';
  if (status === 403 || d.includes('not yet activated') || d.includes('suspended') || d.includes('credits')) return 'provider_account';
  return 'provider_error';
}

const HINTS: Record<string, string> = {
  not_configured: 'BREVO_API_KEY is not set for this deployment. Add it in Vercel > Settings > Environment Variables (Production) and redeploy.',
  ip_blocked:
    'Brevo is blocking requests from unknown IP addresses. Vercel has no fixed IP, so in Brevo go to Security > Authorised IPs and deactivate IP blocking.',
  invalid_key: 'Brevo does not recognise this API key (it may have been deleted or rotated). Create a new key in Brevo > SMTP & API > API Keys, paste it into Vercel and redeploy.',
  sender_not_verified: 'The sender address is not a verified sender in Brevo. Verify it in Brevo > Senders, Domains & Dedicated IPs, or set CONTACT_FROM_EMAIL to one that is.',
  account: 'Brevo answered with an account problem. Check that transactional email is activated for the account.',
  unreachable: 'Could not reach Brevo from the server. Try again in a minute.',
  ok: 'Email is set up. If letters still do not arrive, check the Spam folder and Brevo > Transactional > Logs.'
};

async function healthCheck() {
  const cfg = mailConfig();
  const base = { provider: 'brevo', keySet: Boolean(cfg.key), customSender: Boolean((process.env.CONTACT_FROM_EMAIL || '').trim()) };
  if (!cfg.key) return { ...base, status: 'not_configured', hint: HINTS.not_configured };
  try {
    const acc = await fetch(`${BREVO}/account`, { headers: { 'api-key': cfg.key, accept: 'application/json' } });
    if (!acc.ok) {
      const detail = (await acc.text().catch(() => '')).toLowerCase();
      const status = detail.includes('ip address') ? 'ip_blocked' : acc.status === 401 ? 'invalid_key' : 'account';
      console.error(`[contact] health check: Brevo /account ${acc.status}: ${detail.slice(0, 300)}`);
      return { ...base, status, hint: HINTS[status] };
    }
    const senders = await fetch(`${BREVO}/senders`, { headers: { 'api-key': cfg.key, accept: 'application/json' } });
    if (senders.ok) {
      const data = (await senders.json().catch(() => ({}))) as { senders?: { email?: string; active?: boolean }[] };
      const match = (data.senders || []).find((s) => (s.email || '').toLowerCase() === cfg.from.toLowerCase());
      if (!match || match.active === false) return { ...base, status: 'sender_not_verified', hint: HINTS.sender_not_verified };
    }
    return { ...base, status: 'ok', hint: HINTS.ok };
  } catch (err) {
    console.error('[contact] health check could not reach Brevo:', err);
    return { ...base, status: 'unreachable', hint: HINTS.unreachable };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
