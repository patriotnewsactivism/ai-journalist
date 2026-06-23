# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint via next lint
```

No test suite is configured.

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Gemini 2.5 Flash — interview brain |
| `DEEPGRAM_API_KEY` | Yes | STT (Nova-3) + TTS (Aura-2) |
| `NEXT_PUBLIC_DID_CLIENT_KEY` | Optional | D-ID streaming avatar (client-side) |
| `NEXT_PUBLIC_DID_AGENT_ID` | Optional | D-ID Agent ID (client-side) |

Without D-ID keys the app uses the animated SVG avatar + Deepgram TTS. With D-ID keys a real WebRTC video journalist becomes available in-studio.

## Architecture

**Next.js 14 Pages Router** — no App Router. All pages are under `pages/`, API routes under `pages/api/`.

### Interview flow (3 stages)

`pages/index.tsx` owns stage state: `"setup" → "studio" → "summary"`.

1. **Setup** — journalist picker + `DocumentUploader` → calls `/api/interview/extract-context` → Gemini extracts a story brief from uploaded docs.
2. **Studio** — `InterviewStudio` is the main experience; it manages the entire session state.
3. **Summary** — `InterviewSummary` calls `/api/interview/summary` → Gemini generates headline, lead, quotes, next steps.

### Journalist agent (`agents/journalist.ts`)

Defines `JOURNALISTS` (3 profiles), `JournalistProfile`, `Message`, `InterviewSession` types, and two prompt builders:
- `getOpeningPrompt()` — used for the journalist's first turn
- `buildInterviewPrompt()` — used for all subsequent turns; includes full conversation history

### API routes

| Route | Does |
|---|---|
| `POST /api/interview/respond` | Calls Gemini → generates journalist text, optionally calls Deepgram TTS → returns `{ text, audioBase64 }` |
| `POST /api/interview/transcribe` | Receives `multipart/form-data` audio, forwards to Deepgram Nova-3, returns `{ transcript }` |
| `POST /api/interview/extract-context` | Receives document text + story title, calls `extractStoryContext()`, returns story brief |
| `POST /api/interview/summary` | Receives final transcript, calls `generateInterviewSummary()`, returns formatted brief |

### Voice pipeline

User audio → `MediaRecorder (audio/webm)` → `/api/interview/transcribe` → Deepgram Nova-3 → text → appended to history → `/api/interview/respond` → Gemini 2.5 Flash → journalist text → Deepgram Aura-2 TTS → base64 mp3 played via `<audio>` element.

Two mic modes in `InterviewStudio`:
- **Push-to-talk** — `onMouseDown/onMouseUp` starts/stops `MediaRecorder`
- **Hands-free** — `AudioContext` + `AnalyserNode` VAD loop (`runVAD`); auto-starts recording after `VAD_MIN_SPEECH_MS = 600ms` of audio above threshold, auto-stops after `VAD_SILENCE_MS = 1800ms` of silence

### D-ID video journalist (`components/VideoJournalist.tsx`)

Loaded via `next/dynamic` with `ssr: false` because it uses browser WebRTC APIs. Exposed via `forwardRef` with a `VideoJournalistHandle` imperative API (`connect`, `speak`, `disconnect`). When D-ID is active, `InterviewStudio` calls `didRef.current.speak(text)` instead of playing the Deepgram audio; Deepgram audio is still generated as a fallback.

### Session audio recording (`hooks/useSessionRecorder.ts`)

Mixes mic stream + journalist `<audio>` element into a single `AudioContext` destination node, records via `MediaRecorder`, and produces a `.webm` download. Session recording is opt-in (toolbar icon) and starts on the first mic press.

### Styling

Dark "broadcast studio" theme via Tailwind custom colors (`studio-dark`, `studio-panel`, `studio-card`, `studio-border`, `studio-accent`, `studio-red`, `studio-muted`). Fonts: `Inter` (sans) and `Playfair Display` (display/headings via `font-display` class).
