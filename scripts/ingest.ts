import fs from 'node:fs';
import path from 'node:path';
import { tokenize, toSparseVector, termCounts } from '../api/_rag';

interface DocumentChunk {
  id: string;
  sourceId: string;
  type: string;
  title: string;
  targetId: string;
  text: string;
  vector?: Record<string, number>;
  tf?: Record<string, number>;
  len?: number;
}

async function runIngest() {
  const contentDir = path.resolve(process.cwd(), 'content');
  const serverDataDir = path.resolve(process.cwd(), 'server-data');

  if (!fs.existsSync(serverDataDir)) {
    fs.mkdirSync(serverDataDir, { recursive: true });
  }

  console.log('📚 Starting RAG Content Ingestion Pipeline...');
  const chunks: DocumentChunk[] = [];

  // 1. Projects
  const projects = JSON.parse(fs.readFileSync(path.join(contentDir, 'projects.json'), 'utf-8'));
  projects.forEach((p: any) => {
    chunks.push({
      id: `proj-${p.id}`,
      sourceId: p.id,
      type: 'project',
      title: p.title,
      targetId: 'DOOR_gameRoom',
      text: `Project: ${p.title} (${p.year}). Tagline: ${p.tagline}. Type: ${p.type}. Roles: ${p.roles.join(', ')}. Key Contributions: ${p.contributions.join(' ')}. Description: ${p.description}. Technologies: ${p.tools.join(', ')}.`
    });
  });

  // 2. Skills
  const skills = JSON.parse(fs.readFileSync(path.join(contentDir, 'skills.json'), 'utf-8'));
  skills.forEach((s: any) => {
    chunks.push({
      id: `skill-${s.id}`,
      sourceId: s.id,
      type: 'skill',
      title: s.name,
      targetId: 'DOOR_greenhouse',
      text: `Skill: ${s.name} in category ${s.category} (Proficiency Level: ${s.level} out of 5). Details: ${s.blurb}`
    });
  });

  // 3. Education
  const edu = JSON.parse(fs.readFileSync(path.join(contentDir, 'education.json'), 'utf-8'));
  edu.forEach((e: any) => {
    chunks.push({
      id: `edu-${e.id}`,
      sourceId: e.id,
      type: 'education',
      title: e.title,
      targetId: 'DOOR_study',
      text: `Education: ${e.title} at ${e.org} (${e.start} - ${e.end}). Summary: ${e.summary}. Highlights: ${(e.highlights || []).join(' ')}`
    });
  });

  // 4. Experience
  const exp = JSON.parse(fs.readFileSync(path.join(contentDir, 'experience.json'), 'utf-8'));
  exp.forEach((ex: any) => {
    chunks.push({
      id: `exp-${ex.id}`,
      sourceId: ex.id,
      type: 'experience',
      title: ex.title,
      targetId: 'DOOR_study',
      text: `Experience: ${ex.title} at ${ex.org} (${ex.start} - ${ex.end}). Summary: ${ex.summary}. Highlights: ${(ex.highlights || []).join(' ')}`
    });
  });

  // 5. Achievements
  const ach = JSON.parse(fs.readFileSync(path.join(contentDir, 'achievements.json'), 'utf-8'));
  ach.forEach((a: any) => {
    chunks.push({
      id: `ach-${a.id}`,
      sourceId: a.id,
      type: 'achievement',
      title: a.title,
      targetId: 'DOOR_bedroom',
      text: `Achievement Award: ${a.title} (${a.date}). Summary: ${a.summary}`
    });
  });

  // 6. Profile & FAQ markdown, split by heading so each chunk stays focused
  const mdChunks = (file: string, prefix: string, baseTitle: string, targetId: string) => {
    const raw = fs.readFileSync(path.join(contentDir, file), 'utf-8');
    const sections = raw.split(/\n(?=#{1,3} )/);
    sections.forEach((sec, i) => {
      const text = sec.trim();
      if (text.length < 20) return;
      const heading = text.match(/^#{1,3} (.+)/)?.[1]?.trim();
      chunks.push({
        id: `${prefix}-${i}`,
        sourceId: prefix,
        type: prefix,
        title: heading ? `${baseTitle}: ${heading}` : baseTitle,
        targetId,
        text: text.replace(/^#{1,3} /gm, '')
      });
    });
  };
  mdChunks('profile.md', 'profile', 'Profile', 'DOOR_bedroom');
  mdChunks('faq.md', 'faq', 'FAQ', 'DOOR_bedroom');

  // Build the TF-IDF vector index (sparse, so the file stays small)
  // Titles count three times so a question naming a project finds that project first
  const tokenized = chunks.map((c) => tokenize(`${c.title} ${c.title} ${c.title} ${c.text}`));
  const df: Record<string, number> = {};
  tokenized.forEach((toks) => new Set(toks).forEach((t) => (df[t] = (df[t] || 0) + 1)));
  const idf: Record<string, number> = {};
  Object.entries(df).forEach(([t, n]) => (idf[t] = Math.log(1 + chunks.length / n)));
  chunks.forEach((c, i) => {
    c.vector = toSparseVector(tokenized[i], idf);
    c.tf = termCounts(tokenized[i]);
    c.len = tokenized[i].length;
  });

  const indexPayload = {
    version: '2.0.0',
    createdAt: new Date().toISOString(),
    chunkCount: chunks.length,
    vocabSize: Object.keys(idf).length,
    idf,
    avgLen: tokenized.reduce((n, t) => n + t.length, 0) / tokenized.length,
    chunks
  };

  const outputPath = path.join(serverDataDir, 'index.json');
  fs.writeFileSync(outputPath, JSON.stringify(indexPayload), 'utf-8');
  console.log(`✅ Ingested ${chunks.length} chunks into: ${outputPath}`);
}

runIngest().catch((err) => {
  console.error('❌ Ingestion failed:', err);
  process.exit(1);
});
