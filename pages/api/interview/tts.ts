import type { NextApiRequest, NextApiResponse } from "next";
import { textToSpeech } from "@/lib/deepgram";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { text, voiceId = "aura-2-thalia-en" } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });

  try {
    const clean = text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`(.*?)`/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .trim();
    const audioBuffer = await textToSpeech(clean, voiceId);
    res.status(200).json({ audioBase64: Buffer.from(audioBuffer).toString("base64") });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
