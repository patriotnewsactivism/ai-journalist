// ─────────────────────────────────────────────────
//  Deepgram — STT (Nova-3) + TTS (Aura-2)
// ─────────────────────────────────────────────────

export async function textToSpeech(
  text: string,
  voiceId: string = "aura-2-thalia-en"
): Promise<ArrayBuffer> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set");

  const res = await fetch(
    `https://api.deepgram.com/v1/speak?model=${voiceId}&encoding=mp3`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Deepgram TTS error: ${res.status} — ${err}`);
  }

  return res.arrayBuffer();
}

export async function speechToText(audioBlob: Blob): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set");

  const arrayBuffer = await audioBlob.arrayBuffer();

  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&language=en",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": audioBlob.type || "audio/webm",
      },
      body: arrayBuffer,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Deepgram STT error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
}
