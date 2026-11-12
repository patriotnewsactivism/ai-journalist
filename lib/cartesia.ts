// ─────────────────────────────────────────────────
//  Cartesia — TTS (Sonic)
// ─────────────────────────────────────────────────

export async function textToSpeech(
  text: string,
  voiceId: string = "90b23757-5627-4884-96c0-afaec5cdd279",
  model: string = "sonic-2"
): Promise<ArrayBuffer> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error("CARTESIA_API_KEY not set");

  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "Cartesia-Version": "2024-06-10",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transcript: text,
      model_id: model,
      voice: { id: voiceId },
      output_format: { container: "mp3", sample_rate: 44100 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cartesia TTS error: ${res.status} — ${err}`);
  }

  return res.arrayBuffer();
}
