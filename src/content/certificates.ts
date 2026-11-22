import achievements from '../../content/achievements.json';
import type { ViewerImage } from '../ui/imageViewer';

export interface Certificate {
  id: string;
  title: string;
  issuer: string;
  summary: string;
  image?: string;
  thumb?: string;
  verifyUrl?: string;
}

type Raw = { id: string; title: string; date: string; summary: string; image?: string; verifyUrl?: string };

/** Certificates (entries whose id starts with "cert-") with their scans and verify links. */
export const certificates: Certificate[] = (achievements as Raw[])
  .filter((a) => a.id.startsWith('cert-'))
  .map((a) => ({
    id: a.id,
    title: a.title,
    issuer: a.date,
    summary: a.summary,
    image: a.image,
    thumb: a.image?.replace(/\.webp$/, '-thumb.webp'),
    verifyUrl: a.verifyUrl
  }));

export const certificateImages: (ViewerImage & { id: string })[] = certificates
  .filter((c) => c.image)
  .map((c) => ({
    id: c.id,
    src: c.image!,
    title: c.title,
    caption: `${c.issuer}. ${c.summary}`,
    link: c.verifyUrl,
    linkLabel: c.verifyUrl ? 'Verify on Coursera' : undefined
  }));

/** Event payload that opens the lightbox on one certificate, with the rest one arrow-key away. */
export function certificateViewerArg(id: string): { items: ViewerImage[]; index: number } {
  const index = Math.max(0, certificateImages.findIndex((c) => c.id === id));
  return { items: certificateImages, index };
}
