import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const ProjectSchema = z.array(
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    tagline: z.string().min(1),
    year: z.number().int().min(2000).max(2100),
    type: z.string().min(1),
    roles: z.array(z.string().min(1)),
    contributions: z.array(z.string().min(1)),
    description: z.string().min(10),
    tools: z.array(z.string().min(1)),
    teamSize: z.number().int().min(1),
    featured: z.boolean().optional(),
    badge: z.string().optional(),
    collaborators: z.string().optional(),
    images: z.array(z.object({ src: z.string().min(1), alt: z.string().min(1) })).optional(),
    video: z.object({
      src: z.string(),
      poster: z.string(),
      captions: z.string().optional()
    }),
    links: z.record(z.string()).optional(),
    accentColor: z.string(),
    cabinetId: z.string(),
    tags: z.array(z.string())
  })
);

const SkillSchema = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    level: z.number().int().min(1).max(5),
    blurb: z.string().min(5),
    icon: z.string().min(1),
    plantGroup: z.string().optional()
  })
);

const EducationSchema = z.array(
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    org: z.string().min(1),
    start: z.string().min(1),
    end: z.string().min(1),
    summary: z.string().min(5),
    highlights: z.array(z.string()).optional()
  })
);

const ExperienceSchema = z.array(
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    org: z.string().min(1),
    start: z.string().min(1),
    end: z.string().min(1),
    summary: z.string().min(5),
    highlights: z.array(z.string()).optional()
  })
);

const AchievementSchema = z.array(
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    date: z.string().min(1),
    summary: z.string().min(5),
    icon: z.string().min(1)
  })
);

function validate() {
  const contentDir = path.resolve(process.cwd(), 'content');

  console.log('🔍 Validating content files in:', contentDir);

  const projectsRaw = JSON.parse(fs.readFileSync(path.join(contentDir, 'projects.json'), 'utf-8'));
  ProjectSchema.parse(projectsRaw);
  console.log('✅ projects.json validated (' + projectsRaw.length + ' projects)');

  const skillsRaw = JSON.parse(fs.readFileSync(path.join(contentDir, 'skills.json'), 'utf-8'));
  SkillSchema.parse(skillsRaw);
  console.log('✅ skills.json validated (' + skillsRaw.length + ' skills)');

  const eduRaw = JSON.parse(fs.readFileSync(path.join(contentDir, 'education.json'), 'utf-8'));
  EducationSchema.parse(eduRaw);
  console.log('✅ education.json validated (' + eduRaw.length + ' records)');

  const expRaw = JSON.parse(fs.readFileSync(path.join(contentDir, 'experience.json'), 'utf-8'));
  ExperienceSchema.parse(expRaw);
  console.log('✅ experience.json validated (' + expRaw.length + ' records)');

  const achRaw = JSON.parse(fs.readFileSync(path.join(contentDir, 'achievements.json'), 'utf-8'));
  AchievementSchema.parse(achRaw);
  console.log('✅ achievements.json validated (' + achRaw.length + ' achievements)');

  if (!fs.existsSync(path.join(contentDir, 'profile.md'))) {
    throw new Error('profile.md is missing');
  }
  console.log('✅ profile.md exists');

  if (!fs.existsSync(path.join(contentDir, 'faq.md'))) {
    throw new Error('faq.md is missing');
  }
  console.log('✅ faq.md exists');

  console.log('🎉 All content validated successfully!');
}

try {
  validate();
} catch (err) {
  console.error('❌ Validation failed:', err);
  process.exit(1);
}
