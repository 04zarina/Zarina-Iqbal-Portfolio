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
