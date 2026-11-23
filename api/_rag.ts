// Retrieval helpers shared by the ingest script and the /api/chat function.
// Files starting with "_" inside api/ are not deployed as routes by Vercel.
import fs from 'node:fs';
import path from 'node:path';

export interface IndexChunk {
  id: string;
  sourceId: string;
  type: string;
  title: string;
  targetId: string;
  text: string;
  vector: Record<string, number>;
  /** Raw term counts and token length, used for BM25 keyword scoring. */
  tf: Record<string, number>;
  len: number;
}

export interface VectorIndex {
  version: string;
  idf: Record<string, number>;
  avgLen: number;
  chunks: IndexChunk[];
}

const STOP = new Set(
  'the and for are but not you all any can her his was one our out has have had how its who did get may him new now old see two way use with this that from they what when where which will your into than then them these some would about there their does also just only very more most such like been were being here zarina zarinas iqbal buriro tell know please'.split(' ')
);

/** Lowercase word tokens with a light plural/suffix strip so "projects" matches "project". */
export function tokenize(text: string): string[] {
  // NFKD + strip accents so "résumé" (common in translations) matches "resume"
  const words = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9+#]+/g) || [];
  const out: string[] = [];
  for (let w of words) {
    if (w.length < 2 || STOP.has(w)) continue;
    if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
    else if (w.length > 4 && w.endsWith('ing')) w = w.slice(0, -3);
    else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    out.push(w);
  }
  return out;
}

/** Unit-length TF-IDF vector stored sparsely as { term: weight }. */
export function toSparseVector(tokens: string[], idf: Record<string, number>): Record<string, number> {
  const tf: Record<string, number> = {};
  tokens.forEach((t) => (tf[t] = (tf[t] || 0) + 1));
  const vec: Record<string, number> = {};
  let mag = 0;
  for (const [t, n] of Object.entries(tf)) {
    const w = (1 + Math.log(n)) * (idf[t] || 0);
    if (w > 0) {
      vec[t] = w;
      mag += w * w;
    }
  }
  mag = Math.sqrt(mag);
  if (mag > 0) for (const t of Object.keys(vec)) vec[t] = +(vec[t] / mag).toFixed(4);
  return vec;
}

export function cosine(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0;
  for (const [t, w] of Object.entries(a)) dot += w * (b[t] || 0);
  return dot;
}

let cache: VectorIndex | null = null;
export function loadIndex(): VectorIndex | null {
  if (cache) return cache;
  const p = path.resolve(process.cwd(), 'server-data', 'index.json');
  if (!fs.existsSync(p)) return null;
  cache = JSON.parse(fs.readFileSync(p, 'utf-8')) as VectorIndex;
  return cache;
}

export function termCounts(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  tokens.forEach((t) => (tf[t] = (tf[t] || 0) + 1));
  return tf;
}

/**
 * Hybrid retrieval: TF-IDF cosine similarity (the vector index) blended with
 * BM25 keyword scoring, which keeps long project write-ups from being drowned out.
 */
/** Visitors say things the notes word differently; add the notes' own words to the query. */
const QUERY_SYNONYMS: [RegExp, string][] = [
  [/extra.?curricular|activit|clubs?\b|societ|volunteer|hobb|outside (of )?(work|study|class)/i, 'leadership community events host hosting speaking'],
  [/communit|leader|event|organi[sz]|host/i, 'leadership community events GameCon host'],
  [/contact|reach|hire|hiring/i, 'email contact'],
  [/cgpa|gpa|grade/i, 'education university CGPA']
];
export function retrieve(index: VectorIndex, query: string, k = 5, minScore = 0.08) {
  const extra = QUERY_SYNONYMS.filter(([re]) => re.test(query)).map(([, add]) => add).join(' ');
  const qTokens = tokenize(extra ? `${query} ${extra}` : query);
  const q = toSparseVector(qTokens, index.idf);
  const k1 = 1.2;
  const b = 0.4;
  const scored = index.chunks.map((chunk) => {
    let bm25 = 0;
    for (const t of new Set(qTokens)) {
      const f = chunk.tf[t] || 0;
      if (!f) continue;
      bm25 += (index.idf[t] || 0) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * chunk.len) / index.avgLen)));
    }
    return { chunk, cos: cosine(q, chunk.vector), bm25 };
  });
  const maxBm = Math.max(1e-6, ...scored.map((s) => s.bm25));
  return scored
    .map((s) => ({ chunk: s.chunk, score: 0.5 * s.cos + 0.5 * (s.bm25 / maxBm) * Math.min(1, maxBm / 3) }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
