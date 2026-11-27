// POST /api/interview/anam-tts
// Cartesia Sonic TTS for the Anam live avatar, streamed as RAW PCM
// (pcm_s16le, 16 kHz, mono) — the exact format the Anam audio input
// stream expects. The browser feeds each chunk straight to Anam via
// sendAudioChunk(); the audio is NEVER played in the browser.
//
// This deliberately does NOT reuse lib/cartesia.ts textToSpeech():
// that returns mp3 (44.1 kHz), which Anam cannot lip-sync. Same
// Cartesia voice, same API — raw PCM output instead.
//
// Body: { "text": string, "voiceId"?: string, "model"?: string }
//   voiceId defaults to the real Marcus Cole voice; callers pass the
//   selected journalist's voiceId (agents/journalist.ts).
//   model defaults to "sonic-2" — the model this app already speaks
//   its journalist voices with. "sonic-3.6" may be passed instead;
//   verify per voice before switching a persona to it.
// Response: 200 with Content-Type application/octet-stream, raw PCM
// bytes streamed as Cartesia generates them.
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" }, responseLimit: false },
};

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    text,
    voiceId = "90b23757-5627-4884-96c0-afaec5cdd279",
    model = "sonic-2",
  } = req.body ?? {};
  if (!text?.trim()) return res.status(400).json({ error: "text required" });

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "CARTESIA_API_KEY not configured on the server" });
  }

  try {
    // Cartesia REST API directly, so the raw PCM stream can be piped
    // to the browser chunk by chunk as it is generated.
    const ttsRes = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Cartesia-Version": "2024-06-10",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript: stripMarkdown(text),
        model_id: model,
        voice: { id: voiceId },
        output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: 16000 },
        language: "en",
      }),
    });

    if (!ttsRes.ok || !ttsRes.body) {
      const errText = await ttsRes.text().catch(() => "");
      return res
        .status(500)
        .json({ error: `Cartesia TTS error: ${ttsRes.status} — ${errText}`.slice(0, 300) });
    }

    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
    });
    const reader = ttsRes.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
    } finally {
      res.end();
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || "Anam TTS failed" });
    } else {
      res.end();
    }
  }
}
