import Anthropic from '@anthropic-ai/sdk';
import { loadIndex, retrieve } from './_rag';

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

const CONTACT = 'zarinaiqbal04@gmail.com';
const MAX_QUESTION = 500;

// Small per-instance rate limit so a public chatbot can't run up the API bill.
const hits = new Map<string, { count: number; since: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.since > 60_000) {
    hits.set(ip, { count: 1, since: now });
    return false;
  }
  rec.count++;
  return rec.count > 12;
}

const SYSTEM = `You are Mochi, the friendly red-panda guide inside Zarina Iqbal Buriro's 3D portfolio.
Answer visitors' questions about Zarina using ONLY the numbered sources in the user message.
Rules:
- Cite every fact with the source number in square brackets, like [1] or [2][3].
- If the sources don't contain the answer, say you don't have that in your notes and suggest emailing ${CONTACT}. Never guess or invent details.
- Refer to Zarina by name (not he/she). Keep answers short: 2 to 4 sentences, warm and plain. No markdown headings or lists.`;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, MAX_QUESTION) : '';
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Mochi needs a short breather. Try again in a minute!' });
  }

  const index = loadIndex();
  if (!index) {
    return res.status(500).json({ error: 'Vector index not built. Run npm run ingest.' });
  }

  const matches = retrieve(index, message, 5);
  if (matches.length === 0) {
    return res.status(200).json({
      answer: `Mew! I don't have that in my notes about Zarina. You can email ${CONTACT} or drop a letter in the mailbox on the Dev Realm island!`,
      sources: [{ id: 'mailbox', title: 'Dev Realm Mailbox', targetId: 'DOOR_devRealm' }],
      grounded: false
    });
  }

  const sources = matches.map((m, i) => ({
    n: i + 1,
    id: m.chunk.id,
    title: m.chunk.title,
    type: m.chunk.type,
    targetId: m.chunk.targetId,
    excerpt: m.chunk.text.slice(0, 220)
  }));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No LLM configured: answer extractively from the best match so the bot still works.
    const best = matches[0].chunk;
    const firstSentences = best.text.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
    return res.status(200).json({
      answer: `${firstSentences} [1]`,
      sources: sources.slice(0, 3),
      grounded: true,
      mode: 'extractive'
    });
  }

  const context = matches.map((m, i) => `[${i + 1}] ${m.chunk.title}\n${m.chunk.text}`).join('\n\n');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model: process.env.CHAT_MODEL || 'claude-opus-5-5',
      max_tokens: 1024,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Sources:\n${context}\n\nVisitor question: ${message}` }]
    } as any);

    if (response.stop_reason === 'refusal') {
      return res.status(200).json({
        answer: `I can only help with questions about Zarina's work. For anything else, email ${CONTACT}.`,
        sources: [],
        grounded: false
      });
    }

    const answer = response.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    // Return only the sources the answer actually cites (fall back to the top one).
    const cited = new Set(Array.from(answer.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
    const usedSources = sources.filter((s) => cited.has(s.n));

    return res.status(200).json({
      answer,
      sources: usedSources.length ? usedSources : sources.slice(0, 1),
      grounded: true,
      mode: 'llm'
    });
  } catch (err) {
    console.error('Chat model error:', err);
    return res.status(502).json({ error: 'Mochi could not reach the model right now.' });
  }
}
