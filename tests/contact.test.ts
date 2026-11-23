import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const ContactSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(254),
  subject: z.string().min(3).max(120),
  message: z.string().min(10).max(2000),
  website: z.string().optional(),
  ts: z.number()
});

describe('Contact Form Validation & Spam Traps', () => {
  it('accepts valid contact submissions', () => {
    const valid = {
      name: 'Robin',
      email: 'robin@example.com',
      subject: 'Collaboration opportunity',
      message: 'Hello Zarina, I loved your 3D game portfolio and would love to chat!',
      website: '',
      ts: Date.now() - 5000
    };
    const res = ContactSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it('rejects invalid emails', () => {
    const invalid = {
      name: 'Robin',
      email: 'not-an-email',
      subject: 'Hello',
      message: 'Valid message content here.',
      ts: Date.now()
    };
    const res = ContactSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it('rejects short messages below 10 characters', () => {
    const invalid = {
      name: 'Robin',
      email: 'robin@example.com',
      subject: 'Hello',
      message: 'Too short',
      ts: Date.now()
    };
    const res = ContactSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });
});

import handler from '../api/contact';
import chatHandler from '../api/chat';
import { vi, afterEach } from 'vitest';

function mockRes() {
  const out: { code: number; body: any } = { code: 0, body: null };
  const res = {
    status(c: number) {
      out.code = c;
      return res;
    },
    json(b: any) {
      out.body = b;
    }
  };
  return { res, out };
}

const goodBody = () => ({
  name: 'Robin',
  email: 'robin@example.com',
  subject: 'Collaboration',
  message: 'Hello Zarina, loved the portfolio!',
  website: '',
  ts: Date.now() - 5000
});

describe('/api/contact handler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BREVO_API_KEY;
  });

  it('reports 503 when email is not configured', async () => {
    const { res, out } = mockRes();
    await handler({ method: 'POST', body: goodBody(), headers: { 'x-forwarded-for': '1.1.1.1' } }, res);
    expect(out.code).toBe(503);
    expect(out.body.code).toBe('not_configured');
  });

  it('sends through Brevo when a key is set', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    const { res, out } = mockRes();
    await handler({ method: 'POST', body: goodBody(), headers: { 'x-forwarded-for': '2.2.2.2' } }, res);
    expect(out.code).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('test-key');
    expect(JSON.parse(init.body).replyTo.email).toBe('robin@example.com');
  });

  it('returns 502 when Brevo rejects', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'bad' }));
    const { res, out } = mockRes();
    await handler({ method: 'POST', body: goodBody(), headers: { 'x-forwarded-for': '3.3.3.3' } }, res);
    expect(out.code).toBe(502);
  });

  it('silently accepts honeypot submissions without sending', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { res, out } = mockRes();
    await handler({ method: 'POST', body: { ...goodBody(), website: 'spam.biz' }, headers: { 'x-forwarded-for': '4.4.4.4' } }, res);
    expect(out.code).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('/api/contact error reporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BREVO_API_KEY;
    delete process.env.CONTACT_FROM_EMAIL;
  });

  it('names the bad field so the form can point at it', async () => {
    const { res, out } = mockRes();
    await handler({ method: 'POST', body: { ...goodBody(), email: 'nope' }, headers: { 'x-forwarded-for': '5.5.5.5' } }, res);
    expect(out.code).toBe(400);
    expect(out.body.code).toBe('invalid');
    expect(out.body.fields.email).toMatch(/email/i);
  });

  it('does not count invalid attempts against the hourly limit', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
    for (let i = 0; i < 6; i++) {
      const { res } = mockRes();
      await handler({ method: 'POST', body: { ...goodBody(), message: 'short' }, headers: { 'x-forwarded-for': '6.6.6.6' } }, res);
    }
    const { res, out } = mockRes();
    await handler({ method: 'POST', body: goodBody(), headers: { 'x-forwarded-for': '6.6.6.6' } }, res);
    expect(out.code).toBe(200);
  });

  it('flags a Brevo IP block / bad key as provider_auth', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '{"code":"unauthorized","message":"We have detected you are using an unrecognised IP address"}' })
    );
    const { res, out } = mockRes();
    await handler({ method: 'POST', body: goodBody(), headers: { 'x-forwarded-for': '7.7.7.7' } }, res);
    expect(out.code).toBe(502);
    expect(out.body.code).toBe('provider_auth');
    expect(JSON.stringify(out.body)).not.toContain('test-key');
  });

  it('health check reports a missing key', async () => {
    const { res, out } = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(out.body.status).toBe('not_configured');
  });

  it('health check spots an IP block', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unrecognised IP address' }));
    const { res, out } = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(out.body.status).toBe('ip_blocked');
  });

  it('health check spots an unverified sender, and passes when verified', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    process.env.CONTACT_FROM_EMAIL = 'hello@example.com';
    const make = (email: string) =>
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ senders: [{ email, active: true }] }) });
    vi.stubGlobal('fetch', make('other@example.com'));
    let r = mockRes();
    await handler({ method: 'GET', headers: {} }, r.res);
    expect(r.out.body.status).toBe('sender_not_verified');
    vi.stubGlobal('fetch', make('Hello@Example.com'));
    r = mockRes();
    await handler({ method: 'GET', headers: {} }, r.res);
    expect(r.out.body.status).toBe('ok');
  });
});

describe('/api/chat handler without an API key', () => {
  it('answers extractively with cited sources', async () => {
    delete process.env.GEMINI_API_KEY;
    const { res, out } = mockRes();
    await chatHandler({ method: 'POST', body: { message: 'What is Light Up The House?' }, headers: {} }, res);
    expect(out.code).toBe(200);
    expect(out.body.sources[0].title).toBe('Light Up The House');
    expect(out.body.answer).toContain('[1]');
  });
});

describe('/api/chat handler with Gemini', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it('falls through a busy model and returns only cited sources', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'It is a GameCon entry [1].' }] } }] })
      });
    vi.stubGlobal('fetch', fetchMock);
    const { res, out } = mockRes();
    await chatHandler({ method: 'POST', body: { message: 'What is Light Up The House?' }, headers: { 'x-forwarded-for': '9.9.9.9' } }, res);
    expect(out.code).toBe(200);
    expect(out.body.mode).toBe('llm');
    expect(out.body.sources).toHaveLength(1);
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-key');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
