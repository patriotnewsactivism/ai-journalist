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
| `GROQ_API_KEY` | Yes | Groq (llama-3.3-70b-versatile) — interview brain |
| `DEEPGRAM_API_KEY` | Yes | STT only (Nova-3) |
| `ELEVENLABS_API_KEY` | Yes | TTS (eleven_turbo_v2_5) — journalist voices |
| `NEXT_PUBLIC_DID_CLIENT_KEY` | Optional | D-ID streaming avatar (client-side) |
| `NEXT_PUBLIC_DID_AGENT_ID` | Optional | D-ID Agent ID (client-side) |

Without D-ID keys the app uses the animated SVG avatar + ElevenLabs TTS. With D-ID keys a real WebRTC video journalist becomes available in-studio.

> `lib/gemini.ts` is the LLM module but now calls Groq, not Gemini — the filename is historical.
> `lib/deepgram.ts` still exists but is now used only for STT (`speechToText`). TTS is handled by `lib/elevenlabs.ts`.

## Architecture

**Next.js 14 Pages Router** — no App Router. All pages are under `pages/`, API routes under `pages/api/`.

### Interview flow (3 stages)

`pages/index.tsx` owns stage state: `"setup" → "studio" → "summary"`.

1. **Setup** — journalist picker + `DocumentUploader` → calls `/api/interview/extract-context` → Groq extracts a story brief from uploaded docs.
2. **Studio** — `InterviewStudio` is the main experience; it manages the entire session state.
3. **Summary** — `InterviewSummary` calls `/api/interview/summary` → Groq generates headline, lead, quotes, next steps.

### Journalist agent (`agents/journalist.ts`)

Defines `JOURNALISTS` (3 profiles — Morgan Chase, Alex Rivers, Diana Wells), `JournalistProfile`, `Message`, `InterviewSession`, and `EmotionalState` types, plus two prompt builders:
- `getOpeningPrompt()` — journalist's first turn
- `buildInterviewPrompt()` — all subsequent turns; includes full history, emotional tone injection (`EMOTIONAL_INSTRUCTIONS`), and an interrupt-acknowledgment note when `wasInterrupted=true`

### API routes

| Route | Does |
|---|---|
| `POST /api/interview/respond` | Calls Groq → generates journalist text, optionally calls ElevenLabs TTS (for D-ID mode only) → returns `{ text, audioBase64 }` |
| `POST /api/interview/tts` | Sentence-level TTS endpoint — strips markdown, calls ElevenLabs eleven_turbo_v2_5 via `lib/elevenlabs.ts`, returns `{ audioBase64 }` |
| `POST /api/interview/transcribe` | Receives `multipart/form-data` audio, forwards to Deepgram Nova-3, returns `{ transcript }` |
| `POST /api/interview/extract-context` | Receives document text + story title, calls `extractStoryContext()`, returns story brief |
| `POST /api/interview/summary` | Receives final transcript, calls `generateInterviewSummary()`, returns formatted brief |

### Voice pipeline

User audio → `MediaRecorder` → `/api/interview/transcribe` → Deepgram Nova-3 (STT) → text → appended to history → `/api/interview/respond` → Groq llama-3.3-70b → journalist text → **sentence-pipelined TTS** via `/api/interview/tts` → ElevenLabs eleven_turbo_v2_5 → base64 mp3 played in sequence via `<audio>` element.

**Sentence-pipelined TTS** (`InterviewStudio.tsx`): `splitIntoSentences()` splits journalist text at sentence boundaries (abbreviation-aware), then all TTS requests fire in parallel (`/api/interview/tts`), and audio chunks are played sequentially. This dramatically reduces time-to-first-audio. Server-side TTS via `/api/interview/respond` is only used in D-ID video mode.

**Interruptibility**: while the journalist is speaking, the VAD loop continues monitoring RMS. If the user's voice exceeds `INTERRUPT_THRESHOLD = 38` (RMS×100) for at least `MIN_SPEAK_BEFORE_INTERRUPT_MS = 1500ms` into the journalist's turn, `handleInterrupt()` fires — pauses audio, sets `wasInterrupted=true`, and the next journalist prompt opens with a natural acknowledgment line.

Two mic modes in `InterviewStudio`:
- **Push-to-talk** — `onMouseDown/onMouseUp` starts/stops `MediaRecorder`
- **Hands-free** — `AudioContext` + `AnalyserNode` VAD loop (`runVAD`); auto-starts recording above `VAD_SPEECH_THRESHOLD = 10`, auto-stops after `VAD_SILENCE_MS = 2800ms` of silence; resumes with `VAD_RESUME_DELAY_MS = 600ms` delay after journalist finishes

### Emotional state system

`deriveEmotionalState()` in `InterviewStudio` scans the story title + document context with keyword regexes and returns one of four `EmotionalState` values: `"neutral" | "investigative" | "empathetic" | "urgent"`. This state is:
- Injected into the journalist prompt via `EMOTIONAL_INSTRUCTIONS` in `agents/journalist.ts`
- Reflected visually — avatar glow color changes, and a status badge appears in the top bar

### D-ID video journalist (`components/VideoJournalist.tsx`)

Loaded via `next/dynamic` with `ssr: false` (uses browser WebRTC APIs). Exposed via `forwardRef` with a `VideoJournalistHandle` imperative API (`connect`, `speak`, `disconnect`). When D-ID is active, `InterviewStudio` calls `didRef.current.speak(text)` instead of the sentence-pipelined TTS; the server-side ElevenLabs audio is kept as a fallback.

### Animated SVG avatar (`components/JournalistAvatar.tsx`)

Used when D-ID is inactive. Renders inline SVG per `avatarStyle`, with:
- **Lip animation** (`requestAnimationFrame` while `isSpeaking`)
- **Blinking** (random 2.5–6s interval, 120ms blink duration)
- **Breathing** (subtle vertical sine-wave oscillation)
- **Emotional glow** — ring color reflects `emotionalState`
- **Waveform overlay** while speaking

### Session recording

Three independent tracks are managed in `InterviewStudio`:
- **Journalist audio** — captured via `AudioContext` destination node that intercepts the `<audio>` element output
- **User video** — optional webcam + mic via `MediaRecorder` on the webcam stream
- **Full mixed session** (`hooks/useSessionRecorder.ts`) — mixes mic stream + journalist audio element into a single `AudioContext` destination, produces a `.webm` download

### Styling

Dark "broadcast studio" theme via Tailwind custom colors (`studio-dark`, `studio-panel`, `studio-card`, `studio-border`, `studio-accent`, `studio-red`, `studio-muted`). Fonts: `Inter` (sans) and `Playfair Display` (display/headings via `font-display` class). CSS animations `rec-ring`, `ticker-inner`, and `crt` are defined in global styles.
