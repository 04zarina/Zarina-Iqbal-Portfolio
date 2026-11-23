# "Little Game Room" — Interactive 3D Web Portfolio

> A cozy, toy-like, pastel 3D game developer portfolio built with Three.js, featuring an avatar, arcade cabinets, an AI companion cat, a demo reel TV, a mailbox contact system, and a 2D classic view fallback.

---

## 🌟 Highlights & Features

- **Cozy Diorama Rooms (Module 1):**
  - **Bedroom Hub:** Starting area featuring a desk, day/dusk lamp switcher, CRT TV with tape slot, heart mailbox, mirror, trophy shelf, and doors to other rooms.
  - **Arcade Room:** 5 big cabinets for the featured games plus 9 mini cabinets for the side projects, all with animated screens.
  - **Greenhouse Balcony:** Skill garden in five raised beds. Pick up the watering can and water a bed: each plant grows and pops a "+ skill" label.
  - **Study Hub:** Cork board with the certificate scans (click to view full size, Google AI Essentials has a verify link), sticky notes for each section, a big More Projects board and the resume on the desk.
  - **Dev Realm:** Floating sky island through the wardrobe portal, with fireflies, the mailbox, and **Fetch with Zuzu**, a quick five-throw mini game, in a tidy layout with a plaza, a grove, a picnic spot and a starry sky.
  - Themed, labelled doors that swing open as you approach, rugs, seats (sofas, armchairs, chairs, the bed, a log) and night-mode lighting in every room.
- **Interactive Avatar (Module 2):**
  - Wakes up in bed, sits up, stretches, walks to the camera and waves on start.
  - The static T-pose GLB is animated with a small vertex-shader rig (`src/world/avatar/rig.ts`): arms rest at her sides, arms and legs swing while walking, she sits on chairs and waves (H or 👋).
  - Orbit camera: drag to look around, scroll to zoom, F to see her face, Q/R to rotate. The camera follows behind her like a third-person game. Furniture between the camera and her fades out.
  - Click the floor to walk there (grid A* path-finding around furniture, `src/world/nav.ts`). In Auto walk mode the room buttons make her walk to the right door herself.
  - Click her to make her react, click Zuzu to pet him. Sit on any sofa or chair with E.
  - Desktop keyboard controls (WASD, Arrows, Shift, Space, E) + Mobile virtual touch joystick and action button.
  - Mouse interaction: click sticky notes, project cards, plants, photos, the resume and the tape.
- **Promo Video Showcase (Module 3):**
  - Pick up the cassette tape in the bedroom and insert it into the vintage TV to watch the promo video reel.
- **RAG-Powered AI Chatbot (Module 4):**
  - **Zuzu**, the companion red panda, appears when you press "Ask Zuzu" and answers questions about Zarina using retrieval over the portfolio content.
  - Pipeline: `npm run ingest` chunks `content/` (projects, skills, education, experience, achievements, profile and FAQ by heading) into a TF-IDF vector index (`server-data/index.json`). `/api/chat` retrieves the top 5 chunks (cosine similarity blended with BM25), sends them as numbered sources to Google Gemini, and returns the answer with `[n]` citations and source chips.
  - Guardrails: answers only from the sources, says so when it doesn't know, per-IP rate limit, 500-character question limit. Answers come from Google Gemini. Without `GEMINI_API_KEY` it answers by quoting the best source.
- **Mailbox Contact System (Module 5):**
  - Mailbox letter modal (and the `/classic` form) with front-end and zod back-end validation, time-trap, honeypot, per-IP rate limit, and delivery through Brevo. Clear success and error states, with a mailto fallback if sending fails.
- **2D Classic View Fallback:**
  - A clean, accessible 2D portfolio at `/classic` with search, project tags, and dark/light mode.
- **Performance Optimized:**
  - Production JS bundle is only **~176 KB gzipped**. Runs at a smooth 60 FPS on desktop and mobile.

---

## 🛠️ Tech Stack

- **Build Tool:** Vite + TypeScript
- **3D Graphics:** Three.js (vanilla, no React Three Fiber overhead)
- **Audio:** Web Audio API procedural synthesizer
- **Validation:** Zod
- **Testing:** Vitest
- **Vector Ingestion & RAG:** Node.js, vector similarity indexing in `server-data/index.json`
- **Backend API:** Vercel serverless functions (`api/chat.ts`, `api/contact.ts`)

---

## 🚀 Quick Start & Installation

### 1. Clone & Install
```bash
# Clone the repository
git clone https://github.com/your-username/little-game-room-portfolio.git
cd little-game-room-portfolio

# Install dependencies
npm install
```

