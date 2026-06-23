import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "DEEPGRAM_API_KEY is not configured." });

  const form = formidable({ maxFileSize: 25 * 1024 * 1024 });

  form.parse(req, async (err, _fields, files) => {
    if (err) return res.status(400).json({ error: err.message });

    const audioFile = Array.isArray(files.audio) ? files.audio[0] : files.audio;
    if (!audioFile) return res.status(400).json({ error: "No audio file" });

    try {
      const audioBuffer = await fs.promises.readFile(audioFile.filepath);
      const mimeType = audioFile.mimetype || "audio/webm";

      const dgRes = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&language=en",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": mimeType,
          },
          body: audioBuffer,
        }
      );

      if (!dgRes.ok) {
        const errText = await dgRes.text();
        const status = dgRes.status === 401 || dgRes.status === 403 ? dgRes.status : 500;
        return res.status(status).json({ error: `Deepgram error ${dgRes.status}: ${errText}` });
      }

      const data = await dgRes.json();
      const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
      res.status(200).json({ transcript });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
