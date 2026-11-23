// Single source for profile details shown in the UI.
// Keep in sync with content/profile.md (which feeds the Zuzu chat index).
export const profile = {
  name: 'Zarina Iqbal Buriro',
  shortName: 'Zarina',
  role: 'Game Developer',
  education: 'Computer Science Undergraduate, NED University of Engineering and Technology',
  tagline:
    'I build gameplay systems, UI and interactions in Unreal Engine 5, Unity and Three.js, from VR escape rooms to browser games.',
  availability: 'Open to game development, game programming and interactive 3D roles and internships.',
  currently: 'Interning at Aerox ERP on web and 3D interactions, final year at NED University.',
  about: [
    "I'm Zarina, a Computer Science undergrad at NED University, specializing in Gaming & Animation. I build gameplay systems, UI and interactions in Unreal Engine 5 and Unity3D, with a chunk of that work in VR and full gameplay loops built both solo and in teams.",
    "Outside pure development, I've worked through the production pipeline too: story and storyboarding for an original short, and motion graphics in After Effects. That range means I understand pacing and feel, not just code."
  ],
  leadership:
    "Beyond code, I am active in campus life. I have been part of the GameVerse society's events and logistics team and hosted its flagship event, GameCon, at both editions. I was a member of SENTEC for a year, also part of the organizing team for the MPERC event. Hosting in front of a live audience has made public speaking one of my strongest skills.",
  community: [
    {
      src: '/images/community/gamecon25.webp',
      title: "Hosting NED GameCon'25",
      caption: "Hosting GameVerse's flagship event on stage at TechFest'25."
    },
    {
      src: '/images/community/gamecon26.webp',
      title: "Hosting NED GameCon'26",
      caption: 'Back at the podium to host the second edition of GameCon.'
    },
    {
      src: '/images/community/luth-gamecon26.webp',
      title: "Light Up The House at GameCon'26",
      caption: "Our UE5 game, Light Up The House, presented as a GameCon'26 entry.",
      projectId: 'light-up-the-house'
    }
  ] as { src: string; title: string; caption: string; projectId?: string }[],
  email: 'zarinaiqbal04@gmail.com',
  location: 'Karachi, Pakistan',
  resume: '/resume/Zarina_Iqbal_Resume.pdf',
  socials: {
    github: 'https://github.com/04zarina',
    linkedin: 'https://www.linkedin.com/in/zarina-iqbal-97161528a',
    portfolio: 'https://zarinaiqbal.framer.website/'
  },
  showreel: {
    title: 'Light Up The House: Trailer',
    youtubeId: 'd1nB7CZ_fcg',
    /**
     * Promo video from After Effects (course module 3). Drop the export at
     * public/video/promo.mp4 (H.264, under ~15 MB) and set this to '/video/promo.mp4';
     * the TV then plays it instead of the YouTube trailer.
     */
    mp4: '' as string
  }
} as const;

/** Extracts a YouTube video id from youtu.be / youtube.com URLs. */
export function youtubeId(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|[?&]v=)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
