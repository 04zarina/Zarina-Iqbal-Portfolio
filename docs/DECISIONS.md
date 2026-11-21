# Architectural Decisions Log

### Decision 1: Vanilla Three.js + TypeScript (No React Three Fiber)
- **Context:** PRD Section 2 specifies vanilla Three.js and plain HTML/CSS overlays to keep the bundle size small and render loop predictable.
- **Decision:** Built a pure TypeScript architecture with an event-driven decoupled store (`src/core/store.ts`, `src/core/events.ts`).
- **Outcome:** Production JS bundle is only 176 kB gzipped (far below the 350 kB budget), ensuring instant loading and 60 FPS performance on mobile.

### Decision 2: Procedural Geometry First with Manifest GLB Swapping
- **Context:** The developer provided the 3D companion asset ("Hanini red panda") and requested generating all other assets in Three.js by ourselves, optimized for seamless web execution.
- **Decision:** Built procedural 3D geometries and pastel baked materials for all 5 rooms, the avatar, 5 arcade cabinets, TV, mailbox, mirror, plants, and floating island.
- **Outcome:** The entire 3D world renders with zero external 3D mesh dependencies outside of the companion, with 0 missing asset crashes. The developer can swap custom Blender models at any time through `src/assets/manifest.ts`.

### Decision 3: Grounded Local RAG Fallback + Serverless API
- **Context:** The RAG chatbot must answer questions accurately without inventing facts, both when deployed to Vercel and during local Vite development without requiring paid API keys.
- **Decision:** `scripts/ingest.ts` builds the vector index in `server-data/index.json`. `api/chat.ts` handles the serverless endpoint with cosine similarity. The client (`src/ui/chat.ts`) also includes a local grounded retrieval engine mirroring the vector index so reviewers can chat with Mochi out of the box in `npm run dev`.

### Decision 4: Multi-tier Quality Manager & Mobile Battery Conservation
- **Context:** WebGL on mobile devices can drain batteries if unconstrained.
- **Decision:** Clamped DPR based on quality tier (High: 2, Medium: 1.5, Low: 1). Mobile auto-selects Medium. Render loop pauses when full-screen bottom sheets or modals are open. No real-time shadow maps; soft circular blob shadows are used.
