import { z } from 'zod';

type ApiRequest = {
  method?: string;
  body?: any;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (data: any) => void;
};

const ContactSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(254),
  subject: z.string().min(3).max(120),
  message: z.string().min(10).max(2000),
  website: z.string().optional(), // Honeypot
  ts: z.number() // Time trap
});

// Simple in-memory rate limiting map
const ipRateLimit = new Map<string, { count: number; firstAt: number }>();

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. IP Rate Limiting (max 5 per hour)
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1').split(',')[0].trim();
  const now = Date.now();
  const rateRecord = ipRateLimit.get(clientIp);

  if (rateRecord) {
    if (now - rateRecord.firstAt < 3600000) {
      if (rateRecord.count >= 5) {
        return res.status(429).json({ error: 'Too many requests. Please wait a bit before sending another letter.' });
      }
      rateRecord.count++;
    } else {
      ipRateLimit.set(clientIp, { count: 1, firstAt: now });
    }
  } else {
    ipRateLimit.set(clientIp, { count: 1, firstAt: now });
  }

  // 2. Validate Body
  const parsed = ContactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input fields', details: parsed.error.format() });
  }

  const { name, email, subject, message, website, ts } = parsed.data;

  // 3. Spam: honeypot field. Pretend it worked so bots don't learn anything.
  if (website && website.trim().length > 0) {
    return res.status(200).json({ ok: true, message: 'Letter delivered!' });
  }

  // 4. Spam: time trap (a human takes at least 3 seconds to fill the form)
  if (now - ts < 3000) {
    return res.status(400).json({ error: 'That was fast! Please take a moment and try again.' });
  }

  // 5. Header injection guard (no newlines in single-line fields)
  if (/[\r\n]/.test(name + subject + email)) {
    return res.status(400).json({ error: 'Invalid characters in fields.' });
  }

  // 6. Deliver through Resend (https://resend.com). Keys live only in Vercel env vars.
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return res.status(503).json({ error: 'Email delivery is not configured yet.', code: 'not_configured' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM_EMAIL || 'Portfolio Mailbox <onboarding@resend.dev>',
        to: [process.env.CONTACT_TO_EMAIL || 'zarinaiqbal04@gmail.com'],
        reply_to: email,
        subject: `[Portfolio] ${subject}`,
        text: `From: ${name} <${email}>\n\n${message}\n\n(Sent from the 3D portfolio mailbox)`,
        html: `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p><p style="color:#888">Sent from the 3D portfolio mailbox</p>`
      })
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text().catch(() => ''));
      return res.status(502).json({ error: 'The mail service rejected the letter. Please email directly instead.' });
    }
  } catch (err) {
    console.error('Email provider error:', err);
    return res.status(502).json({ error: 'Could not reach the mail service. Please try again later.' });
  }

  return res.status(200).json({ ok: true, message: 'Letter successfully delivered to Zarina!' });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
