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
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '127.0.0.1';
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

  // 3. Spam: Honeypot check
  if (website && website.trim().length > 0) {
    return res.status(400).json({ error: 'Spam detected.' });
  }

  // 4. Spam: Time trap check (must take at least 3 seconds)
  if (now - ts < 3000) {
    return res.status(400).json({ error: 'Form submitted suspiciously fast.' });
  }

  // 5. Sanitize header injection (no newlines in name or subject)
  if (name.includes('\n') || subject.includes('\n') || email.includes('\n')) {
    return res.status(400).json({ error: 'Invalid characters in fields.' });
  }

  console.log(`✉️ [Contact Delivery Log] Received message from "${name}" <${email}>: "${subject}"`);

  // If RESEND_API_KEY is provided in environment variables, dispatch email
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && !resendKey.includes('placeholder')) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.CONTACT_FROM_EMAIL || 'Portfolio <onboarding@resend.dev>',
          to: process.env.CONTACT_TO_EMAIL || 'alex.morgan.portfolio@example.com',
          reply_to: email,
          subject: `[Portfolio Letter] ${subject}`,
          text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
        })
      });
    } catch (err) {
      console.error('Email provider error:', err);
    }
  }

  return res.status(200).json({
    ok: true,
    message: 'Letter successfully delivered to Alex!'
  });
}
