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

/**
 * Zuzu's voice. Uses Gemini's speech model, which speaks real Urdu (not accented
 * English) and takes a style prompt for a cute, cheerful voice. Returns a WAV as
 * base64 so the browser can play it. The client falls back to the Web Speech API
 * when this fails or no key is set.
 */
const MAX_TEXT = 600;
const VOICE = process.env.GEMINI_TTS_VOICE || 'Leda';
const MODELS = (process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts,gemini-2.5-flash-tts,gemini-2.5-pro-preview-tts')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const STYLE: Record<string, string> = {
  en: 'Say this in English in a cute, bubbly, high-pitched little cartoon-pet voice, warm and playful, at a lively pace:',
  ur: 'Read the following text aloud in natural Urdu with a native Pakistani Urdu accent, in a cute, cheerful, high-pitched cartoon-pet voice. Do not translate it:'
};

const hits = new Map<string, { count: number; since: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.since > 60_000) {
    hits.set(ip, { count: 1, since: now });
    return false;
  }
  rec.count++;
  return rec.count > 15;
}

function pcmToWav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Voice not configured' });

  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, MAX_TEXT) : '';
  if (!text) return res.status(400).json({ error: 'Text is required' });
  const lang = req.body?.lang === 'ur' ? 'ur' : 'en';

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many requests' });

  const langCode = lang === 'ur' ? 'ur-PK' : 'en-US';
  for (const model of MODELS) {
    // Try with an explicit language first, then without in case the model rejects it
    for (const withLang of [true, false]) {
      try {
        const speechConfig: any = { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } };
        if (withLang) speechConfig.languageCode = langCode;
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${STYLE[lang]}\n${text}` }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig }
          }),
          signal: AbortSignal.timeout(12000)
        });
        if (!r.ok) continue;
        const data: any = await r.json();
        const part = (data?.candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data);
        if (!part) continue;
        const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1]) || 24000;
        const wav = pcmToWav(Buffer.from(part.inlineData.data, 'base64'), rate);
        return res.status(200).json({ audio: wav.toString('base64'), mime: 'audio/wav' });
      } catch {
        /* try the next option */
      }
    }
  }
  return res.status(502).json({ error: 'Voice unavailable' });
}
