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

const SYSTEM = `You are Zuzu, the friendly red-panda guide inside Zarina Iqbal Buriro's 3D portfolio.
Answer visitors' questions about Zarina using ONLY the numbered sources in the user message.
Rules:
- Cite every fact with the source number in square brackets, like [1] or [2][3].
- If the sources don't contain the answer, say you don't have that in your notes and suggest emailing ${CONTACT}. Never guess or invent details.
- Refer to Zarina by name (not he/she). Keep answers short: 2 to 4 sentences, warm and plain. No markdown headings or lists.`;

const LANG_RULE: Record<string, string> = {
  en: '',
  ur: '\n- Reply in Urdu (Urdu script, simple everyday Urdu). Keep names, game titles, tools and the [n] citations in English letters.'
};

const URDU_RE = /[\u0600-\u06FF]/;

// Urdu words -> English search terms, used alongside (or instead of) machine translation
const URDU_TERMS: [RegExp, string][] = [
  [/ریزیوم|ریزیومے|سی وی|ریزومے/, 'resume cv download'],
  [/گیم|کھیل/, 'games game projects'],
  [/پروجیکٹ|پراجیکٹ|منصوب/, 'projects'],
  [/مہارت|ہنر|اسکل/, 'skills'],
  [/تعلیم|یونیورسٹی|پڑھائی|ڈگری/, 'education university ned'],
  [/تجربہ|نوکری|انٹرن/, 'experience internship work'],
  [/رابط|ای میل|ای ـمیل/, 'contact email'],
  [/ایوارڈ|انعام|کامیابی/, 'achievements awards'],
  [/سرٹیفکیٹ|سند/, 'certificates'],
  [/پس منظر|کون ہے|کون ہیں|بارے/, 'about background zarina'],
  [/کمیونٹی|قیادت|سرگرمی|سرگرمیاں|تقریب|ایونٹ/, 'leadership community events host'],
  [/زوزو/, 'zuzu companion']
];
function urduKeywords(text: string): string {
  return URDU_TERMS.filter(([re]) => re.test(text)).map(([, en]) => en).join(' ');
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, MAX_QUESTION) : '';
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const lang = req.body?.lang === 'ur' ? 'ur' : 'en';

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Zuzu needs a short breather. Try again in a minute!' });
  }

  const index = loadIndex();
  if (!index) {
    return res.status(500).json({ error: 'Vector index not built. Run npm run ingest.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // The index is English, so an Urdu question is translated for retrieval first
  let query = message;
  if (URDU_RE.test(message)) {
    if (apiKey) {
      try {
        const en = await askGemini(apiKey, message, 'Translate the user text to plain English (no accents, write "resume" not "résumé"). Output only the translation.');
        if (en) query = en;
      } catch {
        /* fall back to the keyword map below */
      }
    }
    // Keyword map so common Urdu questions still find sources if translation is unavailable
    query += ' ' + urduKeywords(message);
  }

  const matches = retrieve(index, query, 5);
  if (matches.length === 0) {
    return res.status(200).json({
      answer:
        lang === 'ur'
          ? `معاف کیجیے، یہ بات میرے نوٹس میں نہیں ہے۔ آپ ${CONTACT} پر ای میل کر سکتے ہیں یا Dev Realm کے میل باکس میں خط ڈال سکتے ہیں!`
          : `Mew! I don't have that in my notes about Zarina. You can email ${CONTACT} or drop a letter in the mailbox on the Dev Realm island!`,
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
    const question = query !== message ? `${message}\n(English: ${query.trim()})` : message;
    const finalRule = lang === 'ur' ? '\n\nAnswer in Urdu script (اردو), not English.' : '';
    let answer = await askGemini(apiKey, `Sources:\n${context}\n\nVisitor question: ${question}${finalRule}`, SYSTEM + LANG_RULE[lang]);
    // Some models still answer in English: translate it so the Urdu toggle is honoured
    if (answer && lang === 'ur' && !URDU_RE.test(answer)) {
      try {
        const ur = await askGemini(apiKey, answer, 'Translate this to simple everyday Urdu in Urdu script. Keep names, game titles, tools and [n] citations exactly as they are. Output only the translation.');
        if (ur) answer = ur;
      } catch {
        /* keep the English answer */
      }
    }
    if (!answer) {
      return res.status(200).json({
        answer: `I can only help with questions about Zarina's work. For anything else, email ${CONTACT}.`,
        sources: [],
        grounded: false
      });
    }

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
    // Still answer from the notes rather than failing outright.
    const best = matches[0].chunk;
    const note = lang === 'ur' ? 'معاف کیجیے، اردو جواب اس وقت دستیاب نہیں، یہ انگریزی نوٹس ہیں:\n' : '';
    return res.status(200).json({
      answer: `${note}${best.text.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ')} [1]`,
      sources: sources.slice(0, 3),
      grounded: true,
      mode: 'extractive'
    });
  }
}

/**
 * Google Gemini (generativelanguage API). The key is read from the GEMINI_API_KEY
 * environment variable in Vercel and never reaches the browser. Busy models (503/429)
 * fall through to the next one in the list.
 */
const GEMINI_MODELS = (process.env.GEMINI_MODEL || 'gemini-3.8-flash,gemini-flash-latest,gemini-flash-lite-latest')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

export async function askGemini(apiKey: string, prompt: string, system = SYSTEM): Promise<string> {
  let lastError = '';
  for (const model of GEMINI_MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Urdu script and "thinking" tokens use a lot of the budget, so leave plenty of room
        generationConfig: { temperature: 0.3, maxOutputTokens: 1600 }
      }),
      signal: AbortSignal.timeout(9000)
    }).catch((e) => {
      lastError = `${model}: ${String(e?.name || e)}`;
      return null;
    });
    if (!r) continue;
    if (r.status === 503 || r.status === 429 || r.status === 404 || r.status >= 500) {
      lastError = `${model}: ${r.status}`;
      continue;
    }
    if (!r.ok) throw new Error(`Gemini ${model} ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
    const data: any = await r.json();
    const cand = data?.candidates?.[0];
    if (!cand || cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') return '';
    return (cand.content?.parts || [])
      .map((p: any) => (typeof p.text === 'string' && !p.thought ? p.text : ''))
      .join('')
      .trim();
  }
  throw new Error(`All Gemini models busy (${lastError})`);
}
