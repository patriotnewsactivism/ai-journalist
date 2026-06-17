# 🎙 AI Journalist Studio — The People's Press

An ultra-realistic AI interview platform where professional AI journalist avatars interview you about your stories, powered by **Gemini 2.5 Flash** (brain) + **Deepgram Nova-3/Aura-2** (voice).

## Features

- **3 AI Journalist Personas** — Morgan Chase (civil rights), Alex Rivers (police misconduct), Diana Wells (legal affairs)
- **Document Upload** — Feed court filings, police reports, depositions. The journalist reads them and asks informed, specific questions
- **Voice Interview** — Hold the mic button to speak, release to send. Deepgram Nova-3 transcribes, journalist responds in real Aura-2 voice
- **Animated Avatars** — SVG avatar that glows and shows waveform when speaking
- **Webcam Support** — See yourself on screen during the interview
- **Post-Interview Brief** — AI generates a broadcast-ready headline, lead paragraph, key quotes, and next steps
- **Full Transcript Download** — Save every word of the interview
- **Breaking News Ticker** — TV broadcast aesthetic throughout

## Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/patriotnewsactivism/ai-journalist
cd ai-journalist
npm install
```

### 2. Set Up API Keys
```bash
cp .env.local.example .env.local
# Edit .env.local with your keys
```

You need:
- **Gemini API Key** — [Get at Google AI Studio](https://aistudio.google.com/)
- **Deepgram API Key** — [Get at Deepgram Console](https://console.deepgram.com/)

### 3. Run
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel
```bash
npm install -g vercel
vercel --prod
```
Add your env vars in the Vercel dashboard under Project Settings → Environment Variables.

## How to Use

1. **Pick your journalist** — each has a different style and specialty
2. **Set the story title** — this frames the whole interview  
3. **Upload documents** (optional) — police reports, court filings, evidence, depositions, articles
4. **Click "Build Story Brief"** — Gemini extracts key facts so the journalist can ask informed questions
5. **Start the interview** — journalist opens with a professional intro and first question
6. **Hold mic to answer** — release when done, transcript is sent automatically
7. **The journalist follows up** in real-time, digging deeper based on your answers
8. **End the interview** — download transcript + generate AI story brief

## Journalist Profiles

| Journalist | Outlet | Specialty | Voice |
|-----------|--------|-----------|-------|
| Morgan Chase | The People's Press | Civil rights, constitutional law | Thalia (warm) |
| Alex Rivers | National Justice Watch | Police misconduct, whistleblowers | Apollo (authoritative) |
| Diana Wells | American Justice Network | Legal strategy, case law | Stella (precise) |

## Architecture

- **Next.js 14** — App framework
- **Gemini 2.5 Flash** — Interview question generation, story extraction, post-interview brief
- **Deepgram Nova-3** — Speech-to-text (your voice → text)
- **Deepgram Aura-2** — Text-to-speech (journalist voice)
- **Tailwind CSS** — Dark studio UI
- **React hooks** — MediaRecorder for voice capture

## Roadmap

- [ ] Video recording of full dual-panel interview (journalist + you)
- [ ] More journalist personas (sports, finance, international)
- [ ] Real talking avatar (HeyGen / D-ID integration)
- [ ] Live AI newsroom with broadcast-ready video output
- [ ] Multi-journalist press conference mode
