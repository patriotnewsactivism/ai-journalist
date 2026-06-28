import type { NextApiRequest, NextApiResponse } from "next";
import { groqChatStream } from "@/lib/gemini";
import { JOURNALISTS, buildInterviewPrompt, getOpeningPrompt, EmotionalState } from "@/agents/journalist";

export const config = { api: { bodyParser: true } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    journalistId, storyTitle, storyContext, history,
    isOpening, emotionalState = "neutral" as EmotionalState, wasInterrupted = false,
  } = req.body;

  const journalist = JOURNALISTS.find(j => j.id === journalistId);
  if (!journalist) return res.status(400).json({ error: "Unknown journalist" });

  const prompt = isOpening
    ? getOpeningPrompt(journalist, storyTitle || "Untitled Story", storyContext || "", emotionalState)
    : buildInterviewPrompt(journalist, storyContext || "", storyTitle || "Untitled Story", history || [], emotionalState, wasInterrupted);

  try {
    // prompt already contains the full persona + document context + history via buildInterviewPrompt/getOpeningPrompt.
    // Pass it as the user turn so document context is not overridden by a bare system message.
    const groqRes = await groqChatStream("", prompt);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (res.socket) res.socket.setTimeout(0);
    res.flushHeaders();

    const reader = groqRes.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") {
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
        try {
          const token = JSON.parse(payload).choices?.[0]?.delta?.content ?? "";
          if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
        } catch {}
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
}
