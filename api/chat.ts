type ApiRequest = {
  method?: string;
  body?: any;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (data: any) => void;
};

let indexCache: any = null;

function loadIndex() {
  if (indexCache) return indexCache;
  const p = path.resolve(process.cwd(), 'server-data', 'index.json');
  if (fs.existsSync(p)) {
    indexCache = JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  return indexCache;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] || 0) * (b[i] || 0);
  }
  return dot;
}

function queryToVector(query: string, vocab: string[]): number[] {
  const words = query.toLowerCase().match(/\b[a-z0-9_-]+\b/g) || [];
  const freq: Record<string, number> = {};
  words.forEach((w) => {
    freq[w] = (freq[w] || 0) + 1;
  });

  const vec = vocab.map((term) => freq[term] || 0);
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return mag > 0 ? vec.map((v) => v / mag) : vec;
}

import fs from 'node:fs';
import path from 'node:path';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  const index = loadIndex();
  if (!index) {
    return res.status(500).json({ error: 'Vector index not initialized' });
  }

  const queryVec = queryToVector(message, index.vocab);
  const scoredChunks = index.chunks.map((c: any) => ({
    chunk: c,
    score: cosineSimilarity(queryVec, c.vector)
  }));

  scoredChunks.sort((a: any, b: any) => b.score - a.score);
  const topMatches = scoredChunks.filter((s: any) => s.score > 0.05).slice(0, 3);

  if (topMatches.length === 0) {
    return res.status(200).json({
      answer: "Mew! I don't have that info about Zarina in my notes. You can email zarinaiqbal04@gmail.com or drop a letter in the mailbox on the Dev Realm island!",
      sources: [{ id: 'mailbox', title: 'Mailbox', targetId: 'mailbox' }],
      grounded: false
    });
  }

  const sources = topMatches.map((m: any) => ({
    id: m.chunk.id,
    title: m.chunk.title,
    type: m.chunk.type,
    targetId: m.chunk.targetId
  }));

  // Grounded concise synthesis
  const contextText = topMatches.map((m: any) => m.chunk.text).join(' ');
  const answer = `Based on Zarina's portfolio records: ${contextText.slice(0, 300)}... You can inspect the related items in the studio!`;

  return res.status(200).json({
    answer,
    sources,
    grounded: true
  });
}
