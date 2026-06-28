import type { NextApiRequest, NextApiResponse } from "next";
import { groqChatJSON } from "@/lib/gemini";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { transcript, storyTitle } = req.body;
  if (!transcript?.trim()) return res.status(400).json({ error: "transcript required" });

  try {
    const result = await groqChatJSON(
      "You are an expert interview coach. Analyze transcripts and give structured, actionable feedback. Output only valid JSON.",
      `Analyze this interview for story: "${storyTitle}"

TRANSCRIPT:
${transcript}

Score the INTERVIEWEE on each dimension 1–10 and provide feedback.

Return JSON with exactly these keys:
{
  "scores": {
    "clarity": <1-10, how clearly they communicated>,
    "specificity": <1-10, use of names/dates/documents>,
    "confidence": <1-10, assertiveness and composure>,
    "evasiveness": <1-10, lower=more direct, higher=more evasive>
  },
  "overall": "<one sentence overall assessment>",
  "strengths": ["<specific strength 1>", "<specific strength 2>"],
  "improvements": ["<actionable improvement 1>", "<actionable improvement 2>"],
  "bestMoment": "<verbatim quote of their single best answer, under 40 words>"
}`,
      800
    );

    res.status(200).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
