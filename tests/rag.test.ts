import { describe, it, expect } from 'vitest';
import { loadIndex, retrieve, tokenize } from '../api/_rag';

describe('RAG retrieval', () => {
  const index = loadIndex()!;

  it('has a built index', () => {
    expect(index).toBeTruthy();
    expect(index.chunks.length).toBeGreaterThan(30);
  });

  it('normalises plurals', () => {
    expect(tokenize('Projects using Engines')).toEqual(['project', 'us', 'engine']);
  });

  it('finds the project a question names', () => {
    expect(retrieve(index, 'Tell me about Light Up The House')[0].chunk.title).toBe('Light Up The House');
  });

  it('finds GameCon facts', () => {
    const titles = retrieve(index, 'Did Zarina host GameCon?').map((m) => m.chunk.title.toLowerCase());
    expect(titles.some((t) => t.includes('gamecon'))).toBe(true);
  });

  it('returns nothing for gibberish', () => {
    expect(retrieve(index, 'qwzx plorb')).toHaveLength(0);
  });
});
