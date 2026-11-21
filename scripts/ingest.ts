import fs from 'node:fs';
import path from 'node:path';

interface DocumentChunk {
  id: string;
  sourceId: string;
  type: string;
  title: string;
  targetId: string;
  text: string;
  vector?: number[];
}

// Simple deterministic term frequency vectorizer for in-memory retrieval
function textToVector(text: string, vocab: string[]): number[] {
  const words = text.toLowerCase().match(/\b[a-z0-9_-]+\b/g) || [];
  const freq: Record<string, number> = {};
  words.forEach((w) => {
    freq[w] = (freq[w] || 0) + 1;
  });

  const vec = vocab.map((term) => freq[term] || 0);
  // Normalize vector
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return mag > 0 ? vec.map((v) => v / mag) : vec;
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
      targetId: 'DOOR_game',
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
      targetId: 'shelf',
      text: `Achievement Award: ${a.title} (${a.date}). Summary: ${a.summary}`
    });
  });

  // 6. Profile & FAQ markdown
  const profileRaw = fs.readFileSync(path.join(contentDir, 'profile.md'), 'utf-8');
  chunks.push({
    id: 'profile-bio',
    sourceId: 'profile',
    type: 'profile',
    title: 'Zarina Iqbal Buriro Profile & Bio',
    targetId: 'mirror',
    text: profileRaw
  });

  const faqRaw = fs.readFileSync(path.join(contentDir, 'faq.md'), 'utf-8');
  chunks.push({
    id: 'profile-faq',
    sourceId: 'faq',
    type: 'faq',
    title: 'FAQ and Q&A',
    targetId: 'companion',
    text: faqRaw
  });

  // Build vocabulary
  const vocabSet = new Set<string>();
  chunks.forEach((c) => {
    const words = c.text.toLowerCase().match(/\b[a-z0-9_-]+\b/g) || [];
    words.forEach((w) => {
      if (w.length > 2) vocabSet.add(w);
    });
  });
  const vocab = Array.from(vocabSet);

  // Compute vectors
  chunks.forEach((c) => {
    c.vector = textToVector(c.text, vocab);
  });

  const indexPayload = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    chunkCount: chunks.length,
    vocabSize: vocab.length,
    vocab,
    chunks
  };

  const outputPath = path.join(serverDataDir, 'index.json');
  fs.writeFileSync(outputPath, JSON.stringify(indexPayload, null, 2), 'utf-8');
  console.log(`✅ Ingested ${chunks.length} chunks into: ${outputPath}`);
}

runIngest().catch((err) => {
  console.error('❌ Ingestion failed:', err);
  process.exit(1);
});
