# "Little Game Room" — Interactive 3D Web Portfolio

> A cozy, toy-like, pastel 3D game developer portfolio built with Three.js, featuring an avatar, arcade cabinets, an AI companion cat, a demo reel TV, a mailbox contact system, and a 2D classic view fallback.

---

## 🌟 Highlights & Features

- **Cozy Diorama Rooms (Module 1):**
  - **Bedroom Hub:** Starting area featuring a desk, day/dusk lamp switcher, CRT TV with tape slot, heart mailbox, mirror, trophy shelf, and doors to other rooms.
  - **Arcade Room:** 5 pastel arcade cabinets (one per game) with animated screens and "Insert Coin" interaction.
  - **Greenhouse Balcony:** Skill plants (Engines, Languages, Web, 3D & Animation, Tools) that wobble and burst with sparkles when watered.
  - **Study Nook:** Pinned corkboard timeline of education and career experience, reading armchair, and bookshelf.
  - **Dev Realm:** Secret floating sky island finale accessible through the wardrobe portal!
- **Interactive Avatar (Module 2):**
  - Cute chibi character with walking bob, run lean, happy hops, and idle quirks.
  - Desktop keyboard controls (WASD, Arrows, Shift, Space, E) + Mobile virtual touch joystick and action button.
- **Promo Video Showcase (Module 3):**
  - Pick up the cassette tape in the bedroom and insert it into the vintage TV to watch the promo video reel.
- **RAG-Powered AI Chatbot (Module 4):**
  - **Mochi**, the companion red panda, follows you around the studio and answers questions about your work, skills, and background using vector-indexed content.
  - Anti-hallucination guardrails and source citation chips that navigate the 3D world when clicked!
- **Mailbox Contact System (Module 5):**
  - Mailbox letter modal with input validation, time-trap, honeypot spam protection, and email delivery adapters.
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
│  └─ faq.md                     # Knowledge base for Mochi
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

## 🔒 Environment Variables (`.env.example`)

```env
# Mailbox Delivery
MAIL_PROVIDER=resend
RESEND_API_KEY=re_your_api_key_here
CONTACT_TO_EMAIL=your.email@example.com
CONTACT_FROM_EMAIL="Portfolio <onboarding@resend.dev>"

# RAG & AI Chatbot
EMBEDDING_PROVIDER=gemini
LLM_PROVIDER=gemini
GEMINI_API_KEY=
OPENAI_API_KEY=
```

---

## 📜 Credits & License

- **Companion 3D Model:** "Hanini red panda" by **Amonii0** (https://sketchfab.com/Amonii0) licensed under [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/).
- **Fonts:** Fredoka & Nunito (SIL Open Font License).
- **Code:** Licensed under the MIT License.
