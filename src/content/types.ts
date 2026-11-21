export interface ProjectImage {
  src: string;
  alt: string;
}

export interface Project {
  id: string;
  title: string;
  tagline: string;
  year: number;
  type: string;
  featured?: boolean;
  badge?: string;
  roles: string[];
  contributions: string[];
  description: string;
  tools: string[];
  teamSize: number;
  collaborators?: string;
  video?: { src: string; poster: string; captions?: string };
  images?: ProjectImage[];
  links?: { play?: string; repo?: string; trailer?: string; video?: string; itch?: string };
  accentColor: string;
  cabinetId: string;
  tags: string[];
}
