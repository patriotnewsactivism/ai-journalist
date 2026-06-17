import type { NextApiRequest, NextApiResponse } from "next";
import { generateJournalistResponse, extractStoryContext } from "@/lib/gemini";
import { textToSpeech } from "@/lib/deepgram";
import { JOURNALISTS, buildInterviewPrompt, getOpeningPrompt } from "@/agents/journalist";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    journalistId,
    storyTitle,
    storyContext,
    history,
    isOpening,
    ttsEnabled,
  } = req.body;

  const journalist = JOURNALISTS.find(j => j.id === journalistId);
  if (!journalist) return res.status(400).json({ error: "Unknown journalist" });

  try {
    const prompt = isOpening
      ? getOpeningPrompt(journalist, storyTitle || "Untitled Story", storyContext || "")
      : buildInterviewPrompt(journalist, storyContext || "", storyTitle || "Untitled Story", history || []);

    const text = await generateJournalistResponse(prompt);

    let audioBase64: string | null = null;
    if (ttsEnabled && text) {
      const audioBuffer = await textToSpeech(text, journalist.voiceId);
      audioBase64 = Buffer.from(audioBuffer).toString("base64");
    }

    res.status(200).json({ text, audioBase64, voiceId: journalist.voiceId });
  } catch (err: any) {
    console.error("Interview respond error:", err);
    res.status(500).json({ error: err.message });
  }
}
