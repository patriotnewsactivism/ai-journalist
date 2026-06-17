import type { NextApiRequest, NextApiResponse } from "next";
import { generateInterviewSummary } from "@/lib/gemini";
import { JOURNALISTS } from "@/agents/journalist";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { transcript, storyTitle, journalistId } = req.body;
  const journalist = JOURNALISTS.find(j => j.id === journalistId);

  try {
    const summary = await generateInterviewSummary(
      transcript,
      storyTitle || "Untitled",
      journalist?.name || "AI Journalist"
    );
    res.status(200).json({ summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
