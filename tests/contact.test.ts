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
    delete process.env.RESEND_API_KEY;
  });

  it('reports 503 when email is not configured', async () => {
    const { res, out } = mockRes();
    await handler({ method: 'POST', body: goodBody(), headers: { 'x-forwarded-for': '1.1.1.1' } }, res);
    expect(out.code).toBe(503);
    expect(out.body.code).toBe('not_configured');
  });

  it('sends through Resend when a key is set', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    const { res, out } = mockRes();
    await handler({ method: 'POST', body: goodBody(), headers: { 'x-forwarded-for': '2.2.2.2' } }, res);
    expect(out.code).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(init.body).reply_to).toBe('robin@example.com');
  });

  it('returns 502 when Resend rejects', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'bad' }));
    const { res, out } = mockRes();
    await handler({ method: 'POST', body: goodBody(), headers: { 'x-forwarded-for': '3.3.3.3' } }, res);
    expect(out.code).toBe(502);
  });

  it('silently accepts honeypot submissions without sending', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { res, out } = mockRes();
    await handler({ method: 'POST', body: { ...goodBody(), website: 'spam.biz' }, headers: { 'x-forwarded-for': '4.4.4.4' } }, res);
    expect(out.code).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('/api/chat handler without an API key', () => {
  it('answers extractively with cited sources', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { res, out } = mockRes();
    await chatHandler({ method: 'POST', body: { message: 'What is Light Up The House?' }, headers: {} }, res);
    expect(out.code).toBe(200);
    expect(out.body.sources[0].title).toBe('Light Up The House');
    expect(out.body.answer).toContain('[1]');
  });
});
