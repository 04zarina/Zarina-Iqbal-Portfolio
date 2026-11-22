import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  year: z.number(),
  type: z.string(),
  roles: z.array(z.string()),
  contributions: z.array(z.string()),
  description: z.string(),
  tools: z.array(z.string()),
  teamSize: z.number()
});

describe('Content Schema Integrity', () => {
  it('validates projects.json records have all required fields', () => {
    const pPath = path.resolve(process.cwd(), 'content', 'projects.json');
    const projects = JSON.parse(fs.readFileSync(pPath, 'utf-8'));
    expect(projects.length).toBeGreaterThanOrEqual(4);

    projects.forEach((proj: any) => {
      const res = ProjectSchema.safeParse(proj);
      expect(res.success).toBe(true);
    });
  });

  it('rejects malformed project records', () => {
    const invalidProj = { id: 'bad-01', title: 'Missing Fields' };
    const res = ProjectSchema.safeParse(invalidProj);
    expect(res.success).toBe(false);
  });
});

describe('RAG Index Integrity', () => {
  it('verifies server-data/index.json has chunks and an IDF vocabulary', () => {
    const indexPath = path.resolve(process.cwd(), 'server-data', 'index.json');
    expect(fs.existsSync(indexPath)).toBe(true);

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    expect(index.chunks.length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(index.idf).length).toBeGreaterThan(50);
  });
});
