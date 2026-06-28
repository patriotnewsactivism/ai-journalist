import type { NextApiRequest, NextApiResponse } from "next";
import { groqChatJSON } from "@/lib/gemini";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { lastJournalistTurn, storyContext, history = [] } = req.body;

  const recentHistory = history.slice(-4).map((m: any) =>
    `${m.role === "journalist" ? "Journalist" : "Interviewee"}: ${m.content}`
  ).join("\n");

  try {
    const result = await groqChatJSON(
      "You are a journalism assistant. Output only valid JSON — no markdown, no commentary.",
      `Interview context:
Story: ${storyContext || "General interview"}
Recent exchange:
${recentHistory}
Last journalist question: "${lastJournalistTurn}"

Return JSON with exactly these keys:
- "suggestions": array of 3 short natural follow-up answers the interviewee could say (10-20 words each, first-person, conversational — not questions)
- "factCheck": array of 2 brief factual context points relevant to what was asked (one sentence each, journalistic tone)

Example:
{"suggestions":["I witnessed this firsthand when the officer...","The documents clearly show that on March 3rd...","What concerns me most is the pattern of..."],"factCheck":["Section 1983 claims require showing a constitutional violation under color of state law.","Similar civil rights cases in this circuit have averaged $140,000 in settlements."]}`
    );

    res.status(200).json({
      suggestions: Array.isArray(result.suggestions) ? result.suggestions.slice(0, 3) : [],
      factCheck: Array.isArray(result.factCheck) ? result.factCheck.slice(0, 3) : [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, suggestions: [], factCheck: [] });
  }
}