### 2. Ingest Content & Validate
```bash
# Validate all content files in /content
npm run validate:content

# Build the RAG vector index
npm run ingest
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser!
- Add `?debug=1` to inspect real-time FPS, quality tier, and DPR.
- Add `?greybox=1` to force grey-box placeholder mode.

---

## 📜 Available NPM Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `vite` | Starts local dev server at port 3000 |
| `npm run build` | `tsc && vite build` | Type-checks and creates production build in `dist` |
| `npm run preview` | `vite preview` | Previews the production build locally |
| `npm run ingest` | `tsx scripts/ingest.ts` | Chunks `/content` and generates `server-data/index.json` |
| `npm run validate:content` | `tsx scripts/validateContent.ts` | Validates all JSON/Markdown content using Zod |
| `npm test` | `vitest run` | Runs unit tests for schemas, vectors, and contact validation |

---

## 📂 Project Structure

```
/
├─ api/                          # Vercel Serverless Functions
│  ├─ chat.ts                    # POST /api/chat (RAG retrieval)
│  └─ contact.ts                 # POST /api/contact (Mailbox delivery)
├─ content/                      # Single Source of Truth
│  ├─ profile.md                 # Bio, name, socials, tagline
│  ├─ projects.json              # 5 arcade cabinet games
│  ├─ skills.json                # Skill categories for greenhouse
│  ├─ education.json             # Degrees and certifications
│  ├─ experience.json            # Internship & work history
│  ├─ achievements.json          # Trophies for the shelf & journal
│  └─ faq.md                     # Knowledge base for Zuzu
├─ scripts/
│  ├─ ingest.ts                  # Vector index generator
│  └─ validateContent.ts         # Zod content schema validator
├─ server-data/
│  └─ index.json                 # Generated vector database
├─ public/
│  └─ models/
│     └─ companion/              # Hanini Red Panda 3D model
├─ src/
│  ├─ main.ts                    # App bootstrap
│  ├─ assets/manifest.ts         # Asset loader manifest
│  ├─ core/                      # Renderer, loop, store, events, quality
│  ├─ world/                     # Avatar, companion, rooms, cameras, fx
│  ├─ ui/                        # HUD, modals, project cards, chat, journal
│  ├─ audio/                     # Web Audio procedural engine
│  └─ classic/                   # 2D fallback page (/classic)
├─ tests/                        # Vitest unit tests
├─ docs/                         # Architecture, RAG, Credits, Progress
├─ .env.example
└─ vercel.json
```

---

## 🎨 How to Customize & Add Projects

### 1. Replacing Personal Info
All personal details live inside `/content/`:
- Edit `content/profile.md` to change your name, role, bio, and social links.
- Edit `content/projects.json` to customize the games displayed on the 5 arcade cabinets.
- Edit `content/skills.json` to customize the greenhouse plants.
- Edit `content/education.json` and `content/experience.json` to update the study corkboard.
After editing any file in `/content`, simply run:
```bash
npm run validate:content
npm run ingest
```

### 2. Swapping 3D Models
All 3D models can be swapped without code changes via `src/assets/manifest.ts`:
- Place your exported Blender GLB file in `public/models/` (e.g. `public/models/avatar.glb`).
- Update `src/assets/manifest.ts` with the path.
- If a custom model is not found, the built-in procedural Three.js generator seamlessly takes over!

---

## 🦴 Rigging the avatar in Mixamo (optional)

The avatar works today with the built-in GPU rig. A real skeleton gives nicer animation; Mixamo needs an Adobe sign-in, so these steps are done by hand:

1. In Blender: File > Import > glTF, pick `public/models/avatar/avatar_new.glb` (or the full-quality original from git history). File > Export > FBX (Path mode: Copy, Embed textures on).
2. Go to mixamo.com, sign in, Upload Character, choose the FBX. Place the markers (chin, wrists, elbows, knees, groin) and let it auto-rig.
3. Download these animations (FBX, 30 fps). The first one **With Skin**, the rest **Without Skin**: Idle, Walking, Running, Waving, Sitting Idle, Sleeping (or Laying Idle), Getting Up (stand up), Petting / Kneeling, Cheering, Button Pushing.
4. Back in Blender, import the skinned FBX, then import each other FBX and push its action onto the same armature (NLA editor), naming each action after its clip (`Idle`, `Walk`, `Run`, `Wave`, `Sit`, `Sleep`, `Wake`, `Pet`, `Cheer`, `Reach`).
5. Export one GLB with all actions to `public/models/avatar/avatar_rigged.glb` (enable Animation, and Compression if you like).
6. Set `RIGGED_AVATAR_URL = '/models/avatar/avatar_rigged.glb'` in `src/world/avatar/mixamo.ts`. Clips are matched by name, so close names like "Waving" also work.

## 🔒 Environment Variables (`.env.example`)

Secrets live only in Vercel environment variables, never in the repo.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `BREVO_API_KEY` | Contact form email | From app.brevo.com > SMTP & API > API Keys |
| `CONTACT_TO_EMAIL` | Optional | Where letters arrive (defaults to zarinaiqbal04@gmail.com) |
| `CONTACT_FROM_EMAIL` | Optional | A sender verified in Brevo (defaults to CONTACT_TO_EMAIL) |
| `GEMINI_API_KEY` | Chatbot answers | From aistudio.google.com > Get API key |
| `GEMINI_MODEL` | Optional | Comma list tried in order, defaults to `gemini-3.8-flash,gemini-flash-latest,gemini-flash-lite-latest` |

After changing anything in `content/`, run `npm run ingest` and commit `server-data/index.json`.

---

## 📜 Credits & License

- **Companion 3D Model:** "Hanini red panda" by **Amonii0** (https://sketchfab.com/Amonii0) licensed under [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/).
- **Fonts:** Fredoka & Nunito (SIL Open Font License).
- **Code:** Licensed under the MIT License.
